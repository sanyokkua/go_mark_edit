package appmodel

import (
	"context"
	"errors"
	"reflect"
	"strings"
	"testing"

	"github.com/sanyokkua/go_mark_edit/internal/apperr"
)

// Proves: STORY-011-AC-6
// Bound methods use the exact typed envelopes, take no context argument, and turn a service panic into an internal envelope.
func TestHandlerReturnsTypedResultsAndRecoversPanics(t *testing.T) {
	handler := NewAppModelHandler(&fakeAppModelService{}, nil, func() context.Context { return context.Background() })
	typeOfHandler := reflect.TypeOf(handler)
	cases := []struct {
		method string
		inputs int
		output reflect.Type
	}{
		{"GetState", 1, reflect.TypeFor[apperr.StateResult]()},
		{"NewDocument", 2, reflect.TypeFor[apperr.DocumentTransitionOutcome]()},
		{"ActivateDocument", 3, reflect.TypeFor[apperr.DocumentTransitionOutcome]()},
		{"ReorderDocument", 4, reflect.TypeFor[apperr.TabTransitionResult]()},
		{"CloseDocument", 3, reflect.TypeFor[apperr.TabTransitionResult]()},
		{"CopyPath", 2, reflect.TypeFor[apperr.CopyPathResult]()},
		{"RevealInFileManager", 2, reflect.TypeFor[apperr.RevealResult]()},
		{"OpenDocument", 2, reflect.TypeFor[apperr.OpenResult]()},
		{"UpdateBuffer", 3, reflect.TypeFor[apperr.VoidResult]()},
		{"SetDocView", 3, reflect.TypeFor[apperr.VoidResult]()},
		{"SetUILayout", 2, reflect.TypeFor[apperr.VoidResult]()},
		{"Save", 4, reflect.TypeFor[apperr.WriteResult]()},
		{"SaveAs", 4, reflect.TypeFor[apperr.WriteResult]()},
		{"CheckExternalChanges", 2, reflect.TypeFor[apperr.ConflictResult]()},
		{"ReloadFromDisk", 4, reflect.TypeFor[apperr.ConflictResult]()},
		{"AuthorizeKeepMine", 5, reflect.TypeFor[apperr.ConflictResult]()},
		{"SkipConflict", 4, reflect.TypeFor[apperr.ConflictResult]()},
		{"CancelConflict", 4, reflect.TypeFor[apperr.ConflictResult]()},
	}
	for _, tt := range cases {
		t.Run(tt.method, func(t *testing.T) {
			method, ok := typeOfHandler.MethodByName(tt.method)
			if !ok {
				t.Fatalf("missing bound method %s", tt.method)
			}
			if method.Type.NumIn() != tt.inputs {
				t.Fatalf("%s input count = %d, want %d with no context parameter", tt.method, method.Type.NumIn(), tt.inputs)
			}
			if method.Type.NumOut() != 1 || method.Type.Out(0) != tt.output {
				t.Fatalf("%s output = %v, want %v", tt.method, method.Type.Out(0), tt.output)
			}
		})
	}

	for _, method := range []string{"GetState", "NewDocument", "OpenDocument", "ActivateDocument", "ReorderDocument", "CloseDocument", "CopyPath", "RevealInFileManager", "UpdateBuffer", "SetDocView", "SetUILayout", "Save", "SaveAs"} {
		t.Run(method+" recovers without emitting a patch", func(t *testing.T) {
			service := &fakeAppModelService{panicOn: method}
			panickingHandler := NewAppModelHandler(service, nil, nil)

			var result apperr.VoidResult
			switch method {
			case "GetState":
				stateResult := panickingHandler.GetState()
				if stateResult.Data != nil || stateResult.Error == nil || stateResult.Error.Code != apperr.CodeInternal {
					t.Fatalf("panic result = %+v, want an internal envelope without data", stateResult)
				}
			case "NewDocument":
				transition := panickingHandler.NewDocument(0)
				if transition.Data != nil || transition.Error == nil || transition.Error.Category != apperr.ClassifiedIOFailure {
					t.Fatalf("panic result = %+v, want a classified internal transition error", transition)
				}
			case "ActivateDocument":
				transition := panickingHandler.ActivateDocument("doc", 0)
				if transition.Data != nil || transition.Error == nil || transition.Error.Category != apperr.ClassifiedSystemCommandFailure {
					t.Fatalf("panic result = %+v, want classified activation refusal", transition)
				}
			case "ReorderDocument":
				transition := panickingHandler.ReorderDocument("doc", 0, 0)
				if transition.Error == nil || transition.Error.Category != apperr.ClassifiedSystemCommandFailure {
					t.Fatalf("panic result = %+v, want classified reorder refusal", transition)
				}
			case "CloseDocument":
				transition := panickingHandler.CloseDocument("doc", 0)
				if transition.Error == nil || transition.Error.Category != apperr.ClassifiedSystemCommandFailure {
					t.Fatalf("panic result = %+v, want classified close refusal", transition)
				}
			case "CopyPath":
				pathResult := panickingHandler.CopyPath("doc")
				if pathResult.Error == nil || pathResult.Error.Category != apperr.ClassifiedSystemCommandFailure {
					t.Fatalf("panic result = %+v, want classified copy refusal", pathResult)
				}
			case "RevealInFileManager":
				revealResult := panickingHandler.RevealInFileManager("doc")
				if revealResult.Error == nil || revealResult.Error.Category != apperr.ClassifiedSystemCommandFailure {
					t.Fatalf("panic result = %+v, want classified reveal refusal", revealResult)
				}
			case "OpenDocument":
				opened := panickingHandler.OpenDocument(0)
				if opened.Status != apperr.OpenStatusRefused || opened.Error == nil || opened.Error.Category != apperr.ClassifiedSystemCommandFailure {
					t.Fatalf("panic result = %+v, want a classified dialog error", opened)
				}
			case "UpdateBuffer":
				result = panickingHandler.UpdateBuffer("doc", "content")
			case "SetDocView":
				result = panickingHandler.SetDocView("doc", validDocView(true, true))
			case "SetUILayout":
				result = panickingHandler.SetUILayout(apperr.UILayout{})
			case "Save":
				writeResult := panickingHandler.Save("doc", 1, "")
				if writeResult.Status != apperr.WriteStatusRefused || writeResult.Error == nil || writeResult.Error.Category != apperr.ClassifiedSystemCommandFailure {
					t.Fatalf("panic result = %+v, want classified Save refusal", writeResult)
				}
			case "SaveAs":
				writeResult := panickingHandler.SaveAs("doc", 1, "")
				if writeResult.Status != apperr.WriteStatusRefused || writeResult.Error == nil || writeResult.Error.Category != apperr.ClassifiedSystemCommandFailure {
					t.Fatalf("panic result = %+v, want classified Save As refusal", writeResult)
				}
			}
			if method != "GetState" && method != "NewDocument" && method != "OpenDocument" && method != "ActivateDocument" && method != "ReorderDocument" && method != "CloseDocument" && method != "CopyPath" && method != "RevealInFileManager" && method != "Save" && method != "SaveAs" && (result.Error == nil || result.Error.Code != apperr.CodeInternal) {
				t.Fatalf("panic result = %+v, want an internal envelope", result)
			}
			if service.emissions != 0 {
				t.Fatalf("recovered %s panic emitted %d patches, want none", method, service.emissions)
			}
		})
	}
}

