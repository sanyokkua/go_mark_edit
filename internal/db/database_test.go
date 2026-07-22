package db

import (
	"bytes"
	"context"
	"database/sql"
	"errors"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/sanyokkua/go_mark_edit/internal/db/store"
)

// Proves: STORY-004-AC-1
// Open configures the pure-Go SQLite database for WAL, the shared busy timeout, and one writer per process.
func TestOpenConfiguresCGOFreeWALDatabase(t *testing.T) {
	ctx := context.Background()
	path := filepath.Join(t.TempDir(), "nested", "settings.db")

	first, err := Open(ctx, path)
	if err != nil {
		t.Fatalf("open first database: %v", err)
	}
	t.Cleanup(func() {
		if err := first.Close(); err != nil {
			t.Errorf("close first database: %v", err)
		}
	})
	if first.Queries == nil {
		t.Fatal("open database has no generated query store")
	}
	if got := first.DB.Stats().MaxOpenConnections; got != 1 {
		t.Fatalf("max open connections = %d, want 1", got)
	}

	var journalMode string
	if err := first.DB.QueryRowContext(ctx, "PRAGMA journal_mode").Scan(&journalMode); err != nil {
		t.Fatalf("read journal mode: %v", err)
	}
	if journalMode != "wal" {
		t.Fatalf("journal mode = %q, want wal", journalMode)
	}

	var busyTimeout int
	if err := first.DB.QueryRowContext(ctx, "PRAGMA busy_timeout").Scan(&busyTimeout); err != nil {
		t.Fatalf("read busy timeout: %v", err)
	}
	if busyTimeout != busyTimeoutMilliseconds {
		t.Fatalf("busy timeout = %dms, want %dms", busyTimeout, busyTimeoutMilliseconds)
	}

	second, err := Open(ctx, path)
	if err != nil {
		t.Fatalf("open same database from a second instance: %v", err)
	}
	t.Cleanup(func() {
		if err := second.Close(); err != nil {
			t.Errorf("close second database: %v", err)
		}
	})
	if _, err := second.DB.ExecContext(ctx, "SELECT 1"); err != nil {
		t.Fatalf("second instance is not usable: %v", err)
	}
}

// Proves: STORY-004-AC-3
// Evidence: EC-SET-1
// A briefly locked database waits for the busy timeout path, then opens a usable migrated store.
func TestOpenRetriesBriefLockContention(t *testing.T) {
	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
	defer cancel()
	path := filepath.Join(t.TempDir(), "settings.db")

	blocker, err := sql.Open("sqlite", "file:"+path)
	if err != nil {
		t.Fatalf("open lock holder: %v", err)
	}
	t.Cleanup(func() {
		if err := blocker.Close(); err != nil {
			t.Errorf("close lock holder: %v", err)
		}
	})
	if _, err := blocker.ExecContext(ctx, "CREATE TABLE lock_holder (id INTEGER PRIMARY KEY)"); err != nil {
		if closeErr := blocker.Close(); closeErr != nil {
			t.Errorf("close lock holder after setup failure: %v", closeErr)
		}
		t.Fatalf("create database before lock: %v", err)
	}
	if _, err := blocker.ExecContext(ctx, "BEGIN EXCLUSIVE"); err != nil {
		t.Fatalf("acquire exclusive database lock: %v", err)
	}
	locked := true
	t.Cleanup(func() {
		if locked {
			_, _ = blocker.ExecContext(context.Background(), "ROLLBACK")
		}
	})

	type openResult struct {
		database *Database
		err      error
	}
	opened := make(chan openResult, 1)
	go func() {
		database, err := Open(ctx, path)
		opened <- openResult{database: database, err: err}
	}()

	select {
	case result := <-opened:
		if result.database != nil {
			if closeErr := result.database.Close(); closeErr != nil {
				t.Errorf("close unexpectedly opened database: %v", closeErr)
			}
		}
		t.Fatalf("open completed while an exclusive lock was held: %v", result.err)
	case <-time.After(100 * time.Millisecond):
	}

	if _, err := blocker.ExecContext(ctx, "COMMIT"); err != nil {
		t.Fatalf("release exclusive database lock: %v", err)
	}
	locked = false

	select {
	case result := <-opened:
		if result.err != nil {
			t.Fatalf("open after brief lock contention: %v", result.err)
		}
		t.Cleanup(func() {
			if err := result.database.Close(); err != nil {
				t.Errorf("close reopened database: %v", err)
			}
		})
		if err := result.database.Queries.UpsertSetting(ctx, store.UpsertSettingParams{
			Key: "editor.autosave", Value: "true", Type: "bool",
		}); err != nil {
			t.Fatalf("write setting after lock contention: %v", err)
		}
		setting, err := result.database.Queries.GetSetting(ctx, "editor.autosave")
		if err != nil {
			t.Fatalf("read setting after lock contention: %v", err)
		}
		if setting.Value != "true" || setting.Type != "bool" {
			t.Fatalf("setting after lock contention = %+v, want true bool", setting)
		}
	case <-ctx.Done():
		t.Fatalf("open did not complete after lock release: %v", ctx.Err())
	}
}

