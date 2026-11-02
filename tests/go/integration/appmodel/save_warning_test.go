package appmodel_test

import (
	"context"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/sanyokkua/go_mark_edit/internal/apperr"
	. "github.com/sanyokkua/go_mark_edit/internal/appmodel"
	"github.com/sanyokkua/go_mark_edit/internal/db"
)

func TestSaveReportsAccompanyingPersistenceFailure(t *testing.T) {
	for _, both := range []bool{false, true} {
		t.Run(map[bool]string{false: "recent only", true: "recent and view"}[both], func(t *testing.T) {
			ctx := context.Background()
			dir := t.TempDir()
			recentDB, err := db.Open(ctx, filepath.Join(dir, "recent.db"))
			if err != nil {
				t.Fatal(err)
			}
			viewDB, err := db.Open(ctx, filepath.Join(dir, "view.db"))
			if err != nil {
				t.Fatal(err)
			}
			defer func() { _ = viewDB.Close() }()
			service := NewAppModelServiceForHost(WithEmitter(&recordingEmitter{}), AppModelOption{RecentItemsRepository: NewSqliteRecentItemsRepository(recentDB), FileMetadataRepository: NewSqliteFileMetadataRepository(viewDB)})
			path, id := openAutosaveDocument(t, service, "original\n")
			if err := service.UpdateBuffer(ctx, id, "saved\n"); err != nil {
				t.Fatal(err)
			}
			if err := recentDB.Close(); err != nil {
				t.Fatal(err)
			}
			if both {
				if err := viewDB.Close(); err != nil {
					t.Fatal(err)
				}
			}
			state, _ := service.GetState(ctx)
			result := service.Save(ctx, id, state.Snapshot.Documents[id].ContentRevision, "")
			if result.Status != apperr.WriteStatusCommitted || result.Error == nil || !strings.Contains(strings.ToLower(result.Error.Message), "recent") {
				t.Fatalf("Save = %+v, want recent warning", result)
			}
			got, err := os.ReadFile(path)
			if err != nil || string(got) != "saved\n" {
				t.Fatalf("disk = %q, %v", got, err)
			}
			state, _ = service.GetState(ctx)
			if state.Snapshot.Documents[id].Dirty {
				t.Fatal("document remained dirty")
			}
		})
	}
}

func TestSaveRejectsUnencodableTextWithoutRetry(t *testing.T) {
	ctx := context.Background()
	service := NewAppModelServiceForHost(WithEmitter(&recordingEmitter{}))
	path, id := openAutosaveDocument(t, service, "original\n")
	if err := service.UpdateBuffer(ctx, id, "bad\x00text"); err != nil {
		t.Fatal(err)
	}
	state, _ := service.GetState(ctx)
	result := service.Save(ctx, id, state.Snapshot.Documents[id].ContentRevision, "")
	if result.Status != apperr.WriteStatusRefused || result.Category != apperr.ClassifiedUnsupportedInput || result.Remediation != apperr.RemediationNone {
		t.Fatalf("Save = %+v, want unsupported input without retry", result)
	}
	got, err := os.ReadFile(path)
	if err != nil || string(got) != "original\n" {
		t.Fatalf("disk = %q, %v", got, err)
	}
}
