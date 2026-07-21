package appmodel

import (
	"context"
	"encoding/json"
	"errors"
	"reflect"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/sanyokkua/go_mark_edit/internal/apperr"
)

// Proves: STORY-011-AC-1
// The initial query exposes one clean backend-minted untitled document as metadata and its empty buffer separately.
func TestInitialStateCreatesCleanUntitledDocument(t *testing.T) {
	service := NewAppModelService(nil)

	state, err := service.GetState(context.Background())
	if err != nil {
		t.Fatalf("GetState: %v", err)
	}
	if state.Snapshot.Revision != 0 {
		t.Fatalf("initial revision = %d, want 0", state.Snapshot.Revision)
	}
	if len(state.Snapshot.Documents) != 1 {
		t.Fatalf("initial documents = %d, want 1", len(state.Snapshot.Documents))
	}
	documentID := state.Snapshot.ActiveDocumentID
	document, ok := state.Snapshot.Documents[documentID]
	if !ok {
		t.Fatalf("active document %q is missing from the snapshot", documentID)
	}
	if documentID == "" || document.DocumentID != documentID {
		t.Fatalf("document id = %q / %q, want one stable backend-minted id", documentID, document.DocumentID)
	}
	if document.Title != "Untitled" || document.Path != "" || document.Dirty || document.Encoding != "utf-8" || document.LineEnding != "lf" {
		t.Fatalf("initial document metadata = %+v, want clean untitled utf-8/lf metadata", document)
	}
	if document.View.Arrangement != ArrangementSplit {
		t.Fatalf("initial arrangement = %q, want %q", document.View.Arrangement, ArrangementSplit)
	}
	if state.ActiveBuffer.DocumentID != documentID || state.ActiveBuffer.Content != "" {
		t.Fatalf("active buffer = %+v, want the active document's empty buffer", state.ActiveBuffer)
	}

	encoded, marshalErr := json.Marshal(state.Snapshot)
	if marshalErr != nil {
		t.Fatalf("marshal snapshot: %v", marshalErr)
	}
	if strings.Contains(string(encoded), "content") {
		t.Fatalf("metadata snapshot leaked document content: %s", encoded)
	}

	// Mutating a returned projection must not mutate the backend-owned model.
	state.Snapshot.Documents[documentID] = apperr.DocumentMetadata{DocumentID: documentID, Title: "changed"}
	delete(state.Snapshot.Documents, documentID)
	*state.Snapshot.UI.SidebarVisible = false
	fresh, freshErr := service.GetState(context.Background())
	if freshErr != nil {
		t.Fatalf("GetState after caller mutated snapshot: %v", freshErr)
	}
	freshDocument, present := fresh.Snapshot.Documents[documentID]
	if !present || freshDocument.Title != "Untitled" || freshDocument.Dirty || fresh.Snapshot.UI.SidebarVisible == nil || !*fresh.Snapshot.UI.SidebarVisible {
		t.Fatalf("backend model retained caller snapshot mutation: %+v", fresh)
	}
}

