package appmodel

import (
	"context"
	"fmt"

	"github.com/rs/zerolog"
	"github.com/sanyokkua/go_mark_edit/internal/apperr"
	"github.com/sanyokkua/go_mark_edit/internal/logging"
)

const appModelPanicFormat = "panic: %v"

// AppModelServiceAPI is the handler's package-owned service boundary.
type AppModelServiceAPI interface {
	GetState(ctx context.Context) (apperr.AppState, error)
	NewDocument(ctx context.Context, expectedTabSetRevision uint64) apperr.DocumentTransitionResult
	OpenFromDialog(ctx context.Context, expectedTabSetRevision uint64) apperr.OpenResult
	UpdateBuffer(ctx context.Context, documentID, content string) error
	SetDocView(ctx context.Context, documentID string, view apperr.DocViewInput) error
	SetUILayout(ctx context.Context, layout apperr.UILayout) error
}

// OpenDocument opens the native picker and commits its selected path through canonical Open.
func (handler *AppModelHandler) OpenDocument(expectedTabSetRevision uint64) (res apperr.OpenResult) {
	defer func() {
		if recover() != nil {
			res = apperr.OpenResult{Status: apperr.OpenStatusRefused, Error: classifiedOpenError(apperr.ClassifiedSystemCommandFailure, "The Open dialog could not be opened.", apperr.RemediationRetry)}
		}
	}()
	return handler.service.OpenFromDialog(handler.context(), expectedTabSetRevision)
}

// NewDocument mints and activates one empty untitled document after a tab-set revision check.
func (handler *AppModelHandler) NewDocument(expectedTabSetRevision uint64) (res apperr.DocumentTransitionResult) {
	defer func() {
		if recovered := recover(); recovered != nil {
			res = documentTransitionFailure(
				apperr.ClassifiedIOFailure,
				"The new document could not be published.",
				apperr.RemediationRetry,
			)
		}
	}()

	return handler.service.NewDocument(handler.context(), expectedTabSetRevision)
}

// AppModelHandler is the Wails-bound application-model query and command surface.
type AppModelHandler struct {
	service         AppModelServiceAPI
	logger          *logging.Logger
	contextProvider func() context.Context
}

// NewAppModelHandler constructs the envelope boundary for AppModelService.
func NewAppModelHandler(service AppModelServiceAPI, logger *logging.Logger, contextProvider func() context.Context) *AppModelHandler {
	return &AppModelHandler{service: service, logger: logger, contextProvider: contextProvider}
}

// GetState returns the metadata snapshot and active buffer for projection hydration.
func (handler *AppModelHandler) GetState() (res apperr.StateResult) {
	defer func() {
		if recovered := recover(); recovered != nil {
			wire := apperr.ToWire(handler.zlog(), apperr.Internal(fmt.Errorf(appModelPanicFormat, recovered)))
			res = apperr.StateResult{Error: &wire}
		}
	}()

	state, err := handler.service.GetState(handler.context())
	if err != nil {
		wire := apperr.ToWire(handler.zlog(), err)
		return apperr.StateResult{Error: &wire}
	}
	return apperr.StateResult{Data: &state}
}

// UpdateBuffer accepts a complete canonical-buffer snapshot through the F3 seam.
func (handler *AppModelHandler) UpdateBuffer(documentID, content string) (res apperr.VoidResult) {
	defer func() {
		if recovered := recover(); recovered != nil {
			wire := apperr.ToWire(handler.zlog(), apperr.Internal(fmt.Errorf(appModelPanicFormat, recovered)))
			res = apperr.VoidResult{Error: &wire}
		}
	}()

	if err := handler.service.UpdateBuffer(handler.context(), documentID, content); err != nil {
		wire := apperr.ToWire(handler.zlog(), err)
		return apperr.VoidResult{Error: &wire}
	}
	return apperr.VoidResult{}
}

// SetDocView stores restorable metadata for the selected document.
func (handler *AppModelHandler) SetDocView(documentID string, view apperr.DocViewInput) (res apperr.VoidResult) {
	defer func() {
		if recovered := recover(); recovered != nil {
			wire := apperr.ToWire(handler.zlog(), apperr.Internal(fmt.Errorf(appModelPanicFormat, recovered)))
			res = apperr.VoidResult{Error: &wire}
		}
	}()

	if err := handler.service.SetDocView(handler.context(), documentID, view); err != nil {
		wire := apperr.ToWire(handler.zlog(), err)
		return apperr.VoidResult{Error: &wire}
	}
	return apperr.VoidResult{}
}

// SetUILayout merges application-level layout fields in memory.
func (handler *AppModelHandler) SetUILayout(layout apperr.UILayout) (res apperr.VoidResult) {
	defer func() {
		if recovered := recover(); recovered != nil {
			wire := apperr.ToWire(handler.zlog(), apperr.Internal(fmt.Errorf(appModelPanicFormat, recovered)))
			res = apperr.VoidResult{Error: &wire}
		}
	}()

	if err := handler.service.SetUILayout(handler.context(), layout); err != nil {
		wire := apperr.ToWire(handler.zlog(), err)
		return apperr.VoidResult{Error: &wire}
	}
	return apperr.VoidResult{}
}

func (handler *AppModelHandler) context() context.Context {
	if handler.contextProvider == nil {
		return context.Background()
	}
	return handler.contextProvider()
}

func (handler *AppModelHandler) zlog() zerolog.Logger {
	if handler.logger == nil {
		return zerolog.Nop()
	}
	return handler.logger.Zerolog()
}

var _ AppModelServiceAPI = (*AppModelService)(nil)
