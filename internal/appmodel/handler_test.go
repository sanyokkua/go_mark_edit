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
		{"UpdateBuffer", 3, reflect.TypeFor[apperr.VoidResult]()},
		{"SetDocView", 3, reflect.TypeFor[apperr.VoidResult]()},
		{"SetUILayout", 2, reflect.TypeFor[apperr.VoidResult]()},
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

	for _, method := range []string{"GetState", "NewDocument", "UpdateBuffer", "SetDocView", "SetUILayout"} {
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
			case "UpdateBuffer":
				result = panickingHandler.UpdateBuffer("doc", "content")
			case "SetDocView":
				result = panickingHandler.SetDocView("doc", validDocView(true, true))
			case "SetUILayout":
				result = panickingHandler.SetUILayout(apperr.UILayout{})
			}
			if method != "GetState" && method != "NewDocument" && (result.Error == nil || result.Error.Code != apperr.CodeInternal) {
				t.Fatalf("panic result = %+v, want an internal envelope", result)
			}
			if service.emissions != 0 {
				t.Fatalf("recovered %s panic emitted %d patches, want none", method, service.emissions)
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

var _ AppModelServiceAPI = (*fakeAppModelService)(nil)
