package appmodel

import (
	"context"
	"encoding/json"
	"os"
	"path/filepath"
	"testing"

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

	for _, encoded := range []string{"not-json", string(mustJSON(t, recentFilesValue{Version: 99, Entries: []string{"/stale.md"}}))} {
		if _, err := database.DB.ExecContext(context.Background(), `
INSERT INTO settings (key, value, type) VALUES (?, ?, ?)
ON CONFLICT(key) DO UPDATE SET value = excluded.value, type = excluded.type
`, recentFilesSettingKey, encoded, recentFilesSettingType); err != nil {
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

func mustJSON(t *testing.T, value recentFilesValue) []byte {
	t.Helper()
	encoded, err := json.Marshal(value)
	if err != nil {
		t.Fatalf("encode recent value: %v", err)
	}
	return encoded
}
