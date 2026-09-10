package appmodel_test

import (
	"bytes"
	"context"
	"errors"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/rs/zerolog"
	"github.com/sanyokkua/go_mark_edit/internal/apperr"
	"github.com/sanyokkua/go_mark_edit/internal/appmodel"
)

func TestLayoutPersistenceFailureIsEmittedAsClassifiedAsyncError(t *testing.T) {
	timer := &manualLayoutTimer{}
	emitter := &errorSurfaceEmitter{}
	service := appmodel.NewAppModelServiceForHost(
		appmodel.WithClock(timer),
		appmodel.WithEmitter(emitter),
		appmodel.WithLayoutRepository(failingLayoutPersistenceRepository{}),
	)
	width := 900
	if err := service.SetUILayout(context.Background(), apperr.UILayout{WindowWidth: &width}); err != nil {
		t.Fatalf("queue layout: %v", err)
	}
	if !timer.fire() {
		t.Fatal("layout persistence callback was not scheduled")
	}

	errors := emitter.errors()
	if len(errors) != 1 {
		t.Fatalf("async layout errors = %+v, want one classified error", errors)
	}
	if errors[0].Category != apperr.ClassifiedIOFailure {
		t.Fatalf("async layout category = %q, want %q", errors[0].Category, apperr.ClassifiedIOFailure)
	}
	if errors[0].SafeSubject != "layout" || errors[0].Remediation != apperr.RemediationRetry {
		t.Fatalf("async layout error = %+v, want layout with Retry", errors[0])
	}
}

func TestLayoutRestoreReadFailureReturnsAStatedOperation(t *testing.T) {
	service := appmodel.NewAppModelServiceForHost(
		appmodel.WithEmitter(&errorSurfaceEmitter{}),
		appmodel.WithLayoutRepository(layoutReadFailureRepository{}),
	)
	err := service.RestoreUILayout(context.Background())
	if err == nil {
		t.Fatal("RestoreUILayout succeeded despite a layout read failure")
	}
	var appError *apperr.AppError
	if !errors.As(err, &appError) {
		t.Fatalf("layout read failure = %T %v, want an app error", err, err)
	}
	if appError.Code != apperr.CodeIO || appError.Details["operation"] != "read layout window.width" {
		t.Fatalf("layout read failure = %+v, want an IO error naming the field", appError)
	}
}

func TestPublicationRollbackLogsAStatedReason(t *testing.T) {
	var logs bytes.Buffer
	service := appmodel.NewAppModelServiceForHost(
		appmodel.WithEmitter(rejectingStateEmitter{err: errors.New("event transport unavailable")}),
		appmodel.WithLogger(zerolog.New(&logs)),
	)
	state, err := service.GetState(context.Background())
	if err != nil {
		t.Fatalf("initial state: %v", err)
	}
	if err := service.UpdateBuffer(context.Background(), state.Snapshot.ActiveDocumentID, "must roll back"); err == nil {
		t.Fatal("UpdateBuffer succeeded despite a rejected state publication")
	}
	if !strings.Contains(logs.String(), "state publication rolled back") {
		t.Fatalf("publication rollback log = %q, want a stated reason", logs.String())
	}
	after, err := service.GetState(context.Background())
	if err != nil {
		t.Fatalf("state after rollback: %v", err)
	}
	if after.ActiveBuffer == nil || after.ActiveBuffer.Content != "" {
		t.Fatalf("state after publication rollback = %+v, want the prior empty buffer", after.ActiveBuffer)
	}
}