func TestHandlerConflictMethodsRecoverClassifiedErrors(t *testing.T) {
	for _, method := range []string{"CheckExternalChanges", "ReloadFromDisk", "AuthorizeKeepMine", "SkipConflict", "CancelConflict"} {
		t.Run(method, func(t *testing.T) {
			handler := NewAppModelHandler(&fakeAppModelService{panicOn: method}, nil, nil)
			var result apperr.ConflictResult
			switch method {
			case "CheckExternalChanges":
				result = handler.CheckExternalChanges("doc")
			case "ReloadFromDisk":
				result = handler.ReloadFromDisk("doc", 1, apperr.DiskVersion{})
			case "AuthorizeKeepMine":
				result = handler.AuthorizeKeepMine("doc", 1, "path", apperr.DiskVersion{})
			case "SkipConflict":
				result = handler.SkipConflict("doc", 1, apperr.DiskVersion{})
			case "CancelConflict":
				result = handler.CancelConflict("doc", 1, apperr.DiskVersion{})
			}
			if result.Error == nil || result.Error.Category != apperr.ClassifiedSystemCommandFailure {
				t.Fatalf("panic result = %+v", result)
			}
		})
	}
}

// Proves: FR-WS-012
// A rejected layout persistence write remains a safe typed bridge envelope and
// never exposes its local failure cause.
func TestHandlerClassifiesRejectedLayoutWrite(t *testing.T) {
	handler := NewAppModelHandler(&fakeAppModelService{layoutError: errors.New("/private/user/settings.db")}, nil, nil)
	result := handler.SetUILayout(apperr.UILayout{})
	if result.Error == nil || result.Error.Code != apperr.CodeInternal {
		t.Fatalf("rejected layout result = %+v, want internal typed envelope", result)
	}
	if result.Error.Message == "/private/user/settings.db" {
		t.Fatalf("layout failure leaked private path: %+v", result.Error)
	}
}

