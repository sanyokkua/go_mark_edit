package appmodel_test

import (
	"context"
	"os"
	"path/filepath"
	"testing"

	"github.com/sanyokkua/go_mark_edit/internal/apperr"
	. "github.com/sanyokkua/go_mark_edit/internal/appmodel"
)

func TestOpeningAFileReplacesTheEmptyPlaceholderAndPromotesRecency(t *testing.T) {
	service := NewAppModelServiceForHost(WithEmitter(&recordingEmitter{}))
	path := filepath.Join(t.TempDir(), "notes.md")
	if err := os.WriteFile(path, []byte("notes\n"), 0o640); err != nil {
		t.Fatalf("write fixture: %v", err)
	}

	opened := service.OpenPath(context.Background(), path, 0)
	if opened.Status != apperr.OpenStatusOpened || opened.DocumentID == "" || opened.ActiveBuffer == nil {
		t.Fatalf("OpenPath = %+v, want opened document and buffer acknowledgement", opened)
	}
	state, err := service.GetState(context.Background())
	if err != nil {
		t.Fatalf("GetState after open: %v", err)
	}
	if len(state.Snapshot.Documents) != 1 || state.Snapshot.ActiveDocumentID != opened.DocumentID {
		t.Fatalf("opened state = %+v, want one active file document", state.Snapshot)
	}
	if got := state.Snapshot.Documents[opened.DocumentID].Path; got == "" {
		t.Fatal("opened metadata has no canonical path")
	}
	if len(state.Snapshot.RecentItems) != 1 || state.Snapshot.RecentItems[0].Path != state.Snapshot.Documents[opened.DocumentID].Path || state.Snapshot.RecentItems[0].Kind != "file" {
		t.Fatalf("recent items = %v, want the canonical opened file", state.Snapshot.RecentItems)
	}

	focused := service.OpenPath(context.Background(), path, state.Snapshot.TabSetRevision)
	if focused.Status != apperr.OpenStatusFocused || focused.DocumentID != opened.DocumentID {
		t.Fatalf("opening the same canonical path = %+v, want focused existing tab", focused)
	}
	state, err = service.GetState(context.Background())
	if err != nil {
		t.Fatalf("GetState after duplicate open: %v", err)
	}
	if len(state.Snapshot.Documents) != 1 {
		t.Fatalf("duplicate open created another tab: %+v", state.Snapshot)
	}
}

func TestNewDocumentKeepsAnOpenedFileAndUsesEditorDefaults(t *testing.T) {
	service := NewAppModelServiceForHost(WithEmitter(&recordingEmitter{}))
	path, openedID := openAutosaveDocument(t, service, "notes\n")
	state, err := service.GetState(context.Background())
	if err != nil {
		t.Fatalf("GetState after open: %v", err)
	}
	created := service.NewDocument(context.Background(), state.Snapshot.TabSetRevision)
	if created.Data == nil || created.Data.DocumentID == openedID {
		t.Fatalf("NewDocument = %+v, want a distinct untitled document", created)
	}
	state, err = service.GetState(context.Background())
	if err != nil {
		t.Fatalf("GetState after NewDocument: %v", err)
	}
	if len(state.Snapshot.Documents) != 2 || state.Snapshot.ActiveDocumentID != created.Data.DocumentID {
		t.Fatalf("state after NewDocument = %+v, want opened file plus active untitled", state.Snapshot)
	}
	untitled := state.Snapshot.Documents[created.Data.DocumentID]
	if untitled.Path != "" || untitled.View.Arrangement != ArrangementEditor || !untitled.View.EditorVisible || untitled.View.PreviewVisible {
		t.Fatalf("untitled defaults = %+v, want editor-only pathless document", untitled)
	}
	if _, err := os.Stat(path); err != nil {
		t.Fatalf("opened file disappeared: %v", err)
	}
}

