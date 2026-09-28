package appmodel_test

import (
	"context"
	"os"
	"path/filepath"
	"sync"
	"testing"
	"time"

	"github.com/sanyokkua/go_mark_edit/internal/apperr"
	"github.com/sanyokkua/go_mark_edit/internal/appmodel"
)

type recordingEmitter struct {
	mu          sync.Mutex
	patches     []apperr.AppStatePatch
	asyncErrors []apperr.WireError
}

func (emitter *recordingEmitter) EmitStatePatch(_ context.Context, patch apperr.AppStatePatch) error {
	emitter.mu.Lock()
	defer emitter.mu.Unlock()
	emitter.patches = append(emitter.patches, patch)
	return nil
}

func (emitter *recordingEmitter) EmitAsyncError(_ context.Context, wire apperr.WireError) error {
	emitter.mu.Lock()
	defer emitter.mu.Unlock()
	emitter.asyncErrors = append(emitter.asyncErrors, wire)
	return nil
}

func (emitter *recordingEmitter) Count() int {
	emitter.mu.Lock()
	defer emitter.mu.Unlock()
	return len(emitter.patches)
}

func (emitter *recordingEmitter) Patches() []apperr.AppStatePatch {
	emitter.mu.Lock()
	defer emitter.mu.Unlock()
	return append([]apperr.AppStatePatch(nil), emitter.patches...)
}

func (emitter *recordingEmitter) Errors() []apperr.WireError {
	emitter.mu.Lock()
	defer emitter.mu.Unlock()
	return append([]apperr.WireError(nil), emitter.asyncErrors...)
}

type statePatchRecorder struct {
	mu      sync.Mutex
	patches []apperr.AppStatePatch
}

func (recorder *statePatchRecorder) EmitStatePatch(_ context.Context, patch apperr.AppStatePatch) error {
	recorder.mu.Lock()
	defer recorder.mu.Unlock()
	if patch.Documents != nil {
		copyPatch := patch
		copyDocuments := *patch.Documents
		if patch.Documents.Upsert != nil {
			copyDocuments.Upsert = make(map[string]apperr.DocumentMetadata, len(patch.Documents.Upsert))
			for id, metadata := range patch.Documents.Upsert {
				copyDocuments.Upsert[id] = metadata
			}
		}
		copyDocuments.Remove = append([]string(nil), patch.Documents.Remove...)
		copyPatch.Documents = &copyDocuments
		patch = copyPatch
	}
	recorder.patches = append(recorder.patches, patch)
	return nil
}

func (recorder *statePatchRecorder) last() apperr.AppStatePatch {
	recorder.mu.Lock()
	defer recorder.mu.Unlock()
	if len(recorder.patches) == 0 {
		return apperr.AppStatePatch{}
	}
	return recorder.patches[len(recorder.patches)-1]
}

type saveDialog struct {
	path    string
	confirm bool
}

func (dialog saveDialog) ChooseSaveFile(context.Context, appmodel.SaveDialogRequest) (string, error) {
	return dialog.path, nil
}

func (dialog saveDialog) ConfirmOverwrite(context.Context, string) (bool, error) {
	return dialog.confirm, nil
}

type saveDialogFixture struct {
	path         string
	confirm      bool
	chooseErr    error
	confirmErr   error
	chooseCalls  int
	confirmCalls int
}

func (dialog *saveDialogFixture) ChooseSaveFile(context.Context, appmodel.SaveDialogRequest) (string, error) {
	dialog.chooseCalls++
	return dialog.path, dialog.chooseErr
}

func (dialog *saveDialogFixture) ConfirmOverwrite(context.Context, string) (bool, error) {
	dialog.confirmCalls++
	return dialog.confirm, dialog.confirmErr
}

func newSaveDocument(t *testing.T, service *appmodel.AppModelService, content string) string {
	t.Helper()
	state, err := service.GetState(context.Background())
	if err != nil {
		t.Fatalf("state before NewDocument: %v", err)
	}
	created := service.NewDocument(context.Background(), state.Snapshot.TabSetRevision)
	if created.Data == nil {
		t.Fatalf("NewDocument = %+v", created)
	}
	if err := service.UpdateBuffer(context.Background(), created.Data.DocumentID, content); err != nil {
		t.Fatalf("UpdateBuffer: %v", err)
	}
	return created.Data.DocumentID
}