// Proves: FR-WS-012
// A real layout persistence failure becomes one safe classified file-operation
// envelope with a stable layout subject and no raw failure data.
func TestHandlerClassifiesLayoutPersistenceFailuresWithSafeSubject(t *testing.T) {
	service := NewAppModelServiceWithLayoutRepository(
		&recordingEmitter{},
		failingLayoutRepository{err: errors.New("/private/user/settings.db")},
	)
	handler := NewAppModelHandler(service, nil, nil)
	visible := false

	result := handler.SetUILayout(apperr.UILayout{SidebarVisible: &visible})

	if result.Error == nil || result.Error.Code != apperr.CodeIO {
		t.Fatalf("layout persistence result = %+v, want io typed envelope", result)
	}
	if result.Error.Details["operation"] != "update layout" {
		t.Fatalf("layout persistence details = %+v, want safe layout operation", result.Error.Details)
	}
	for _, forbidden := range []string{
		"/private/user/settings.db",
		"settings.db",
	} {
		if strings.Contains(result.Error.Message, forbidden) || strings.Contains(result.Error.Title, forbidden) {
			t.Fatalf("layout persistence leaked raw failure data %q: %+v", forbidden, result.Error)
		}
	}
}

type fakeAppModelService struct {
	panicOn     string
	emissions   int
	layoutError error
}

func (service *fakeAppModelService) OpenFromDialog(_ context.Context, _ uint64) apperr.OpenResult {
	if service.panicOn == "OpenDocument" {
		panic("service panic")
	}
	service.emissions++
	return apperr.OpenResult{Status: apperr.OpenStatusCancelled}
}

func (service *fakeAppModelService) OpenPath(_ context.Context, _ string, _ uint64) apperr.OpenResult {
	if service.panicOn == "OpenRecentFile" {
		panic("service panic")
	}
	service.emissions++
	return apperr.OpenResult{Status: apperr.OpenStatusCancelled}
}

func (service *fakeAppModelService) ReopenLastFile(_ context.Context, _ uint64) apperr.OpenResult {
	if service.panicOn == "ReopenLastFile" {
		panic("service panic")
	}
	service.emissions++
	return apperr.OpenResult{Status: apperr.OpenStatusCancelled}
}

// Proves: FR-FT-002 (partial — only the cancellation half; the picker's suffix filter is unproven; T157)
func TestOpenCancellationHasNoMutation(t *testing.T) {
	emitter := &recordingEmitter{}
	service := NewEmptyAppModelService(emitter)
	service.SetDocumentOpenDialog(cancellationDialog{})
	before, err := service.GetState(context.Background())
	if err != nil {
		t.Fatalf("GetState before cancellation: %v", err)
	}
	outcome := service.OpenFromDialog(context.Background(), before.Snapshot.TabSetRevision)
	if outcome.Status != apperr.OpenStatusCancelled || outcome.Error != nil {
		t.Fatalf("cancellation outcome = %+v", outcome)
	}
	after, err := service.GetState(context.Background())
	if err != nil {
		t.Fatalf("GetState after cancellation: %v", err)
	}
	if !reflect.DeepEqual(after, before) || len(emitter.patches) != 0 {
		t.Fatalf("cancellation mutated state: before=%+v after=%+v patches=%d", before, after, len(emitter.patches))
	}
}

type cancellationDialog struct{}

func (cancellationDialog) ChooseOpenFile(context.Context) (string, error) { return "", nil }

func (service *fakeAppModelService) GetState(_ context.Context) (apperr.AppState, error) {
	if service.panicOn == "GetState" {
		panic("service panic")
	}
	return apperr.AppState{}, nil
}

func (service *fakeAppModelService) NewDocument(_ context.Context, _ uint64) apperr.DocumentTransitionOutcome {
	if service.panicOn == "NewDocument" {
		panic("service panic")
	}
	service.emissions++
	return apperr.DocumentTransitionOutcome{}
}

func (service *fakeAppModelService) ActivateDocument(_ context.Context, _ string, _ uint64) apperr.DocumentTransitionOutcome {
	if service.panicOn == "ActivateDocument" {
		panic("service panic")
	}
	service.emissions++
	return apperr.DocumentTransitionOutcome{}
}