func TestOpeningInViewerModeKeepsTheArrangementAndReportsReadingMode(t *testing.T) {
	service := NewAppModelServiceForHost(WithEmitter(&recordingEmitter{}))
	service.SetDefaultOpenMode(OpenModeViewer)
	path := filepath.Join(t.TempDir(), "viewer.md")
	if err := os.WriteFile(path, []byte("preview\n"), 0o640); err != nil {
		t.Fatalf("write fixture: %v", err)
	}
	opened := service.OpenPath(context.Background(), path, 0)
	if opened.Status != apperr.OpenStatusOpened || !opened.ReadingMode {
		t.Fatalf("viewer open = %+v, want opened with readingMode", opened)
	}
	state, err := service.GetState(context.Background())
	if err != nil {
		t.Fatalf("GetState: %v", err)
	}
	view := state.Snapshot.Documents[opened.DocumentID].View
	if view.Arrangement != ArrangementSplit || !view.EditorVisible || !view.PreviewVisible {
		t.Fatalf("viewer-mode view = %+v, want the Split arrangement kept for Reading exit", view)
	}

	focused := service.OpenPath(context.Background(), path, state.Snapshot.TabSetRevision)
	if focused.Status != apperr.OpenStatusFocused || focused.ReadingMode {
		t.Fatalf("duplicate open = %+v, want focused without readingMode", focused)
	}
	refused := service.OpenPath(context.Background(), filepath.Join(t.TempDir(), "missing.md"), state.Snapshot.TabSetRevision)
	if refused.Error == nil || refused.ReadingMode {
		t.Fatalf("missing-file open = %+v, want a refusal without readingMode", refused)
	}
	created := service.NewDocument(context.Background(), state.Snapshot.TabSetRevision)
	if created.Data == nil {
		t.Fatalf("NewDocument = %+v", created)
	}
}

func TestOpeningInEditorModeReportsNoReadingMode(t *testing.T) {
	service := NewAppModelServiceForHost(WithEmitter(&recordingEmitter{}))
	path := filepath.Join(t.TempDir(), "editor.md")
	if err := os.WriteFile(path, []byte("text\n"), 0o640); err != nil {
		t.Fatalf("write fixture: %v", err)
	}
	opened := service.OpenPath(context.Background(), path, 0)
	if opened.Status != apperr.OpenStatusOpened || opened.ReadingMode {
		t.Fatalf("editor open = %+v, want opened without readingMode", opened)
	}
}

func TestLifecycleCommandsRejectStaleTabRevisionsWithoutMutation(t *testing.T) {
	emitter := &recordingEmitter{}
	service := NewAppModelServiceForHost(WithEmitter(emitter))
	initial, err := service.GetState(context.Background())
	if err != nil {
		t.Fatalf("initial state: %v", err)
	}
	created := service.NewDocument(context.Background(), initial.Snapshot.TabSetRevision)
	if created.Data == nil {
		t.Fatalf("NewDocument = %+v", created)
	}
	before, err := service.GetState(context.Background())
	if err != nil {
		t.Fatalf("state before stale commands: %v", err)
	}
	patches := emitter.Count()
	stale := initial.Snapshot.TabSetRevision

	for name, invoke := range map[string]func() *apperr.ClassifiedError{
		"activate": func() *apperr.ClassifiedError {
			return service.ActivateDocument(context.Background(), created.Data.DocumentID, stale).Error
		},
		"reorder": func() *apperr.ClassifiedError {
			return service.ReorderDocument(context.Background(), created.Data.DocumentID, 0, stale).Error
		},
		"close": func() *apperr.ClassifiedError {
			return service.CloseDocument(context.Background(), created.Data.DocumentID, stale).Error
		},
	} {
		t.Run(name, func(t *testing.T) {
			if classified := invoke(); classified == nil {
				t.Fatal("stale command succeeded")
			}
		})
	}
	after, err := service.GetState(context.Background())
	if err != nil {
		t.Fatalf("state after stale commands: %v", err)
	}
	if after.Snapshot.Revision != before.Snapshot.Revision || after.Snapshot.TabSetRevision != before.Snapshot.TabSetRevision || emitter.Count() != patches {
		t.Fatalf("stale commands changed state or emitted patches: before=%+v after=%+v patches=%d/%d", before.Snapshot, after.Snapshot, patches, emitter.Count())
	}
}