// Proves: STORY-011-AC-3
// Every successful command, including a no-op, emits one monotonic content-free patch with explicit sections.
func TestSuccessfulCommandsEmitOneRevisionedContentFreePatch(t *testing.T) {
	emitter := &recordingEmitter{}
	service := NewAppModelService(emitter)
	initial, err := service.GetState(context.Background())
	if err != nil {
		t.Fatalf("GetState: %v", err)
	}
	documentID := initial.Snapshot.ActiveDocumentID
	if err := service.UpdateBuffer(context.Background(), documentID, "words"); err != nil {
		t.Fatalf("UpdateBuffer: %v", err)
	}
	if err := service.UpdateBuffer(context.Background(), documentID, "words"); err != nil {
		t.Fatalf("no-op UpdateBuffer: %v", err)
	}
	if err := service.SetDocView(context.Background(), documentID, apperr.DocViewInput{
		EditorVisible:  true,
		PreviewVisible: true,
		Cursor:         apperr.CursorPosition{Line: 1, Column: 1},
		Selection: apperr.SelectionRange{
			Start: apperr.CursorPosition{Line: 1, Column: 1},
			End:   apperr.CursorPosition{Line: 1, Column: 1},
		},
	}); err != nil {
		t.Fatalf("SetDocView: %v", err)
	}
	falseValue := false
	zero := 0
	if err := service.SetUILayout(context.Background(), apperr.UILayout{
		SidebarVisible: &falseValue,
		SidebarWidth:   &zero,
	}); err != nil {
		t.Fatalf("SetUILayout: %v", err)
	}

	if len(emitter.patches) != 4 {
		t.Fatalf("patch count = %d, want exactly 4", len(emitter.patches))
	}
	for index, patch := range emitter.patches {
		if want := uint64(index + 1); patch.Revision != want {
			t.Errorf("patch %d revision = %d, want %d", index, patch.Revision, want)
		}
		encoded, marshalErr := json.Marshal(patch)
		if marshalErr != nil {
			t.Fatalf("marshal patch %d: %v", index, marshalErr)
		}
		if strings.Contains(string(encoded), "content") || strings.Contains(string(encoded), "activeBuffer") {
			t.Fatalf("patch %d leaked buffer data: %s", index, encoded)
		}
	}
	if emitter.patches[0].Documents == nil || emitter.patches[0].Documents.Upsert[documentID].WordCount != 1 {
		t.Fatalf("buffer patch = %+v, want a keyed derived metadata replacement", emitter.patches[0])
	}
	if emitter.patches[2].Documents == nil || emitter.patches[2].Documents.Upsert[documentID].View.Arrangement != ArrangementSplit {
		t.Fatalf("view patch = %+v, want a keyed metadata replacement", emitter.patches[2])
	}
	layoutPatch := emitter.patches[3].UI
	if layoutPatch == nil || layoutPatch.SidebarVisible == nil || *layoutPatch.SidebarVisible || layoutPatch.SidebarWidth == nil || *layoutPatch.SidebarWidth != 0 {
		t.Fatalf("layout patch = %+v, want false and zero fields retained", layoutPatch)
	}

	beforeRejected, getErr := service.GetState(context.Background())
	if getErr != nil {
		t.Fatalf("GetState before rejected command: %v", getErr)
	}
	if err := service.UpdateBuffer(context.Background(), "missing-document", "must not apply"); err == nil {
		t.Fatal("UpdateBuffer unknown document succeeded, want not-found error")
	}
	afterRejected, getErr := service.GetState(context.Background())
	if getErr != nil {
		t.Fatalf("GetState after rejected command: %v", getErr)
	}
	if !reflect.DeepEqual(afterRejected, beforeRejected) {
		t.Fatalf("rejected command changed state: got %+v, want %+v", afterRejected, beforeRejected)
	}
	if len(emitter.patches) != 4 {
		t.Fatalf("rejected command emitted a patch: got %d total, want 4", len(emitter.patches))
	}
}

type recordingEmitter struct {
	patches []apperr.AppStatePatch
}

func (emitter *recordingEmitter) EmitStatePatch(_ context.Context, patch apperr.AppStatePatch) error {
	emitter.patches = append(emitter.patches, patch)
	return nil
}

