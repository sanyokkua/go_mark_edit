package file

import (
	"bytes"
	"errors"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestReadClassifiedStableBoundsRawHashAndDetectsGrowth(t *testing.T) {
	root := t.TempDir()
	path := filepath.Join(root, "stable.md")
	if err := os.WriteFile(path, []byte("abc"), 0o644); err != nil {
		t.Fatalf("write initial file: %v", err)
	}

	stable, err := ReadClassifiedStable(path, 4)
	if err != nil {
		t.Fatalf("stable read: %v", err)
	}
	if !stable.Stable || stable.RawHash == "" {
		t.Fatalf("stable read = %+v, want stable bounded hash", stable)
	}

	previousHook := stableReadBeforeHashHook
	stableReadBeforeHashHook = func(path string) {
		if err := os.WriteFile(path, []byte("abcde"), 0o644); err != nil {
			t.Fatalf("grow file during stable read: %v", err)
		}
	}
	defer func() { stableReadBeforeHashHook = previousHook }()

	unstable, err := ReadClassifiedStable(path, 4)
	if !errors.Is(err, ErrUnstableRead) || unstable.Stable {
		t.Fatalf("growth race = result=%+v err=%v, want ErrUnstableRead and unstable", unstable, err)
	}
}

func TestReadBoundedDoesNotConsumeBeyondLimit(t *testing.T) {
	const limit int64 = 4
	input := bytes.NewReader([]byte("0123456789"))
	raw, err := readBounded(input, limit)
	if err != nil {
		t.Fatalf("bounded read: %v", err)
	}
	if string(raw) != "0123" {
		t.Fatalf("bounded bytes = %q, want first %d bytes", raw, limit)
	}
}

func TestReadClassifiedDocument(t *testing.T) {
	root := t.TempDir()
	write := func(name string, content []byte) string {
		t.Helper()
		path := filepath.Join(root, name)
		if err := os.WriteFile(path, content, 0o640); err != nil {
			t.Fatalf("write %q: %v", name, err)
		}
		return path
	}

	valid := write("valid.MD", []byte("first\r\nsecond\r\n"))
	read, err := ReadClassifiedDocument(valid)
	if err != nil {
		t.Fatalf("read valid document: %v", err)
	}
	if read.Capability != CapabilityWritable || read.Characteristics.LineEnding != LineEndingCRLF {
		t.Fatalf("valid classification = %+v, want writable CRLF", read)
	}
	if read.Content != "first\nsecond\n" {
		t.Fatalf("canonical content = %q, want LF-normalized content", read.Content)
	}
	if read.Characteristics.Encoding != EncodingUTF8 || read.Characteristics.BOM != BOMAbsent {
		t.Fatalf("valid encoding characteristics = %+v", read.Characteristics)
	}
	if read.Characteristics.Mode.Perm() != 0o640 {
		t.Fatalf("mode = %o, want 640", read.Characteristics.Mode.Perm())
	}

	bom := write("bom.md", append([]byte{0xef, 0xbb, 0xbf}, []byte("bom\n")...))
	bomRead, err := ReadClassifiedDocument(bom)
	if err != nil {
		t.Fatalf("read BOM document: %v", err)
	}
	if bomRead.Characteristics.BOM != BOMPresent || bomRead.Content != "bom\n" {
		t.Fatalf("BOM classification = %+v, content %q", bomRead.Characteristics, bomRead.Content)
	}

	invalid := write("invalid.md", []byte{'a', 0xff, 0xfe, 'b'})
	invalidRead, err := ReadClassifiedDocument(invalid)
	if err != nil {
		t.Fatalf("read invalid UTF-8 document: %v", err)
	}
	if invalidRead.Capability != CapabilityUnsafeReadOnly || invalidRead.Warning != WarningInvalidUTF8 {
		t.Fatalf("invalid UTF-8 classification = %+v", invalidRead)
	}
	if !strings.Contains(invalidRead.Content, "\ufffd") {
		t.Fatalf("invalid UTF-8 display content should be tolerant: %q", invalidRead.Content)
	}

	nul := write("nul.txt", []byte{'a', 0, 'b'})
	nulRead, err := ReadClassifiedDocument(nul)
	if err != nil {
		t.Fatalf("read NUL document: %v", err)
	}
	if nulRead.Capability != CapabilityUnsafeReadOnly || nulRead.Warning != WarningNULByte {
		t.Fatalf("NUL classification = %+v", nulRead)
	}

	unsupported := write("unsupported.pdf", []byte("not markdown"))
	unsupportedRead, err := ReadClassifiedDocument(unsupported)
	if err != nil {
		t.Fatalf("unsupported suffix should return a classified result: %v", err)
	}
	if unsupportedRead.Outcome != ReadOutcomeRefused || unsupportedRead.Error == nil || unsupportedRead.Error.Category != "unsupported-input" {
		t.Fatalf("unsupported suffix result = %+v", unsupportedRead)
	}
	if strings.Contains(unsupportedRead.Error.Message, root) {
		t.Fatalf("unsupported suffix error leaked a private path: %q", unsupportedRead.Error.Message)
	}

	for _, row := range []struct {
		name       string
		size       int64
		capability ReadCapability
		outcome    ReadOutcome
	}{
		{name: "2MiB", size: fixtureSize2MiB, capability: CapabilityWritable, outcome: ReadOutcomeOpened},
		{name: "2MiB+1", size: fixtureSize2MiBPlus1, capability: CapabilityWritable, outcome: ReadOutcomeOpened},
		{name: "10MiB", size: fixtureSize10MiB, capability: CapabilityWritable, outcome: ReadOutcomeOpened},
		{name: "10MiB+1", size: fixtureSize10MiBPlus1, capability: CapabilityLargeReadOnly, outcome: ReadOutcomeOpened},
		{name: "50MiB", size: fixtureSize50MiB, capability: CapabilityLargeReadOnly, outcome: ReadOutcomeOpened},
		{name: "50MiB+1", size: fixtureSize50MiBPlus1, capability: CapabilityRefused, outcome: ReadOutcomeRefused},
	} {
		t.Run(row.name, func(t *testing.T) {
			path := filepath.Join(root, row.name+".md")
			writeRepeatedBytes(t, path, row.size, 'a')
			classified, err := ReadClassifiedDocument(path)
			if err != nil {
				t.Fatalf("read exact size: %v", err)
			}
			if classified.Outcome != row.outcome || classified.Capability != row.capability {
				t.Fatalf("classification = %+v, want outcome=%q capability=%q", classified, row.outcome, row.capability)
			}
			if classified.BytesRead > MaxClassifiedReadBytes {
				t.Fatalf("bytes read = %d, exceeds cap %d", classified.BytesRead, MaxClassifiedReadBytes)
			}
			if classified.Characteristics.RawSizeBytes != row.size {
				t.Fatalf("raw size = %d, want %d", classified.Characteristics.RawSizeBytes, row.size)
			}
			if row.outcome == ReadOutcomeRefused {
				if classified.Error == nil || !strings.Contains(classified.Error.Message, "50 MiB") {
					t.Fatalf("large refusal error = %+v", classified.Error)
				}
				if classified.BytesRead != 0 {
					t.Fatalf("refused file should not be read, got %d bytes", classified.BytesRead)
				}
			}
		})
	}
}

func TestLineEndingClassification(t *testing.T) {
	root := t.TempDir()
	cases := []struct {
		name       string
		content    []byte
		lineEnding LineEnding
		lfCount    int
		crlfCount  int
		first      LineEnding
		capability ReadCapability
		warning    string
	}{
		{name: "lf", content: []byte("one\ntwo\n"), lineEnding: LineEndingLF, lfCount: 2, capability: CapabilityWritable},
		{name: "crlf", content: []byte("one\r\ntwo\r\n"), lineEnding: LineEndingCRLF, crlfCount: 2, capability: CapabilityWritable},
		{name: "mixed", content: []byte("one\ntwo\r\nthree\n"), lineEnding: LineEndingMixed, lfCount: 2, crlfCount: 1, first: LineEndingLF, capability: CapabilityWritable},
		{name: "tie-first-crlf", content: []byte("one\r\ntwo\n"), lineEnding: LineEndingMixed, lfCount: 1, crlfCount: 1, first: LineEndingCRLF, capability: CapabilityWritable},
		{name: "none", content: []byte("one line\u0085two\u2028three\u2029"), lineEnding: LineEndingNone, capability: CapabilityWritable},
		{name: "lone-cr", content: []byte("one\rtwo"), lineEnding: LineEndingNone, capability: CapabilityUnsafeReadOnly, warning: WarningLoneCR},
	}
	for _, testCase := range cases {
		t.Run(testCase.name, func(t *testing.T) {
			path := filepath.Join(root, testCase.name+".md")
			if err := os.WriteFile(path, testCase.content, 0o644); err != nil {
				t.Fatalf("write line-ending fixture: %v", err)
			}
			classified, err := ReadClassifiedDocument(path)
			if err != nil {
				t.Fatalf("read line-ending fixture: %v", err)
			}
			characteristics := classified.Characteristics
			if characteristics.LineEnding != testCase.lineEnding || characteristics.LFCount != testCase.lfCount || characteristics.CRLFCount != testCase.crlfCount {
				t.Fatalf("characteristics = %+v", characteristics)
			}
			if testCase.first != "" && characteristics.FirstEnding != testCase.first {
				t.Fatalf("first ending = %q, want %q", characteristics.FirstEnding, testCase.first)
			}
			if classified.Capability != testCase.capability || classified.Warning != testCase.warning {
				t.Fatalf("outcome = %+v", classified)
			}
			if testCase.name == "none" && classified.Content != string(testCase.content) {
				t.Fatalf("ordinary Unicode separators changed content: %q", classified.Content)
			}
		})
	}
}

func writeRepeatedBytes(t *testing.T, path string, size int64, value byte) {
	t.Helper()
	file, err := os.OpenFile(path, os.O_CREATE|os.O_TRUNC|os.O_WRONLY, 0o644)
	if err != nil {
		t.Fatalf("create %q: %v", path, err)
	}
	defer func() { _ = file.Close() }()
	chunk := bytes.Repeat([]byte{value}, 64*1024)
	for written := int64(0); written < size; {
		want := int64(len(chunk))
		if remaining := size - written; remaining < want {
			want = remaining
		}
		n, writeErr := file.Write(chunk[:want])
		if writeErr != nil {
			t.Fatalf("write %q: %v", path, writeErr)
		}
		if n == 0 {
			t.Fatal("zero-byte write while building exact-size fixture")
		}
		written += int64(n)
	}
}
