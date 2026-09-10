package appmodel_test

import (
	"context"
	. "github.com/sanyokkua/go_mark_edit/internal/appmodel"
	"path/filepath"
	"testing"

	"github.com/sanyokkua/go_mark_edit/internal/db"
)

func TestSqliteFileMetadataRepositoryRoundTripsOnlyArrangement(t *testing.T) {
	database, err := db.Open(context.Background(), filepath.Join(t.TempDir(), "settings.db"))
	if err != nil {
		t.Fatalf("open settings database: %v", err)
	}
	defer func() { _ = database.Close() }()
	repository := NewSqliteFileMetadataRepository(database)
	path := "/workspace/notes.md"
	if err := repository.WriteArrangement(context.Background(), path, ArrangementPreview); err != nil {
		t.Fatalf("write arrangement: %v", err)
	}
	arrangement, found, err := repository.ReadArrangement(context.Background(), path)
	if err != nil || !found || arrangement != ArrangementPreview {
		t.Fatalf("read arrangement = %q, found=%v, error=%v", arrangement, found, err)
	}
	if _, found, err := repository.ReadArrangement(context.Background(), "/workspace/missing.md"); err != nil || found {
		t.Fatalf("missing arrangement = found=%v, error=%v", found, err)
	}
	if err := repository.WriteArrangement(context.Background(), path, "unsupported"); err == nil {
		t.Fatal("unsupported arrangement write succeeded")
	}
}
