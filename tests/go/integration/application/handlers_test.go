package application_test

import (
	"context"
	"reflect"
	"testing"

	"github.com/sanyokkua/go_mark_edit/internal/apperr"
	"github.com/sanyokkua/go_mark_edit/internal/application"
	"github.com/sanyokkua/go_mark_edit/internal/appmodel"
	"github.com/sanyokkua/go_mark_edit/internal/bridge"
)

type recordingAppModelService struct {
	appmodel.AppModelServiceAPI
	saveCalls int
}

func (service *recordingAppModelService) Save(context.Context, string, uint64, string) apperr.WriteResult {
	service.saveCalls++
	return apperr.WriteResult{
		Status:           apperr.WriteStatusCommitted,
		DocumentRevision: 7,
	}
}

type recordingApplicationService struct {
	application.ApplicationServiceAPI
	readyCalls int
	takeCalls  int
	printCalls int
}

type recoveryCloseService struct {
	application.ApplicationServiceAPI
	ack, discard int
	lastID       string
	lastContext  context.Context
	refusal      *apperr.ClassifiedError
	panicOnCall  bool
}

func (*recoveryCloseService) AuthorizeQuit(context.Context, string) *apperr.ClassifiedError {
	return nil
}
func (*recoveryCloseService) CancelQuit(context.Context, string) *apperr.ClassifiedError { return nil }
func (s *recoveryCloseService) AcknowledgeRecoveryClose(ctx context.Context, id string) *apperr.ClassifiedError {
	if s.panicOnCall {
		panic("recovery panic")
	}
	s.ack++
	s.lastID = id
	s.lastContext = ctx
	return s.refusal
}

func TestRecoveryCloseHandlersCarryContextAndClassifiedOutcomes(t *testing.T) {
	type key struct{}
	ctx := context.WithValue(context.Background(), key{}, "lifecycle")
	s := &recoveryCloseService{refusal: &apperr.ClassifiedError{Category: apperr.ClassifiedValidation, Message: "stale"}}
	h := application.NewApplicationHandler(s, nil, func() context.Context { return ctx })
	got := h.AcknowledgeRecoveryClose(bridge.Request{ID: "refusal"}, "close-1")
	if got.Error == nil || got.Error.Category != apperr.ClassifiedValidation || s.lastContext.Value(key{}) != "lifecycle" {
		t.Fatalf("outcome = %+v, context = %v", got, s.lastContext)
	}
	for _, name := range []string{"AcknowledgeRecoveryClose", "DiscardAndAuthorizeQuit"} {
		method, ok := reflect.TypeOf(h).MethodByName(name)
		if !ok || method.Type.NumIn() != 3 || method.Type.NumOut() != 1 || method.Type.In(1) != reflect.TypeOf(bridge.Request{}) || method.Type.In(2).Kind() != reflect.String || method.Type.Out(0) != reflect.TypeOf(apperr.ClassifiedVoidResult{}) {
			t.Fatalf("incorrect bound signature for %s", name)
		}
	}
	s.panicOnCall = true
	panicResult := h.AcknowledgeRecoveryClose(bridge.Request{ID: "panic"}, "close-1")
	if panicResult.Error == nil {
		t.Fatal("panic escaped Guard or produced no failure")
	}
	unsupported := application.NewApplicationHandler(&recordingApplicationService{}, nil, nil).DiscardAndAuthorizeQuit(bridge.Request{ID: "unsupported"}, "close-1")
	if unsupported.Error == nil || unsupported.Error.Category != apperr.ClassifiedUnsupportedInput {
		t.Fatalf("unsupported = %+v", unsupported)
	}
}
func (s *recoveryCloseService) DiscardAndAuthorizeQuit(_ context.Context, id string) *apperr.ClassifiedError {
	s.discard++
	s.lastID = id
	return nil
}

func TestRecoveryCloseHandlersDelegateOnce(t *testing.T) {
	s := &recoveryCloseService{}
	h := application.NewApplicationHandler(s, nil, nil)
	request := bridge.Request{ID: "recovery-ack"}
	h.AcknowledgeRecoveryClose(request, "close-1")
	h.AcknowledgeRecoveryClose(request, "close-1")
	h.DiscardAndAuthorizeQuit(bridge.Request{ID: "recovery-discard"}, "close-1")
	if s.ack != 1 || s.discard != 1 || s.lastID != "close-1" {
		t.Fatalf("calls = %d, %d, %q", s.ack, s.discard, s.lastID)
	}
}

func (service *recordingApplicationService) FrontendReady(context.Context) {
	service.readyCalls++
}

func (service *recordingApplicationService) PrintWindow(context.Context) {
	service.printCalls++
}

func (service *recordingApplicationService) RetryStartup(context.Context) error {
	return nil
}

func (service *recordingApplicationService) TakeLaunchTarget(context.Context) apperr.LaunchTargetResult {
	service.takeCalls++
	return apperr.LaunchTargetResult{Path: "/docs/a.md", Kind: "file"}
}

func TestRetryingSaveWithTheSameRequestIdentityRunsTheServiceOnce(t *testing.T) {
	service := &recordingAppModelService{}
	handler := appmodel.NewAppModelHandler(service, nil, nil)
	request := bridge.Request{ID: "save-request"}

	first := handler.Save(request, "document", 7, "")
	second := handler.Save(request, "document", 7, "")

	if service.saveCalls != 1 {
		t.Fatalf("service Save calls = %d, want 1", service.saveCalls)
	}
	if !reflect.DeepEqual(second, first) {
		t.Fatalf("retry result = %#v, want original result %#v", second, first)
	}
}

func TestRepeatingWindowReadyWithTheSameRequestIdentityIsIdempotent(t *testing.T) {
	service := &recordingApplicationService{}
	handler := application.NewApplicationHandler(service, nil, nil)
	request := bridge.Request{ID: "ready-request"}

	first := handler.WindowReady(request)
	second := handler.WindowReady(request)

	if service.readyCalls != 1 {
		t.Fatalf("FrontendReady calls = %d, want 1", service.readyCalls)
	}
	if !reflect.DeepEqual(second, first) {
		t.Fatalf("retry result = %#v, want original result %#v", second, first)
	}
}

func TestRepeatingPrintWindowWithTheSameRequestIdentityPrintsOnce(t *testing.T) {
	service := &recordingApplicationService{}
	handler := application.NewApplicationHandler(service, nil, nil)
	request := bridge.Request{ID: "print-request"}

	first := handler.PrintWindow(request)
	second := handler.PrintWindow(request)

	if service.printCalls != 1 {
		t.Fatalf("PrintWindow calls = %d, want 1", service.printCalls)
	}
	if !reflect.DeepEqual(second, first) {
		t.Fatalf("retry result = %#v, want original result %#v", second, first)
	}
}

func TestRepeatingTakeLaunchTargetWithTheSameRequestIdentityTakesOnce(t *testing.T) {
	service := &recordingApplicationService{}
	handler := application.NewApplicationHandler(service, nil, nil)
	request := bridge.Request{ID: "take-request"}

	first := handler.TakeLaunchTarget(request)
	second := handler.TakeLaunchTarget(request)

	if service.takeCalls != 1 {
		t.Fatalf("TakeLaunchTarget calls = %d, want 1", service.takeCalls)
	}
	if first.Path != "/docs/a.md" || first.Kind != "file" {
		t.Fatalf("first result = %#v, want the service target", first)
	}
	if !reflect.DeepEqual(second, first) {
		t.Fatalf("retry result = %#v, want original result %#v", second, first)
	}
}