func validDocView(editorVisible, previewVisible bool) apperr.DocViewInput {
	return apperr.DocViewInput{
		EditorVisible:  editorVisible,
		PreviewVisible: previewVisible,
		Cursor:         apperr.CursorPosition{Line: 1, Column: 1},
		Selection: apperr.SelectionRange{
			Start: apperr.CursorPosition{Line: 1, Column: 1},
			End:   apperr.CursorPosition{Line: 1, Column: 1},
		},
	}
}

type manualAutosaveFactory struct {
	mu     sync.Mutex
	timers []*manualAutosaveTimer
}

func (factory *manualAutosaveFactory) AfterFunc(_ time.Duration, callback func()) appmodel.AutosaveTimer {
	timer := &manualAutosaveTimer{callback: callback}
	factory.mu.Lock()
	factory.timers = append(factory.timers, timer)
	factory.mu.Unlock()
	return timer
}

func (factory *manualAutosaveFactory) fireNext() bool {
	factory.mu.Lock()
	for _, timer := range factory.timers {
		timer.mu.Lock()
		if !timer.stopped && !timer.fired {
			timer.fired = true
			callback := timer.callback
			timer.mu.Unlock()
			factory.mu.Unlock()
			callback()
			return true
		}
		timer.mu.Unlock()
	}
	factory.mu.Unlock()
	return false
}

type manualAutosaveTimer struct {
	mu       sync.Mutex
	callback func()
	stopped  bool
	fired    bool
}

func (timer *manualAutosaveTimer) Stop() bool {
	timer.mu.Lock()
	wasActive := !timer.stopped
	timer.stopped = true
	timer.mu.Unlock()
	return wasActive
}

type fakeAutosaveClock struct {
	mu     sync.Mutex
	timers []*fakeAutosaveTimer
}

type fakeAutosaveTimer struct {
	clock    *fakeAutosaveClock
	callback func()
	stopped  bool
	fired    bool
}

func (clock *fakeAutosaveClock) AfterFunc(_ time.Duration, callback func()) appmodel.AutosaveTimer {
	clock.mu.Lock()
	defer clock.mu.Unlock()
	timer := &fakeAutosaveTimer{clock: clock, callback: callback}
	clock.timers = append(clock.timers, timer)
	return timer
}

func (timer *fakeAutosaveTimer) Stop() bool {
	timer.clock.mu.Lock()
	defer timer.clock.mu.Unlock()
	if timer.stopped || timer.fired {
		return false
	}
	timer.stopped = true
	return true
}

func (clock *fakeAutosaveClock) Pending() int {
	clock.mu.Lock()
	defer clock.mu.Unlock()
	pending := 0
	for _, timer := range clock.timers {
		if !timer.stopped && !timer.fired {
			pending++
		}
	}
	return pending
}

func (clock *fakeAutosaveClock) FireNext() bool {
	clock.mu.Lock()
	var callback func()
	for _, timer := range clock.timers {
		if timer.stopped || timer.fired {
			continue
		}
		timer.fired = true
		callback = timer.callback
		break
	}
	clock.mu.Unlock()
	if callback == nil {
		return false
	}
	callback()
	return true
}

func (clock *fakeAutosaveClock) FireNextAsync() bool {
	clock.mu.Lock()
	var callback func()
	for _, timer := range clock.timers {
		if timer.stopped || timer.fired {
			continue
		}
		timer.fired = true
		callback = timer.callback
		break
	}
	clock.mu.Unlock()
	if callback == nil {
		return false
	}
	go callback()
	return true
}

func openAutosaveDocument(t *testing.T, service *appmodel.AppModelService, content string) (string, string) {
	t.Helper()
	path := filepath.Join(t.TempDir(), "autosave.md")
	if err := os.WriteFile(path, []byte(content), 0o640); err != nil {
		t.Fatalf("write document fixture: %v", err)
	}
	state, err := service.GetState(context.Background())
	if err != nil {
		t.Fatalf("GetState before open: %v", err)
	}
	opened := service.OpenPath(context.Background(), path, state.Snapshot.TabSetRevision)
	if opened.Status != apperr.OpenStatusOpened || opened.DocumentID == "" {
		t.Fatalf("OpenPath outcome = %+v", opened)
	}
	return path, opened.DocumentID
}