// Proves: STORY-004-AC-4
// Evidence: EC-SET-2
// Corrupt files are preserved before a clean store opens, while a newer schema remains an unchanged hard error.
func TestOpenRejectsCorruptOrUnsupportedSchemaSafely(t *testing.T) {
	t.Run("EC-SET-2 corrupt primary and sidecar artifacts are preserved together with collision-safe recovery", func(t *testing.T) {
		ctx := context.Background()
		path := filepath.Join(t.TempDir(), "settings.db")
		openRecognizedCorruptPrimary(t, ctx, path)

		firstSuffix := preserveCorruptDatabaseWithSidecars(t, path, "first recovery")
		secondSuffix := preserveCorruptDatabaseWithSidecars(t, path, "second recovery")
		if firstSuffix == secondSuffix {
			t.Fatalf("repeat corrupt recovery reused suffix %q", firstSuffix)
		}

		backups, err := filepath.Glob(path + corruptFileMarker + "*")
		if err != nil {
			t.Fatalf("find preserved primary database files: %v", err)
		}
		if len(backups) != 3 {
			t.Fatalf("preserved primary database files = %v, want recognized recovery plus two collision-safe sidecar recoveries", backups)
		}
	})

	t.Run("EC-SET-2 concurrent processes converge after another opener moves corrupt files", func(t *testing.T) {
		const crossProcessAttempts = 8
		for attempt := range crossProcessAttempts {
			t.Run("attempt-"+string(rune('a'+attempt)), func(t *testing.T) {
				path := filepath.Join(t.TempDir(), "settings.db")
				runConcurrentCorruptOpeners(t, path)
			})
		}
	})

	t.Run("EC-SET-2 newer schema is rejected without recovery", func(t *testing.T) {
		ctx := context.Background()
		path := filepath.Join(t.TempDir(), "settings.db")
		seed, err := Open(ctx, path)
		if err != nil {
			t.Fatalf("open seed database: %v", err)
		}
		if err := seed.Queries.UpsertSetting(ctx, store.UpsertSettingParams{
			Key: "editor.autosave", Value: "false", Type: "bool",
		}); err != nil {
			if closeErr := seed.Close(); closeErr != nil {
				t.Errorf("close seed database after upsert failure: %v", closeErr)
			}
			t.Fatalf("seed existing setting: %v", err)
		}
		if err := seed.Close(); err != nil {
			t.Fatalf("close seed database: %v", err)
		}

		raw, err := sql.Open("sqlite", "file:"+path)
		if err != nil {
			t.Fatalf("open raw database: %v", err)
		}
		if _, err := raw.ExecContext(ctx, "INSERT INTO goose_db_version (version_id, is_applied) VALUES (?, ?)", 999, true); err != nil {
			if closeErr := raw.Close(); closeErr != nil {
				t.Errorf("close raw database after schema write failure: %v", closeErr)
			}
			t.Fatalf("record newer schema version: %v", err)
		}
		if err := raw.Close(); err != nil {
			t.Fatalf("close raw database: %v", err)
		}

		database, err := Open(ctx, path)
		if database != nil {
			if closeErr := database.Close(); closeErr != nil {
				t.Errorf("close unsupported-schema database: %v", closeErr)
			}
			t.Fatal("newer schema unexpectedly opened")
		}
		if !errors.Is(err, ErrUnsupportedSchema) {
			t.Fatalf("open newer schema error = %v, want ErrUnsupportedSchema", err)
		}
		backups, err := filepath.Glob(path + corruptFileMarker + "*")
		if err != nil {
			t.Fatalf("find unexpected schema backups: %v", err)
		}
		if len(backups) != 0 {
			t.Fatalf("newer schema must not be recovered, found backups %v", backups)
		}

		check, err := sql.Open("sqlite", "file:"+path)
		if err != nil {
			t.Fatalf("reopen raw newer database: %v", err)
		}
		t.Cleanup(func() {
			if err := check.Close(); err != nil {
				t.Errorf("close raw newer database: %v", err)
			}
		})
		var value string
		if err := check.QueryRowContext(ctx, "SELECT value FROM settings WHERE key = ?", "editor.autosave").Scan(&value); err != nil {
			t.Fatalf("read preserved setting: %v", err)
		}
		if value != "false" {
			t.Fatalf("preserved setting value = %q, want false", value)
		}
	})
}