func TestReopenLastFileSurfacesViewRestoreFailure(t *testing.T) {
	root := t.TempDir()
	path := filepath.Join(root, "notes.md")
	if err := os.WriteFile(path, []byte("notes\n"), 0o644); err != nil {
		t.Fatalf("write reopen fixture: %v", err)
	}
	emitter := &failOnceAtPatchEmitter{failAt: 5}
	service := appmodel.NewAppModelServiceForHost(appmodel.WithEmitter(emitter))
	opened := service.OpenPath(context.Background(), path, 0)
	if opened.DocumentID == "" {
		t.Fatalf("OpenPath = %+v, want a document", opened)
	}
	view := apperr.DocViewInput{
		EditorVisible:  true,
		PreviewVisible: true,
		Cursor:         apperr.CursorPosition{Line: 1, Column: 1},
		Selection: apperr.SelectionRange{
			Start: apperr.CursorPosition{Line: 1, Column: 1},
			End:   apperr.CursorPosition{Line: 1, Column: 1},
		},
	}
	if err := service.SetDocView(context.Background(), opened.DocumentID, view); err != nil {
		t.Fatalf("save document view: %v", err)
	}
	state, err := service.GetState(context.Background())
	if err != nil {
		t.Fatalf("state before close: %v", err)
	}
	closed := service.CloseDocument(context.Background(), opened.DocumentID, state.Snapshot.TabSetRevision)
	if closed.Status != apperr.TabTransitionClosed {
		t.Fatalf("CloseDocument = %+v, want closed", closed)
	}
	state, err = service.GetState(context.Background())
	if err != nil {
		t.Fatalf("state before reopen: %v", err)
	}

	reopened := service.ReopenLastFile(context.Background(), state.Snapshot.TabSetRevision)
	if reopened.Status != apperr.OpenStatusOpened {
		t.Fatalf("ReopenLastFile = %+v, want opened with a warning", reopened)
	}
	if reopened.Error == nil || reopened.Error.Category != apperr.ClassifiedPersistenceWarning {
		t.Fatalf("reopen view restore error = %+v, want persistence-warning", reopened.Error)
	}
	if !strings.Contains(reopened.Error.Message, "saved view") {
		t.Fatalf("reopen view restore message = %q, want saved-view context", reopened.Error.Message)
	}
}

type errorSurfaceEmitter struct {
	mu          sync.Mutex
	asyncErrors []apperr.WireError
}

func (*errorSurfaceEmitter) EmitStatePatch(context.Context, apperr.AppStatePatch) error {
	return nil
}

func (emitter *errorSurfaceEmitter) EmitAsyncError(_ context.Context, wire apperr.WireError) error {
	emitter.mu.Lock()
	emitter.asyncErrors = append(emitter.asyncErrors, wire)
	emitter.mu.Unlock()
	return nil
}

func (emitter *errorSurfaceEmitter) errors() []apperr.WireError {
	emitter.mu.Lock()
	defer emitter.mu.Unlock()
	return append([]apperr.WireError(nil), emitter.asyncErrors...)
}

type manualLayoutTimer struct {
	mu        sync.Mutex
	callbacks []func()
}

func (timer *manualLayoutTimer) AfterFunc(_ time.Duration, callback func()) {
	timer.mu.Lock()
	timer.callbacks = append(timer.callbacks, callback)
	timer.mu.Unlock()
}

func (timer *manualLayoutTimer) fire() bool {
	timer.mu.Lock()
	if len(timer.callbacks) == 0 {
		timer.mu.Unlock()
		return false
	}
	callback := timer.callbacks[0]
	timer.callbacks = timer.callbacks[1:]
	timer.mu.Unlock()
	callback()
	return true
}

type failingLayoutPersistenceRepository struct{}

func (failingLayoutPersistenceRepository) Write(context.Context, string, appmodel.VersionedLayoutValue) (appmodel.LayoutWriteResult, error) {
	return appmodel.LayoutWriteResult{}, errors.New("layout database is unavailable")
}

func (failingLayoutPersistenceRepository) Read(context.Context, string) (appmodel.VersionedLayoutValue, bool, error) {
	return appmodel.VersionedLayoutValue{}, false, nil
}

type layoutReadFailureRepository struct{}

func (layoutReadFailureRepository) Write(context.Context, string, appmodel.VersionedLayoutValue) (appmodel.LayoutWriteResult, error) {
	return appmodel.LayoutWriteResult{}, nil
}

func (layoutReadFailureRepository) Read(context.Context, string) (appmodel.VersionedLayoutValue, bool, error) {
	return appmodel.VersionedLayoutValue{}, false, errors.New("layout database read unavailable")
}

type rejectingStateEmitter struct{ err error }

func (emitter rejectingStateEmitter) EmitStatePatch(context.Context, apperr.AppStatePatch) error {
	return emitter.err
}

type failOnceAtPatchEmitter struct {
	mu     sync.Mutex
	count  int
	failAt int
	failed bool
}

func (emitter *failOnceAtPatchEmitter) EmitStatePatch(context.Context, apperr.AppStatePatch) error {
	emitter.mu.Lock()
	defer emitter.mu.Unlock()
	emitter.count++
	if emitter.count == emitter.failAt && !emitter.failed {
		emitter.failed = true
		return errors.New("view publication rejected")
	}
	return nil
}

func (emitter *failOnceAtPatchEmitter) EmitAsyncError(context.Context, apperr.WireError) error {
	return nil
}
