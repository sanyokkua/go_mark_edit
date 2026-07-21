package appmodel

import (
	"context"
	"reflect"
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

	for _, method := range []string{"GetState", "UpdateBuffer", "SetDocView", "SetUILayout"} {
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
			case "UpdateBuffer":
				result = panickingHandler.UpdateBuffer("doc", "content")
			case "SetDocView":
				result = panickingHandler.SetDocView("doc", validDocView(true, true))
			case "SetUILayout":
				result = panickingHandler.SetUILayout(apperr.UILayout{})
			}
			if method != "GetState" && (result.Error == nil || result.Error.Code != apperr.CodeInternal) {
				t.Fatalf("panic result = %+v, want an internal envelope", result)
			}
			if service.emissions != 0 {
				t.Fatalf("recovered %s panic emitted %d patches, want none", method, service.emissions)
			}
		})
	}
}

type fakeAppModelService struct {
	panicOn   string
	emissions int
}

func (service *fakeAppModelService) GetState(_ context.Context) (apperr.AppState, error) {
	if service.panicOn == "GetState" {
		panic("service panic")
	}
	return apperr.AppState{}, nil
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
	service.emissions++
	return nil
}

var _ AppModelServiceAPI = (*fakeAppModelService)(nil)
