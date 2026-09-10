package integration_test

import (
	"bufio"
	"bytes"
	"context"
	"errors"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"syscall"
	"testing"
	"time"

	"github.com/sanyokkua/go_mark_edit/internal/db"
	"github.com/sanyokkua/go_mark_edit/internal/kv"
)

func TestProfileSeederCreatesControlledProfileState(t *testing.T) {
	seeder := buildSeeder(t)

	t.Run("seeds six recent files", func(t *testing.T) {
		profileDir := t.TempDir()
		paths := []string{
			"/tmp/one.md",
			"/tmp/two.md",
			"/tmp/three.md",
			"/tmp/four.md",
			"/tmp/five.md",
			"/tmp/six.md",
			"/tmp/seven.md",
		}
		runSeeder(t, seeder, profileDir, append([]string{"seed-recents"}, paths...)...)

		database, err := db.Open(context.Background(), filepath.Join(profileDir, "settings.db"))
		if err != nil {
			t.Fatalf("open seeded database: %v", err)
		}
		t.Cleanup(func() { _ = database.Close() })
		entry, found, err := kv.New(database.DB).Get(context.Background(), "recent.files")
		if err != nil || !found {
			t.Fatalf("read recent files = %+v, found=%t, error=%v", entry, found, err)
		}
		var value struct {
			Version int      `json:"version"`
			Entries []string `json:"entries"`
		}
		valid, err := kv.DecodeVersionedJSON(entry.Value, 1, &value)
		if err != nil || !valid {
			t.Fatalf("decode recent files = valid %t, error %v", valid, err)
		}
		if entry.Type != "recent.files.v1" || value.Version != 1 {
			t.Fatalf("recent files entry = %+v, want versioned recent files", entry)
		}
		if len(value.Entries) != 6 {
			t.Fatalf("recent files entries = %d, want six", len(value.Entries))
		}
		for index, path := range value.Entries {
			if path != paths[index] {
				t.Fatalf("recent files entry %d = %q, want %q", index, path, paths[index])
			}
		}
	})

	t.Run("isolates appearance failures from other namespaces", func(t *testing.T) {
		profileDir := t.TempDir()
		seedDatabase(t, profileDir)
		database, err := db.Open(context.Background(), filepath.Join(profileDir, "settings.db"))
		if err != nil {
			t.Fatalf("open profile database: %v", err)
		}
		store := kv.New(database.DB)
		if err := store.Upsert(context.Background(), kv.KVEntry{
			Key: "appearance.theme", Value: "minimal", Type: "string",
		}); err != nil {
			_ = database.Close()
			t.Fatalf("seed appearance row: %v", err)
		}
		if err := database.Close(); err != nil {
			t.Fatalf("close profile database: %v", err)
		}

		runSeeder(t, seeder, profileDir, "add-trigger", "appearance")
		database, err = db.Open(context.Background(), filepath.Join(profileDir, "settings.db"))
		if err != nil {
			t.Fatalf("reopen profile database: %v", err)
		}
		t.Cleanup(func() { _ = database.Close() })
		store = kv.New(database.DB)
		for _, key := range []string{"layout.test", "recent.test", "document.view.test"} {
			if err := store.Upsert(context.Background(), kv.KVEntry{Key: key, Value: "one", Type: "string"}); err != nil {
				t.Fatalf("insert unaffected %q: %v", key, err)
			}
			if err := store.Upsert(context.Background(), kv.KVEntry{Key: key, Value: "two", Type: "string"}); err != nil {
				t.Fatalf("update unaffected %q: %v", key, err)
			}
		}
		if err := store.Upsert(context.Background(), kv.KVEntry{Key: "appearance.mode", Value: "dark", Type: "string"}); err == nil {
			t.Fatal("appearance insert succeeded despite trigger")
		}
		if err := store.Upsert(context.Background(), kv.KVEntry{Key: "appearance.theme", Value: "glass", Type: "string"}); err == nil {
			t.Fatal("appearance update succeeded despite trigger")
		}
		var triggerCount int
		if err := database.DB.QueryRowContext(context.Background(), `
			SELECT COUNT(*) FROM sqlite_master
			WHERE type = 'trigger' AND name LIKE 'e2e_reject%'`).Scan(&triggerCount); err != nil {
			t.Fatalf("count appearance triggers: %v", err)
		}
		if triggerCount != 2 {
			t.Fatalf("appearance trigger count = %d, want two", triggerCount)
		}
	})

	t.Run("holds the write lock until timeout", func(t *testing.T) {
		profileDir := t.TempDir()
		seedDatabase(t, profileDir)
		process := startLock(t, seeder, profileDir, "1")
		waitForLock(t, process.ready)
		started := time.Now()
		if err := process.cmd.Wait(); err != nil {
			t.Fatalf("hold lock timeout: %v\n%s", err, process.stderr.String())
		}
		if elapsed := time.Since(started); elapsed < 500*time.Millisecond {
			t.Fatalf("hold lock released after %v, want approximately one second", elapsed)
		}
	})

	t.Run("rolls back the write lock on SIGTERM", func(t *testing.T) {
		profileDir := t.TempDir()
		seedDatabase(t, profileDir)
		process := startLock(t, seeder, profileDir, "30")
		waitForLock(t, process.ready)
		if err := process.cmd.Process.Signal(syscall.SIGTERM); err != nil {
			t.Fatalf("signal hold lock: %v", err)
		}
		if err := process.cmd.Wait(); err != nil {
			t.Fatalf("hold lock after SIGTERM: %v\n%s", err, process.stderr.String())
		}
	})
}