func (service *fakeAppModelService) ReorderDocument(_ context.Context, _ string, _ int, _ uint64) apperr.TabTransitionResult {
	if service.panicOn == "ReorderDocument" {
		panic("service panic")
	}
	service.emissions++
	return apperr.TabTransitionResult{}
}

func (service *fakeAppModelService) CloseDocument(_ context.Context, _ string, _ uint64) apperr.TabTransitionResult {
	if service.panicOn == "CloseDocument" {
		panic("service panic")
	}
	service.emissions++
	return apperr.TabTransitionResult{}
}

func (service *fakeAppModelService) CopyPath(_ context.Context, _ string) apperr.CopyPathResult {
	if service.panicOn == "CopyPath" {
		panic("service panic")
	}
	service.emissions++
	return apperr.CopyPathResult{}
}

func (service *fakeAppModelService) RevealInFileManager(_ context.Context, _ string) apperr.RevealResult {
	if service.panicOn == "RevealInFileManager" {
		panic("service panic")
	}
	service.emissions++
	return apperr.RevealResult{}
}

func (service *fakeAppModelService) UpdateBuffer(_ context.Context, _, _ string) error {
	if service.panicOn == "UpdateBuffer" {
		panic("service panic")
	}
	service.emissions++
	return nil
}

func (service *fakeAppModelService) SetDocView(_ context.Context, _ string, _ apperr.DocViewInput) error {
	if service.panicOn == "SetDocView" {
		panic("service panic")
	}
	service.emissions++
	return nil
}

func (service *fakeAppModelService) SetUILayout(_ context.Context, _ apperr.UILayout) error {
	if service.panicOn == "SetUILayout" {
		panic("service panic")
	}
	if service.layoutError != nil {
		return service.layoutError
	}
	service.emissions++
	return nil
}

func (service *fakeAppModelService) Save(_ context.Context, _ string, _ uint64, _ string) apperr.WriteResult {
	if service.panicOn == "Save" {
		panic("service panic")
	}
	service.emissions++
	return apperr.WriteResult{Status: apperr.WriteStatusCancelled}
}

func (service *fakeAppModelService) SaveAs(_ context.Context, _ string, _ uint64, _ string) apperr.WriteResult {
	if service.panicOn == "SaveAs" {
		panic("service panic")
	}
	service.emissions++
	return apperr.WriteResult{Status: apperr.WriteStatusCancelled}
}

func (service *fakeAppModelService) CheckExternalChanges(_ context.Context, _ string) apperr.ConflictResult {
	if service.panicOn == "CheckExternalChanges" {
		panic("service panic")
	}
	service.emissions++
	return apperr.ConflictResult{Status: apperr.ConflictStatusUnchanged}
}

// ForegroundCheck delegates the way the real service's alias does, so
// TestHandlerConflictMethodsRecoverClassifiedErrors keeps exercising the panic
// it arms under the name of the bound method, now that the handler reaches the
// service through the alias.
func (service *fakeAppModelService) ForegroundCheck(ctx context.Context, documentID string) apperr.ConflictResult {
	return service.CheckExternalChanges(ctx, documentID)
}

func (service *fakeAppModelService) ReloadFromDisk(_ context.Context, _ string, _ uint64, _ apperr.DiskVersion) apperr.ConflictResult {
	if service.panicOn == "ReloadFromDisk" {
		panic("service panic")
	}
	service.emissions++
	return apperr.ConflictResult{Status: apperr.ConflictStatusReloaded}
}

func (service *fakeAppModelService) AuthorizeKeepMine(_ context.Context, _ string, _ uint64, _ string, _ apperr.DiskVersion) apperr.ConflictResult {
	if service.panicOn == "AuthorizeKeepMine" {
		panic("service panic")
	}
	service.emissions++
	return apperr.ConflictResult{Status: apperr.ConflictStatusAuthorized}
}

func (service *fakeAppModelService) SkipConflict(_ context.Context, _ string, _ uint64, _ apperr.DiskVersion) apperr.ConflictResult {
	if service.panicOn == "SkipConflict" {
		panic("service panic")
	}
	service.emissions++
	return apperr.ConflictResult{Status: apperr.ConflictStatusSkipped}
}

func (service *fakeAppModelService) CancelConflict(_ context.Context, _ string, _ uint64, _ apperr.DiskVersion) apperr.ConflictResult {
	if service.panicOn == "CancelConflict" {
		panic("service panic")
	}
	service.emissions++
	return apperr.ConflictResult{Status: apperr.ConflictStatusCancelled}
}

var _ AppModelServiceAPI = (*fakeAppModelService)(nil)