func TestOpenCorruptRecoveryHelperProcess(t *testing.T) {
	if os.Getenv("GOMARKEDIT_DB_OPEN_HELPER") != "1" {
		return
	}

	path := os.Getenv("GOMARKEDIT_DB_PATH")
	readyPath := os.Getenv("GOMARKEDIT_DB_READY_PATH")
	startPath := os.Getenv("GOMARKEDIT_DB_START_PATH")
	if path == "" || readyPath == "" || startPath == "" {
		t.Fatal("helper process is missing database coordination paths")
	}
	if err := os.WriteFile(readyPath, []byte("ready"), 0o600); err != nil {
		t.Fatalf("signal helper readiness: %v", err)
	}
	waitForFile(t, startPath, 5*time.Second)

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	database, err := Open(ctx, path)
	if err != nil {
		t.Fatalf("open corrupt database from helper process: %v", err)
	}
	if err := database.Close(); err != nil {
		t.Fatalf("close helper database: %v", err)
	}
}

func openRecognizedCorruptPrimary(t *testing.T, ctx context.Context, path string) {
	t.Helper()
	const corruptPrimary = "not a sqlite database recognized recovery"
	if err := os.WriteFile(path, []byte(corruptPrimary), 0o600); err != nil {
		t.Fatalf("write corrupt primary sentinel: %v", err)
	}

	database, err := Open(ctx, path)
	if err != nil {
		t.Fatalf("open corrupt database safely: %v", err)
	}
	if err := database.Queries.UpsertSetting(ctx, store.UpsertSettingParams{
		Key: "appearance.mode", Value: "dark", Type: "string",
	}); err != nil {
		if closeErr := database.Close(); closeErr != nil {
			t.Errorf("close replacement database after write failure: %v", closeErr)
		}
		t.Fatalf("write through replacement database: %v", err)
	}
	if err := database.Close(); err != nil {
		t.Fatalf("close replacement database: %v", err)
	}
	backups, err := filepath.Glob(path + corruptFileMarker + "*")
	if err != nil {
		t.Fatalf("find preserved primary database files: %v", err)
	}
	for _, backup := range backups {
		preservedContents, err := os.ReadFile(backup)
		if err != nil {
			t.Fatalf("read preserved primary database: %v", err)
		}
		if string(preservedContents) == corruptPrimary {
			return
		}
	}
	t.Fatalf("did not find preserved primary database contents %q", corruptPrimary)
}

func preserveCorruptDatabaseWithSidecars(t *testing.T, path, recovery string) string {
	t.Helper()
	expectedContents := map[string]string{
		path:          "not a sqlite database " + recovery,
		path + "-wal": "wal sentinel " + recovery,
		path + "-shm": "shm sentinel " + recovery,
	}
	for source, contents := range expectedContents {
		if err := os.WriteFile(source, []byte(contents), 0o600); err != nil {
			t.Fatalf("write corrupt artifact %s: %v", source, err)
		}
	}
	original, err := os.Stat(path)
	if err != nil {
		t.Fatalf("stat corrupt primary database: %v", err)
	}
	if err := preserveCorruptDatabase(path, original); err != nil {
		t.Fatalf("preserve corrupt primary and sidecars: %v", err)
	}

	backups, err := filepath.Glob(path + corruptFileMarker + "*")
	if err != nil {
		t.Fatalf("find preserved primary database files: %v", err)
	}
	prefix := path + corruptFileMarker
	for _, backup := range backups {
		if !strings.HasPrefix(backup, prefix) {
			t.Fatalf("preserved primary path %q does not start with %q", backup, prefix)
		}
		preservedContents, err := os.ReadFile(backup)
		if err != nil {
			t.Fatalf("read preserved primary %s: %v", backup, err)
		}
		if string(preservedContents) != expectedContents[path] {
			continue
		}
		suffix := strings.TrimPrefix(backup, prefix)
		for source, want := range expectedContents {
			preservedPath := source + corruptFileMarker + suffix
			contents, err := os.ReadFile(preservedPath)
			if err != nil {
				t.Fatalf("read preserved %s: %v", preservedPath, err)
			}
			if string(contents) != want {
				t.Fatalf("preserved %s differs from its original contents", preservedPath)
			}
		}
		return suffix
	}
	t.Fatalf("did not find preserved primary contents for %s", recovery)
	return ""
}

