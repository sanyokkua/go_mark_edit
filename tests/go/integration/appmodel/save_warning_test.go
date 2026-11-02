package appmodel_test

import (
	"context"
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/sanyokkua/go_mark_edit/internal/apperr"
	. "github.com/sanyokkua/go_mark_edit/internal/appmodel"
	"github.com/sanyokkua/go_mark_edit/internal/db"
)

func assertSaveWarningWire(t *testing.T, result apperr.WriteResult, warning string) {
	t.Helper()
	if result.Status != apperr.WriteStatusCommitted || (warning != "") != (result.Error != nil) {
		t.Fatalf("Save = %+v, want warning %q", result, warning)
	}
	if warning == "recent-items" && !strings.Contains(strings.ToLower(result.Error.Message), "recent") {
		t.Fatalf("Save = %+v, want recent warning", result)
	}
	encoded, err := json.Marshal(result)
	if err != nil {
		t.Fatal(err)
	}
	var wire map[string]any
	if err := json.Unmarshal(encoded, &wire); err != nil {
		t.Fatal(err)
	}
	if warning == "" {
		if _, ok := wire["warning"]; ok {
			t.Fatalf("unexpected warning: %s", encoded)
		}
	} else if wire["warning"] != warning {
		t.Fatalf("warning JSON = %s, want %q", encoded, warning)
	}
}

func closeWarningDB(t *testing.T, database *db.Database) {
	t.Helper()
	if err := database.Close(); err != nil {
		t.Fatal(err)
	}
}

type saveWarningCase struct {
	name                 string
	failRecent, failView bool
	warning              string
}

func warningTestDB(t *testing.T, path string) *db.Database {
	t.Helper()
	database, err := db.Open(context.Background(), path)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = database.Close() })
	return database
}

func checkSavePersistenceWarning(t *testing.T, tc saveWarningCase) {
	t.Helper()
	ctx := context.Background()
	dir := t.TempDir()
	recentDB := warningTestDB(t, filepath.Join(dir, "recent.db"))
	viewDB := warningTestDB(t, filepath.Join(dir, "view.db"))
	service := NewAppModelServiceForHost(WithEmitter(&recordingEmitter{}), AppModelOption{RecentItemsRepository: NewSqliteRecentItemsRepository(recentDB), FileMetadataRepository: NewSqliteFileMetadataRepository(viewDB)})
	path, id := openAutosaveDocument(t, service, "original\n")
	if err := service.UpdateBuffer(ctx, id, "saved\n"); err != nil {
		t.Fatal(err)
	}
	if tc.failRecent {
		closeWarningDB(t, recentDB)
	}
	if tc.failView {
		closeWarningDB(t, viewDB)
	}
	state, _ := service.GetState(ctx)
	result := service.Save(ctx, id, state.Snapshot.Documents[id].ContentRevision, "")
	assertSaveWarningWire(t, result, tc.warning)
	got, err := os.ReadFile(path)
	if err != nil || string(got) != "saved\n" {
		t.Fatalf("disk = %q, %v", got, err)
	}
	state, _ = service.GetState(ctx)
	if state.Snapshot.Documents[id].Dirty {
		t.Fatal("document remained dirty")
	}
}

func TestSaveReportsAccompanyingPersistenceFailure(t *testing.T) {
	for _, tc := range []saveWarningCase{{"recent only", true, false, "recent-items"}, {"recent and view", true, true, "recent-items"}, {"view only", false, true, "view-state"}, {"neither", false, false, ""}} {
		t.Run(tc.name, func(t *testing.T) { checkSavePersistenceWarning(t, tc) })
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

func executeWarningQuit(t *testing.T, service *AppModelService) {
	t.Helper()
	ctx := context.Background()
	state, err := service.GetState(ctx)
	if err != nil {
		t.Fatal(err)
	}
	plan := service.PrepareClose(ctx, apperr.ClosePlanQuit, nil, state.Snapshot.TabSetRevision)
	if plan.Error != nil || plan.Data == nil {
		t.Fatalf("prepare = %+v", plan)
	}
	resolved := service.ResolveClosePlan(ctx, plan.Data.ID, []apperr.ClosePlanDecision{{Choice: apperr.CloseChoiceSaveAll}})
	if resolved.Error != nil || resolved.Data == nil || resolved.Data.Status != apperr.ClosePlanReady {
		t.Fatalf("resolve = %+v", resolved)
	}
	if result := service.ExecuteClosePlan(ctx, plan.Data.ID); result.Error != nil {
		t.Fatalf("close = %+v", result)
	}
}

func assertQuitWarningOutcome(t *testing.T, service *AppModelService, emitter *recordingEmitter, path, warning string) {
	t.Helper()
	got, err := os.ReadFile(path)
	if err != nil || string(got) != "saved\n" {
		t.Fatalf("disk = %q, %v", got, err)
	}
	events := emitter.Errors()
	if len(events) != 1 || events[0].Category != apperr.ClassifiedPersistenceWarning || events[0].Details["saveWarning"] != warning {
		t.Fatalf("events = %+v", events)
	}
	state, err := service.GetState(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	if len(state.Snapshot.Documents) != 0 {
		t.Fatalf("documents retained after quit: %+v", state.Snapshot.Documents)
	}
}

func checkQuitPersistenceWarning(t *testing.T, tc saveWarningCase) {
	t.Helper()
	ctx := context.Background()
	dir := t.TempDir()
	recentDB := warningTestDB(t, filepath.Join(dir, "recent.db"))
	viewDB := warningTestDB(t, filepath.Join(dir, "view.db"))
	emitter := &recordingEmitter{}
	service := NewAppModelServiceForHost(WithEmitter(emitter), AppModelOption{RecentItemsRepository: NewSqliteRecentItemsRepository(recentDB), FileMetadataRepository: NewSqliteFileMetadataRepository(viewDB)})
	service.SetAutosaveEnabled(false)
	path, id := openAutosaveDocument(t, service, "original\n")
	if err := service.UpdateBuffer(ctx, id, "saved\n"); err != nil {
		t.Fatal(err)
	}
	if tc.failRecent {
		closeWarningDB(t, recentDB)
	}
	if tc.failView {
		closeWarningDB(t, viewDB)
	}
	executeWarningQuit(t, service)
	assertQuitWarningOutcome(t, service, emitter, path, tc.warning)
}

func TestQuitReportsCommittedPersistenceWarning(t *testing.T) {
	for _, tc := range []saveWarningCase{{"recent", true, false, "recent-items"}, {"view", false, true, "view-state"}} {
		t.Run(tc.name, func(t *testing.T) { checkQuitPersistenceWarning(t, tc) })
	}
}
