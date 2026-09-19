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
}

func (service *recordingApplicationService) FrontendReady(context.Context) {
	service.readyCalls++
}

func (service *recordingApplicationService) RetryStartup(context.Context) error {
	return nil
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