func runConcurrentCorruptOpeners(t *testing.T, path string) {
	t.Helper()
	const corruptPrimary = "not a sqlite database cross-process recovery"
	if err := os.WriteFile(path, []byte(corruptPrimary), 0o600); err != nil {
		t.Fatalf("write cross-process corrupt primary: %v", err)
	}

	startPath := filepath.Join(filepath.Dir(path), "open-start")
	readyPaths := []string{
		filepath.Join(filepath.Dir(path), "open-ready-1"),
		filepath.Join(filepath.Dir(path), "open-ready-2"),
	}
	commands := make([]*exec.Cmd, 0, len(readyPaths))
	outputs := make([]*bytes.Buffer, 0, len(readyPaths))
	for _, readyPath := range readyPaths {
		output := &bytes.Buffer{}
		command := exec.Command(os.Args[0], "-test.run=^TestOpenCorruptRecoveryHelperProcess$")
		command.Env = append(os.Environ(),
			"GOMARKEDIT_DB_OPEN_HELPER=1",
			"GOMARKEDIT_DB_PATH="+path,
			"GOMARKEDIT_DB_READY_PATH="+readyPath,
			"GOMARKEDIT_DB_START_PATH="+startPath,
		)
		command.Stdout = output
		command.Stderr = output
		if err := command.Start(); err != nil {
			t.Fatalf("start helper process: %v", err)
		}
		commands = append(commands, command)
		outputs = append(outputs, output)
	}
	waitForFiles(t, readyPaths, 5*time.Second)
	if err := os.WriteFile(startPath, []byte("open"), 0o600); err != nil {
		t.Fatalf("release helper processes: %v", err)
	}
	for index, command := range commands {
		if err := command.Wait(); err != nil {
			t.Fatalf("helper process %d failed: %v\n%s", index+1, err, outputs[index].String())
		}
	}

	backups, err := filepath.Glob(path + corruptFileMarker + "*")
	if err != nil {
		t.Fatalf("find cross-process corrupt backup: %v", err)
	}
	if len(backups) != 1 {
		t.Fatalf("cross-process corrupt backups = %v, want exactly one artifact set", backups)
	}
	preservedContents, err := os.ReadFile(backups[0])
	if err != nil {
		t.Fatalf("read cross-process corrupt backup: %v", err)
	}
	if string(preservedContents) != corruptPrimary {
		t.Fatalf("cross-process corrupt backup = %q, want original primary", preservedContents)
	}

	database, err := Open(context.Background(), path)
	if err != nil {
		t.Fatalf("open cross-process replacement database: %v", err)
	}
	t.Cleanup(func() {
		if err := database.Close(); err != nil {
			t.Errorf("close cross-process replacement database: %v", err)
		}
	})
	if err := database.Queries.UpsertSetting(context.Background(), store.UpsertSettingParams{
		Key: "appearance.mode", Value: "dark", Type: "string",
	}); err != nil {
		t.Fatalf("write cross-process replacement setting: %v", err)
	}
	if _, err := database.Queries.GetSetting(context.Background(), "appearance.mode"); err != nil {
		t.Fatalf("read cross-process replacement setting: %v", err)
	}
}

func waitForFiles(t *testing.T, paths []string, timeout time.Duration) {
	t.Helper()
	deadline := time.NewTimer(timeout)
	defer deadline.Stop()
	ticker := time.NewTicker(5 * time.Millisecond)
	defer ticker.Stop()
	for {
		allPresent := true
		for _, path := range paths {
			if _, err := os.Stat(path); errors.Is(err, os.ErrNotExist) {
				allPresent = false
				break
			} else if err != nil {
				t.Fatalf("inspect helper coordination file %s: %v", path, err)
			}
		}
		if allPresent {
			return
		}
		select {
		case <-deadline.C:
			t.Fatalf("helper processes did not become ready within %s", timeout)
		case <-ticker.C:
		}
	}
}

func waitForFile(t *testing.T, path string, timeout time.Duration) {
	t.Helper()
	waitForFiles(t, []string{path}, timeout)
}