// Proves: STORY-011-AC-4
// View commands keep at least one pane visible and reject invalid one-based positions, ranges, and scroll offsets without a patch.
func TestSetDocViewKeepsAtLeastOnePaneVisible(t *testing.T) {
	cases := []struct {
		name string
		view apperr.DocViewInput
	}{
		{
			name: "both panes hidden",
			view: validDocView(false, false),
		},
		{
			name: "cursor line is nonpositive",
			view: func() apperr.DocViewInput {
				view := validDocView(true, false)
				view.Cursor.Line = 0
				return view
			}(),
		},
		{
			name: "selection endpoints are reversed",
			view: func() apperr.DocViewInput {
				view := validDocView(true, true)
				view.Selection.Start = apperr.CursorPosition{Line: 2, Column: 1}
				view.Selection.End = apperr.CursorPosition{Line: 1, Column: 1}
				return view
			}(),
		},
		{
			name: "editor scroll is negative",
			view: func() apperr.DocViewInput {
				view := validDocView(false, true)
				view.Scroll.Editor = -1
				return view
			}(),
		},
	}

	for _, tt := range cases {
		t.Run(tt.name, func(t *testing.T) {
			emitter := &recordingEmitter{}
			service := NewAppModelService(emitter)
			before, err := service.GetState(context.Background())
			if err != nil {
				t.Fatalf("GetState before invalid view: %v", err)
			}
			err = service.SetDocView(context.Background(), before.Snapshot.ActiveDocumentID, tt.view)
			var appError *apperr.AppError
			if !errors.As(err, &appError) || appError.Code != apperr.CodeValidation {
				t.Fatalf("SetDocView error = %v, want validation error", err)
			}
			after, getErr := service.GetState(context.Background())
			if getErr != nil {
				t.Fatalf("GetState after invalid view: %v", getErr)
			}
			if !reflect.DeepEqual(after, before) {
				t.Fatalf("invalid view changed state: got %+v, want %+v", after, before)
			}
			if len(emitter.patches) != 0 {
				t.Fatalf("invalid view emitted %d patches, want none", len(emitter.patches))
			}
		})
	}

	service := NewAppModelService(&recordingEmitter{})
	state, err := service.GetState(context.Background())
	if err != nil {
		t.Fatalf("GetState: %v", err)
	}
	view := validDocView(false, true)
	view.Cursor = apperr.CursorPosition{Line: 99, Column: 88}
	view.Selection = apperr.SelectionRange{
		Start: apperr.CursorPosition{Line: 70, Column: 1},
		End:   apperr.CursorPosition{Line: 80, Column: 2},
	}
	view.Scroll = apperr.ScrollOffsets{Editor: 12, Preview: 24}
	if err := service.SetDocView(context.Background(), state.Snapshot.ActiveDocumentID, view); err != nil {
		t.Fatalf("SetDocView with out-of-content positions: %v", err)
	}
	updated, err := service.GetState(context.Background())
	if err != nil {
		t.Fatalf("GetState after valid view: %v", err)
	}
	got := updated.Snapshot.Documents[state.Snapshot.ActiveDocumentID].View
	if got.Arrangement != ArrangementPreview || !reflect.DeepEqual(got.Cursor, view.Cursor) || !reflect.DeepEqual(got.Selection, view.Selection) || !reflect.DeepEqual(got.Scroll, view.Scroll) {
		t.Fatalf("stored view = %+v, want derived preview arrangement and retained restorable values", got)
	}
}

func validDocView(editorVisible, previewVisible bool) apperr.DocViewInput {
	position := apperr.CursorPosition{Line: 1, Column: 1}
	return apperr.DocViewInput{
		EditorVisible:  editorVisible,
		PreviewVisible: previewVisible,
		Cursor:         position,
		Selection:      apperr.SelectionRange{Start: position, End: position},
	}
}

// Proves: STORY-011-AC-5
// Layout changes remain in the process-owned model and merge explicit false and zero fields without a persistence collaborator.
func TestSetUILayoutUpdatesOnlyInMemoryLayout(t *testing.T) {
	service := NewAppModelService(&recordingEmitter{})
	state, err := service.GetState(context.Background())
	if err != nil {
		t.Fatalf("GetState before layout update: %v", err)
	}
	if state.Snapshot.Revision != 0 {
		t.Fatalf("initial revision = %d, want 0", state.Snapshot.Revision)
	}

	falseValue := false
	zero := 0
	if err := service.SetUILayout(context.Background(), apperr.UILayout{
		SidebarVisible: &falseValue,
		SidebarWidth:   &zero,
	}); err != nil {
		t.Fatalf("SetUILayout: %v", err)
	}
	updated, err := service.GetState(context.Background())
	if err != nil {
		t.Fatalf("GetState after layout update: %v", err)
	}
	if updated.Snapshot.Revision != 1 {
		t.Fatalf("layout revision = %d, want 1", updated.Snapshot.Revision)
	}
	layout := updated.Snapshot.UI
	if layout.SidebarVisible == nil || *layout.SidebarVisible || layout.SidebarWidth == nil || *layout.SidebarWidth != 0 {
		t.Fatalf("in-memory layout = %+v, want explicit false and zero values", layout)
	}

	falseValue = true
	zero = 42
	fresh, err := service.GetState(context.Background())
	if err != nil {
		t.Fatalf("GetState after caller changed inputs: %v", err)
	}
	if *fresh.Snapshot.UI.SidebarVisible || *fresh.Snapshot.UI.SidebarWidth != 0 {
		t.Fatalf("layout retained caller pointer alias: %+v", fresh.Snapshot.UI)
	}
}

