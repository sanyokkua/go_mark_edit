package file_test

import (
	"bufio"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"reflect"
	"sync"
	"testing"

	"github.com/sanyokkua/go_mark_edit/internal/file"
)

func readRecords(t *testing.T, path string) []string {
	t.Helper()
	f, err := os.Open(path)
	if err != nil {
		t.Fatal(err)
	}
	defer func() {
		if err := f.Close(); err != nil {
			t.Errorf("close recording: %v", err)
		}
	}()
	var records []string
	scanner := bufio.NewScanner(f)
	for scanner.Scan() {
		var s string
		if err := json.Unmarshal(scanner.Bytes(), &s); err != nil {
			t.Fatal(err)
		}
		records = append(records, s)
	}
	if err := scanner.Err(); err != nil {
		t.Fatal(err)
	}
	return records
}

func TestRecordingPortsAppendJSONLines(t *testing.T) {
	for _, kind := range []string{"reveal", "clipboard"} {
		t.Run(kind, func(t *testing.T) {
			path := filepath.Join(t.TempDir(), "missing", "calls.jsonl")
			makeCall := func() func(string) error {
				if kind == "reveal" {
					return file.NewRecordingRevealPort(path).Reveal
				}
				return file.NewRecordingClipboardWriter(path).WriteText
			}
			call := makeCall()
			want := []string{"first", "", "a\nb\r\n雪\\\""}
			for _, s := range want[:2] {
				if err := call(s); err != nil {
					t.Fatal(err)
				}
			}
			if err := makeCall()(want[2]); err != nil {
				t.Fatal(err)
			}
			if got := readRecords(t, path); !reflect.DeepEqual(got, want) {
				t.Fatalf("records = %#v, want %#v", got, want)
			}
		})
	}
}

func TestRecordingPortsReportInvalidParent(t *testing.T) {
	parent := filepath.Join(t.TempDir(), "file")
	if err := os.WriteFile(parent, nil, 0600); err != nil {
		t.Fatal(err)
	}
	path := filepath.Join(parent, "calls.jsonl")
	if err := file.NewRecordingRevealPort(path).Reveal("x"); err == nil {
		t.Fatal("reveal succeeded")
	}
	if err := file.NewRecordingClipboardWriter(path).WriteText("x"); err == nil {
		t.Fatal("clipboard succeeded")
	}
	if err := file.NewRecordingRevealPort(t.TempDir()).Reveal("x"); err == nil {
		t.Fatal("writing to directory succeeded")
	}
}

func TestRecordingPortConcurrentCalls(t *testing.T) {
	path := filepath.Join(t.TempDir(), "calls.jsonl")
	port := file.NewRecordingRevealPort(path)
	var wg sync.WaitGroup
	for i := 0; i < 100; i++ {
		wg.Add(1)
		go func(i int) {
			defer wg.Done()
			if err := port.Reveal(fmt.Sprint(i)); err != nil {
				t.Error(err)
			}
		}(i)
	}
	wg.Wait()
	records := readRecords(t, path)
	seen := map[string]bool{}
	for _, s := range records {
		seen[s] = true
	}
	if len(records) != 100 || len(seen) != 100 {
		t.Fatalf("records=%d unique=%d", len(records), len(seen))
	}
}
