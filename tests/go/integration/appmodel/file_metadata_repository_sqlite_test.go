package appmodel_test

import (
	"context"
	. "github.com/sanyokkua/go_mark_edit/internal/appmodel"
	"path/filepath"
	"testing"

	"github.com/sanyokkua/go_mark_edit/internal/db"
)

func TestSqliteFileMetadataRepositoryRoundTripsView(t *testing.T) {
	database, err := db.Open(context.Background(), filepath.Join(t.TempDir(), "settings.db"))
	if err != nil {
		t.Fatalf("open settings database: %v", err)
	}
	defer func() { _ = database.Close() }()
	repository := NewSqliteFileMetadataRepository(database)
	path := "/workspace/notes.md"
	if err := repository.WriteView(context.Background(), path, FileViewMetadata{Arrangement: ArrangementPreview, SplitRatio: 0.72}); err != nil {
		t.Fatalf("write view: %v", err)
	}
	view, found, err := repository.ReadView(context.Background(), path)
	if err != nil || !found || view.Arrangement != ArrangementPreview || view.SplitRatio != 0.72 {
		t.Fatalf("read view = %+v, found=%v, error=%v", view, found, err)
	}
	if _, found, err := repository.ReadView(context.Background(), "/workspace/missing.md"); err != nil || found {
		t.Fatalf("missing view = found=%v, error=%v", found, err)
	}
	if err := repository.WriteView(context.Background(), path, FileViewMetadata{Arrangement: "unsupported", SplitRatio: 0.5}); err == nil {
		t.Fatal("unsupported arrangement write succeeded")
	}
	if err := repository.WriteView(context.Background(), path, FileViewMetadata{Arrangement: ArrangementSplit, SplitRatio: 0.9}); err == nil {
		t.Fatal("out-of-range ratio write succeeded")
	}
}