// Proves: STORY-011-AC-2
// Buffer changes use the document-command seam, update the stable content accessor, and derive dirty/token metadata.
func TestUpdateBufferUsesDocumentCommandSeamAndContentAccessor(t *testing.T) {
	service := NewAppModelService(&recordingEmitter{})
	state, err := service.GetState(context.Background())
	if err != nil {
		t.Fatalf("GetState: %v", err)
	}
	documentID := state.Snapshot.ActiveDocumentID

	commands := service.DocumentCommands()
	if commands == nil {
		t.Fatal("DocumentCommands returned nil")
	}
	content := "first\u2003second\u3000世界"
	if err := service.UpdateBuffer(context.Background(), documentID, content); err != nil {
		t.Fatalf("UpdateBuffer: %v", err)
	}
	accepted, err := service.ContentAccessor().Content(context.Background(), documentID)
	if err != nil {
		t.Fatalf("Content accessor: %v", err)
	}
	if accepted != content {
		t.Fatalf("accepted content = %q, want %q", accepted, content)
	}

	updated, err := service.GetState(context.Background())
	if err != nil {
		t.Fatalf("GetState after buffer update: %v", err)
	}
	document := updated.Snapshot.Documents[documentID]
	if !document.Dirty || document.WordCount != 3 {
		t.Fatalf("derived document metadata = %+v, want dirty with 3 Unicode-whitespace-delimited words", document)
	}

	if err := commands.UpdateBuffer(context.Background(), documentID, ""); err != nil {
		t.Fatalf("command seam UpdateBuffer baseline: %v", err)
	}
	returned, err := service.GetState(context.Background())
	if err != nil {
		t.Fatalf("GetState after restoring baseline: %v", err)
	}
	document = returned.Snapshot.Documents[documentID]
	if document.Dirty || document.WordCount != 0 {
		t.Fatalf("baseline document metadata = %+v, want clean with zero words", document)
	}
}

// Proves: STORY-011-AC-3
// A blocked publication keeps later mutations out of the public event stream until the preceding revision is published.
func TestMutationsPublishPatchesInRevisionOrder(t *testing.T) {
	emitter := newBlockingEmitter()
	service := NewAppModelService(emitter)
	state, err := service.GetState(context.Background())
	if err != nil {
		t.Fatalf("GetState: %v", err)
	}

	firstDone := make(chan error, 1)
	go func() {
		firstDone <- service.UpdateBuffer(context.Background(), state.Snapshot.ActiveDocumentID, "first")
	}()
	select {
	case <-emitter.firstPublication:
	case <-time.After(time.Second):
		t.Fatal("first publication did not begin")
	}
	if patches := emitter.Patches(); len(patches) != 1 || patches[0].Revision != 1 {
		t.Fatalf("patch stream while first publication blocks = %+v, want exactly revision [1]", patches)
	}

	secondDone := make(chan error, 1)
	go func() {
		secondDone <- service.UpdateBuffer(context.Background(), state.Snapshot.ActiveDocumentID, "second")
	}()
	select {
	case secondErr := <-secondDone:
		t.Fatalf("second mutation returned before revision one published: %v", secondErr)
	case <-time.After(100 * time.Millisecond):
	}
	if patches := emitter.Patches(); len(patches) != 1 || patches[0].Revision != 1 {
		t.Fatalf("patch stream admitted a later revision before release: %+v, want exactly revision [1]", patches)
	}

	close(emitter.releaseFirst)
	if firstErr := <-firstDone; firstErr != nil {
		t.Fatalf("first UpdateBuffer: %v", firstErr)
	}
	if secondErr := <-secondDone; secondErr != nil {
		t.Fatalf("second UpdateBuffer: %v", secondErr)
	}

	patches := emitter.Patches()
	if len(patches) != 2 || patches[0].Revision != 1 || patches[1].Revision != 2 {
		t.Fatalf("observed patch revisions = %+v, want [1 2]", patches)
	}
}