type lockProcess struct {
	cmd    *exec.Cmd
	ready  <-chan error
	stderr *bytes.Buffer
}

func buildSeeder(t *testing.T) string {
	t.Helper()
	binary := filepath.Join(t.TempDir(), "e2e-seed")
	command := exec.Command("go", "build", "-o", binary, "./tools/e2e-seed")
	command.Dir = repositoryRoot(t)
	command.Env = append(os.Environ(), "CGO_ENABLED=0")
	output, err := command.CombinedOutput()
	if err != nil {
		t.Fatalf("build e2e seeder: %v\n%s", err, output)
	}
	return binary
}

func runSeeder(t *testing.T, binary, profileDir string, args ...string) {
	t.Helper()
	commandArgs := append([]string{profileDir}, args...)
	command := exec.Command(binary, commandArgs...)
	command.Dir = repositoryRoot(t)
	output, err := command.CombinedOutput()
	if err != nil {
		t.Fatalf("run e2e seeder %v: %v\n%s", args, err, output)
	}
}

func seedDatabase(t *testing.T, profileDir string) {
	t.Helper()
	path := filepath.Join(profileDir, "settings.db")
	database, err := db.Open(context.Background(), path)
	if err != nil {
		t.Fatalf("create profile database: %v", err)
	}
	if err := database.Close(); err != nil {
		t.Fatalf("close profile database: %v", err)
	}
}

func startLock(t *testing.T, binary, profileDir, seconds string) lockProcess {
	t.Helper()
	command := exec.Command(binary, profileDir, "hold-lock", seconds)
	command.Dir = repositoryRoot(t)
	stdout, err := command.StdoutPipe()
	if err != nil {
		t.Fatalf("capture hold-lock output: %v", err)
	}
	stderr := &bytes.Buffer{}
	command.Stderr = stderr
	if err := command.Start(); err != nil {
		t.Fatalf("start hold-lock: %v", err)
	}
	t.Cleanup(func() {
		_ = command.Process.Signal(syscall.SIGTERM)
		_ = command.Wait()
	})
	ready := make(chan error, 1)
	go func() {
		scanner := bufio.NewScanner(stdout)
		for scanner.Scan() {
			if strings.TrimSpace(scanner.Text()) == "lock acquired" {
				ready <- nil
				return
			}
		}
		if err := scanner.Err(); err != nil {
			ready <- fmt.Errorf("read hold-lock output: %w", err)
			return
		}
		ready <- errors.New("hold-lock exited without acquiring the lock")
	}()
	return lockProcess{cmd: command, ready: ready, stderr: stderr}
}

func waitForLock(t *testing.T, ready <-chan error) {
	t.Helper()
	select {
	case err := <-ready:
		if err != nil {
			t.Fatal(err)
		}
	case <-time.After(5 * time.Second):
		t.Fatal("hold-lock did not report an acquired lock")
	}
}

func repositoryRoot(t *testing.T) string {
	t.Helper()
	directory, err := os.Getwd()
	if err != nil {
		t.Fatalf("get test working directory: %v", err)
	}
	for {
		if _, err := os.Stat(filepath.Join(directory, "go.mod")); err == nil {
			return directory
		}
		parent := filepath.Dir(directory)
		if parent == directory {
			t.Fatal("could not locate repository root")
		}
		directory = parent
	}
}
