package appmodel

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/sanyokkua/go_mark_edit/internal/apperr"
	"github.com/sanyokkua/go_mark_edit/internal/db"
	"github.com/sanyokkua/go_mark_edit/internal/file"
)

// AtomicReplace commits every write via rename-over-target, which gives the
// target path a new on-disk identity each save. document.identity must track
// that identity so a later Open of an unrelated file that receives the freed
// inode cannot be mistaken for this still-open document.
func TestSaveRefreshesDocumentIdentityAfterAtomicReplace(t *testing.T) {
	service := NewAppModelServiceForHost(WithEmitter(&retentionEmitter{}))
	ctx := context.Background()

	path := filepath.Join(t.TempDir(), "document.md")
	if err := os.WriteFile(path, []byte("disk\n"), 0o644); err != nil {
		t.Fatalf("write document: %v", err)
	}

	opened := service.OpenPath(ctx, path, 0)
	if opened.Status != OpenStatusOpened {
		t.Fatalf("OpenPath = %+v", opened)
	}

	if err := service.UpdateBuffer(ctx, opened.DocumentID, "edited\n"); err != nil {
		t.Fatalf("UpdateBuffer: %v", err)
	}
	state, err := service.GetState(ctx)
	if err != nil {
		t.Fatalf("GetState: %v", err)
	}
	metadata := state.Snapshot.Documents[opened.DocumentID]
	if result := service.Save(ctx, opened.DocumentID, metadata.ContentRevision, ""); result.Status != apperr.WriteStatusCommitted {
		t.Fatalf("Save = %+v", result)
	}

	onDisk, err := file.CanonicalizeDocumentPath(path)
	if err != nil {
		t.Fatalf("CanonicalizeDocumentPath: %v", err)
	}

	service.mu.RLock()
	savedIdentity := service.state.documents[opened.DocumentID].identity
	service.mu.RUnlock()

	if !savedIdentity.Equal(onDisk.Identity) {
		t.Fatalf("document identity after save = %+v, want current on-disk identity %+v", savedIdentity, onDisk.Identity)
	}
}

func durabilityFailureExecutor(snapshot WriteSnapshot) (file.DiskVersion, error) {
	replaced, err := file.AtomicReplace(file.AtomicReplaceRequest{TargetPath: snapshot.TargetPath, Data: snapshot.EncodedData, ExpectedVersion: snapshot.ExpectedDiskVersion})
	if err != nil {
		return replaced.Version, err
	}
	return replaced.Version, &committedWriteError{version: replaced.Version, err: errors.New("directory sync failed")}
}

func openWarningDocument(t *testing.T, service *AppModelService, directory string) (string, string) {
	t.Helper()
	path := filepath.Join(directory, "notes.md")
	if err := os.WriteFile(path, []byte("original\n"), 0644); err != nil {
		t.Fatal(err)
	}
	opened := service.OpenPath(context.Background(), path, 0)
	if opened.Status != OpenStatusOpened {
		t.Fatalf("open = %+v", opened)
	}
	return path, opened.DocumentID
}

func assertDurabilityWarning(t *testing.T, result apperr.WriteResult) {
	t.Helper()
	if result.Status != apperr.WriteStatusCommitted || result.Error == nil || !strings.Contains(result.Error.Message, "confirmed on disk") {
		t.Fatalf("save = %+v, want durability warning", result)
	}
	encoded, err := json.Marshal(result)
	if err != nil {
		t.Fatal(err)
	}
	var wire map[string]any
	if err := json.Unmarshal(encoded, &wire); err != nil {
		t.Fatal(err)
	}
	if wire["warning"] != "durability" {
		t.Fatalf("warning JSON = %s, want durability", encoded)
	}
}

func assertWarningDisk(t *testing.T, path string) {
	t.Helper()
	got, err := os.ReadFile(path)
	if err != nil || string(got) != "saved\n" {
		t.Fatalf("disk = %q, %v", got, err)
	}
}