// Proves: STORY-011-AC-3
// A publication error or panic rolls back every command and returns an internal handler envelope without a successful patch.
func TestPublicationFailureRollsBackMutations(t *testing.T) {
	mutations := []struct {
		name  string
		apply func(service *AppModelService, documentID string) error
	}{
		{
			name: "buffer",
			apply: func(service *AppModelService, documentID string) error {
				return service.UpdateBuffer(context.Background(), documentID, "changed")
			},
		},
		{
			name: "view",
			apply: func(service *AppModelService, documentID string) error {
				return service.SetDocView(context.Background(), documentID, validDocView(true, false))
			},
		},
		{
			name: "layout",
			apply: func(service *AppModelService, _ string) error {
				visible := false
				return service.SetUILayout(context.Background(), apperr.UILayout{SidebarVisible: &visible})
			},
		},
	}
	for _, failure := range []struct {
		name  string
		panic bool
	}{
		{name: "returned error"},
		{name: "emitter panic", panic: true},
	} {
		for _, mutation := range mutations {
			t.Run(failure.name+" "+mutation.name, func(t *testing.T) {
				emitter := &failingEmitter{panic: failure.panic}
				service := NewAppModelService(emitter)
				before, err := service.GetState(context.Background())
				if err != nil {
					t.Fatalf("GetState before mutation: %v", err)
				}
				err = mutation.apply(service, before.Snapshot.ActiveDocumentID)
				var appError *apperr.AppError
				if !errors.As(err, &appError) || appError.Code != apperr.CodeInternal {
					t.Fatalf("mutation error = %v, want internal error", err)
				}
				after, getErr := service.GetState(context.Background())
				if getErr != nil {
					t.Fatalf("GetState after failed publication: %v", getErr)
				}
				if !reflect.DeepEqual(after, before) {
					t.Fatalf("failed publication committed mutation: got %+v, want %+v", after, before)
				}
				if emitter.attempts != 1 {
					t.Fatalf("failed publication attempted %d patches, want exactly one", emitter.attempts)
				}
				if emitter.successes != 0 {
					t.Fatalf("failed publication recorded %d successful patches, want none", emitter.successes)
				}
			})
		}
	}

	for _, failure := range []struct {
		name  string
		panic bool
	}{
		{name: "returned error"},
		{name: "emitter panic", panic: true},
	} {
		for _, mutation := range []struct {
			name  string
			apply func(handler *AppModelHandler, documentID string) apperr.VoidResult
		}{
			{
				name: "buffer",
				apply: func(handler *AppModelHandler, documentID string) apperr.VoidResult {
					return handler.UpdateBuffer(documentID, "changed")
				},
			},
			{
				name: "view",
				apply: func(handler *AppModelHandler, documentID string) apperr.VoidResult {
					return handler.SetDocView(documentID, validDocView(true, false))
				},
			},
			{
				name: "layout",
				apply: func(handler *AppModelHandler, _ string) apperr.VoidResult {
					visible := false
					return handler.SetUILayout(apperr.UILayout{SidebarVisible: &visible})
				},
			},
		} {
			t.Run("handler "+failure.name+" "+mutation.name, func(t *testing.T) {
				emitter := &failingEmitter{panic: failure.panic}
				service := NewAppModelService(emitter)
				before, err := service.GetState(context.Background())
				if err != nil {
					t.Fatalf("GetState for handler: %v", err)
				}
				handler := NewAppModelHandler(service, nil, func() context.Context { return context.Background() })
				result := mutation.apply(handler, before.Snapshot.ActiveDocumentID)
				if result.Error == nil || result.Error.Code != apperr.CodeInternal {
					t.Fatalf("handler publication failure = %+v, want internal envelope", result)
				}
				after, getErr := service.GetState(context.Background())
				if getErr != nil {
					t.Fatalf("GetState after handler failure: %v", getErr)
				}
				if !reflect.DeepEqual(after, before) {
					t.Fatalf("handler publication failure committed mutation: got %+v, want %+v", after, before)
				}
				if emitter.attempts != 1 || emitter.successes != 0 {
					t.Fatalf("handler publication attempts/successes = %d/%d, want 1/0", emitter.attempts, emitter.successes)
				}
			})
		}
	}
}

