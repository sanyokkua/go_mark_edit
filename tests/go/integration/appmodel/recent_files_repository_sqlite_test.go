package appmodel_test

import (
	"context"
	"encoding/json"
	. "github.com/sanyokkua/go_mark_edit/internal/appmodel"
	"os"
	"path/filepath"
	"testing"
	"time"

	"github.com/sanyokkua/go_mark_edit/internal/db"
	"github.com/sanyokkua/go_mark_edit/internal/file"
)

func openTwoRecentFilesDatabases(t *testing.T) (*db.Database, *db.Database) {
	t.Helper()
	path := filepath.Join(t.TempDir(), "recent-files.db")
	first, err := db.Open(context.Background(), path)
	if err != nil {
		t.Fatalf("open first recent-files database: %v", err)
	}
	second, err := db.Open(context.Background(), path)
	if err != nil {
		_ = first.Close()
		t.Fatalf("open second recent-files database: %v", err)
	}
	t.Cleanup(func() {
		if err := second.Close(); err != nil {
			t.Errorf("close second recent-files database: %v", err)
		}
		if err := first.Close(); err != nil {
			t.Errorf("close first recent-files database: %v", err)
		}
	})
	return first, second
}

func TestRecentFilesCorruptAndUnknownValuesFallBackSafely(t *testing.T) {
	database, err := db.Open(context.Background(), filepath.Join(t.TempDir(), "recents.db"))
	if err != nil {
		t.Fatalf("open database: %v", err)
	}
	defer func() { _ = database.Close() }()
	repository := NewSqliteRecentFilesRepository(database)

	for _, encoded := range []string{"not-json", string(mustJSON(t, recentFilesEnvelope{Version: 99, Entries: []string{"/stale.md"}}))} {
		if _, err := database.DB.ExecContext(context.Background(), `
INSERT INTO settings (key, value, type) VALUES (?, ?, ?)
ON CONFLICT(key) DO UPDATE SET value = excluded.value, type = excluded.type
	`, "recent.files", encoded, "recent.files.v1"); err != nil {
			t.Fatalf("seed invalid recent value: %v", err)
		}
		got, err := repository.List(context.Background())
		if err != nil {
			t.Fatalf("list invalid recent value: %v", err)
		}
		if len(got) != 0 {
			t.Fatalf("invalid recent value listed as %v", got)
		}
	}

	path := filepath.Join(t.TempDir(), "replacement.md")
	if err := os.WriteFile(path, []byte("replacement\n"), 0o600); err != nil {
		t.Fatalf("write replacement fixture: %v", err)
	}
	canonical, err := file.CanonicalizeCandidateDocumentPath(path)
	if err != nil {
		t.Fatalf("canonicalize replacement fixture: %v", err)
	}
	got, err := repository.Promote(context.Background(), canonical.Path)
	if err != nil {
		t.Fatalf("promote after invalid value: %v", err)
	}
	if len(got) != 1 || got[0] != canonical.Path {
		t.Fatalf("promoted recents after invalid value = %v", got)
	}
}

func TestRecentFilesPromotionWaitsForConcurrentWriter(t *testing.T) {
	first, second := openTwoRecentFilesDatabases(t)
	repository := NewSqliteRecentFilesRepository(first)
	firstPath := filepath.Join(t.TempDir(), "first.md")
	secondPath := filepath.Join(t.TempDir(), "second.md")
	for _, path := range []string{firstPath, secondPath} {
		if err := os.WriteFile(path, []byte(path), 0o600); err != nil {
			t.Fatalf("write recent fixture %s: %v", path, err)
		}
	}
	firstCanonical, err := file.CanonicalizeCandidateDocumentPath(firstPath)
	if err != nil {
		t.Fatalf("canonicalize first recent fixture: %v", err)
	}
	secondCanonical, err := file.CanonicalizeCandidateDocumentPath(secondPath)
	if err != nil {
		t.Fatalf("canonicalize second recent fixture: %v", err)
	}
	if _, err := repository.Promote(context.Background(), firstPath); err != nil {
		t.Fatalf("seed recent promotion: %v", err)
	}

	connection, err := second.DB.Conn(context.Background())
	if err != nil {
		t.Fatalf("reserve concurrent database connection: %v", err)
	}
	defer func() { _ = connection.Close() }()
	if _, err := connection.ExecContext(context.Background(), "BEGIN IMMEDIATE"); err != nil {
		t.Fatalf("hold concurrent writer: %v", err)
	}

	type promotionResult struct {
		entries []string
		err     error
	}
	completed := make(chan promotionResult, 1)
	go func() {
		entries, promoteErr := repository.Promote(context.Background(), secondPath)
		completed <- promotionResult{entries: entries, err: promoteErr}
	}()

	select {
	case result := <-completed:
		t.Fatalf("promotion completed before lock release: %+v", result)
	case <-time.After(150 * time.Millisecond):
	}
	if _, err := connection.ExecContext(context.Background(), "ROLLBACK"); err != nil {
		t.Fatalf("release concurrent writer: %v", err)
	}

	select {
	case result := <-completed:
		if result.err != nil {
			t.Fatalf("promotion after lock release: %v", result.err)
		}
		if len(result.entries) != 2 || result.entries[0] != secondCanonical.Path || result.entries[1] != firstCanonical.Path {
			t.Fatalf("promoted entries = %v, want [%s %s]", result.entries, secondCanonical.Path, firstCanonical.Path)
		}
	case <-time.After(5 * time.Second):
		t.Fatal("promotion did not complete after lock release")
	}
}

type recentFilesEnvelope struct {
	Version int      `json:"version"`
	Entries []string `json:"entries"`
}

func mustJSON(t *testing.T, value recentFilesEnvelope) []byte {
	t.Helper()
	encoded, err := json.Marshal(value)
	if err != nil {
		t.Fatalf("encode recent value: %v", err)
	}
	return encoded
}