func TestCommittedDurabilityWarningTakesPrecedence(t *testing.T) {
	for _, failRecent := range []bool{false, true} {
		t.Run(fmt.Sprintf("recent=%v", failRecent), func(t *testing.T) {
			ctx := context.Background()
			directory := t.TempDir()
			database, err := db.Open(ctx, filepath.Join(directory, "settings.db"))
			if err != nil {
				t.Fatal(err)
			}
			defer func() { _ = database.Close() }()
			service := NewAppModelServiceForHost(WithEmitter(&retentionEmitter{}), AppModelOption{RecentItemsRepository: NewSqliteRecentItemsRepository(database), WriteExecutor: durabilityFailureExecutor})
			path, id := openWarningDocument(t, service, directory)
			if err := service.UpdateBuffer(ctx, id, "saved\n"); err != nil {
				t.Fatal(err)
			}
			if failRecent {
				if err := database.Close(); err != nil {
					t.Fatal(err)
				}
			}
			state, _ := service.GetState(ctx)
			result := service.Save(ctx, id, state.Snapshot.Documents[id].ContentRevision, "")
			assertDurabilityWarning(t, result)
			assertWarningDisk(t, path)
			state, _ = service.GetState(ctx)
			if state.Snapshot.Documents[id].Dirty {
				t.Fatal("document remained dirty")
			}
		})
	}
}

type warningEventRecorder struct{ events []apperr.WireError }

func (r *warningEventRecorder) EmitStatePatch(context.Context, apperr.AppStatePatch) error {
	return nil
}
func (r *warningEventRecorder) EmitAsyncError(_ context.Context, event apperr.WireError) error {
	r.events = append(r.events, event)
	return nil
}

func executeWarningClose(t *testing.T, service *AppModelService, id string, kind apperr.ClosePlanKind) {
	t.Helper()
	ctx := context.Background()
	state, _ := service.GetState(ctx)
	plan := service.PrepareClose(ctx, kind, []string{id}, state.Snapshot.TabSetRevision)
	if plan.Data == nil {
		t.Fatalf("plan = %+v", plan)
	}
	resolved := service.ResolveClosePlan(ctx, plan.Data.ID, []apperr.ClosePlanDecision{{Choice: apperr.CloseChoiceSaveAll}})
	if resolved.Data == nil || resolved.Data.Status != apperr.ClosePlanReady {
		t.Fatalf("resolve = %+v", resolved)
	}
	if result := service.ExecuteClosePlan(ctx, plan.Data.ID); result.Error != nil {
		t.Fatalf("close = %+v", result)
	}
}

func assertWarningEventAndState(t *testing.T, recorder *warningEventRecorder, service *AppModelService, id string, closePlan bool) {
	t.Helper()
	if len(recorder.events) != 1 || recorder.events[0].Details["saveWarning"] != "durability" || recorder.events[0].Category != apperr.ClassifiedPersistenceWarning {
		t.Fatalf("events = %+v", recorder.events)
	}
	state, _ := service.GetState(context.Background())
	metadata, present := state.Snapshot.Documents[id]
	if closePlan && present {
		t.Fatal("document remained open")
	}
	if !closePlan && (!present || metadata.Dirty) {
		t.Fatalf("autosave state = %+v, present=%v", metadata, present)
	}
}

func checkCommittedWarningSurvives(t *testing.T, closePlan bool) {
	t.Helper()
	ctx := context.Background()
	recorder := &warningEventRecorder{}
	service := NewAppModelServiceForHost(WithEmitter(recorder), AppModelOption{WriteExecutor: durabilityFailureExecutor})
	path, id := openWarningDocument(t, service, t.TempDir())
	if closePlan {
		service.SetAutosaveEnabled(false)
	}
	if err := service.UpdateBuffer(ctx, id, "saved\n"); err != nil {
		t.Fatal(err)
	}
	if closePlan {
		executeWarningClose(t, service, id, apperr.ClosePlanRight)
	} else {
		service.flushAutosaveForClose(id)
	}
	assertWarningEventAndState(t, recorder, service, id, closePlan)
	assertWarningDisk(t, path)
}

func TestCommittedWarningsSurviveAutosaveAndClose(t *testing.T) {
	for _, closePlan := range []bool{false, true} {
		t.Run(fmt.Sprintf("close=%v", closePlan), func(t *testing.T) { checkCommittedWarningSurvives(t, closePlan) })
	}
}

func TestCommittedDurabilityWarningSurvivesQuit(t *testing.T) {
	ctx := context.Background()
	recorder := &warningEventRecorder{}
	service := NewAppModelServiceForHost(WithEmitter(recorder), AppModelOption{WriteExecutor: durabilityFailureExecutor})
	service.SetAutosaveEnabled(false)
	path, id := openWarningDocument(t, service, t.TempDir())
	if err := service.UpdateBuffer(ctx, id, "saved\n"); err != nil {
		t.Fatal(err)
	}
	executeWarningClose(t, service, id, apperr.ClosePlanQuit)
	assertWarningDisk(t, path)
	assertWarningEventAndState(t, recorder, service, id, true)
}