// Proves: STORY-011-AC-3
// A missing publisher is an internal failure: every command rolls back and no handler reports success without a state patch.
func TestNilEmitterRollsBackMutations(t *testing.T) {
	mutations := []struct {
		name  string
		apply func(service *AppModelService, documentID string) error
	}{
		{
			name: "buffer",
			apply: func(service *AppModelService, documentID string) error {
				return service.UpdateBuffer(context.Background(), documentID, "changed")
			},
		},
		{
			name: "view",
			apply: func(service *AppModelService, documentID string) error {
				return service.SetDocView(context.Background(), documentID, validDocView(true, false))
			},
		},
		{
			name: "layout",
			apply: func(service *AppModelService, _ string) error {
				visible := false
				return service.SetUILayout(context.Background(), apperr.UILayout{SidebarVisible: &visible})
			},
		},
	}
	for _, mutation := range mutations {
		t.Run(mutation.name, func(t *testing.T) {
			service := NewAppModelService(nil)
			before, err := service.GetState(context.Background())
			if err != nil {
				t.Fatalf("GetState before mutation: %v", err)
			}
			err = mutation.apply(service, before.Snapshot.ActiveDocumentID)
			var appError *apperr.AppError
			if !errors.As(err, &appError) || appError.Code != apperr.CodeInternal {
				t.Fatalf("nil-emitter mutation error = %v, want internal error", err)
			}
			after, getErr := service.GetState(context.Background())
			if getErr != nil {
				t.Fatalf("GetState after nil-emitter mutation: %v", getErr)
			}
			if !reflect.DeepEqual(after, before) {
				t.Fatalf("nil emitter committed mutation: got %+v, want %+v", after, before)
			}
		})
	}

	for _, mutation := range []struct {
		name  string
		apply func(handler *AppModelHandler, documentID string) apperr.VoidResult
	}{
		{
			name: "buffer",
			apply: func(handler *AppModelHandler, documentID string) apperr.VoidResult {
				return handler.UpdateBuffer(documentID, "changed")
			},
		},
		{
			name: "view",
			apply: func(handler *AppModelHandler, documentID string) apperr.VoidResult {
				return handler.SetDocView(documentID, validDocView(true, false))
			},
		},
		{
			name: "layout",
			apply: func(handler *AppModelHandler, _ string) apperr.VoidResult {
				visible := false
				return handler.SetUILayout(apperr.UILayout{SidebarVisible: &visible})
			},
		},
	} {
		t.Run("handler "+mutation.name, func(t *testing.T) {
			service := NewAppModelService(nil)
			before, err := service.GetState(context.Background())
			if err != nil {
				t.Fatalf("GetState for handler: %v", err)
			}
			handler := NewAppModelHandler(service, nil, func() context.Context { return context.Background() })
			result := mutation.apply(handler, before.Snapshot.ActiveDocumentID)
			if result.Error == nil || result.Error.Code != apperr.CodeInternal {
				t.Fatalf("nil-emitter handler result = %+v, want internal envelope", result)
			}
			after, getErr := service.GetState(context.Background())
			if getErr != nil {
				t.Fatalf("GetState after nil-emitter handler mutation: %v", getErr)
			}
			if !reflect.DeepEqual(after, before) {
				t.Fatalf("nil-emitter handler committed mutation: got %+v, want %+v", after, before)
			}
		})
	}
}

type blockingEmitter struct {
	mu               sync.Mutex
	patches          []apperr.AppStatePatch
	firstPublication chan struct{}
	releaseFirst     chan struct{}
	firstOnce        sync.Once
}

func newBlockingEmitter() *blockingEmitter {
	return &blockingEmitter{
		firstPublication: make(chan struct{}),
		releaseFirst:     make(chan struct{}),
	}
}

func (emitter *blockingEmitter) EmitStatePatch(_ context.Context, patch apperr.AppStatePatch) error {
	emitter.mu.Lock()
	emitter.patches = append(emitter.patches, patch)
	emitter.mu.Unlock()
	blocked := false
	emitter.firstOnce.Do(func() {
		blocked = true
		close(emitter.firstPublication)
	})
	if blocked {
		<-emitter.releaseFirst
	}
	return nil
}

func (emitter *blockingEmitter) Patches() []apperr.AppStatePatch {
	emitter.mu.Lock()
	defer emitter.mu.Unlock()
	return append([]apperr.AppStatePatch(nil), emitter.patches...)
}

type failingEmitter struct {
	attempts  int
	panic     bool
	successes int
}

func (emitter *failingEmitter) EmitStatePatch(_ context.Context, _ apperr.AppStatePatch) error {
	emitter.attempts++
	if emitter.panic {
		panic("event publication failed")
	}
	return errors.New("event publication failed")
}
