package application

import (
	"context"

	"github.com/rs/zerolog"
	"github.com/sanyokkua/go_mark_edit/internal/apperr"
	"github.com/sanyokkua/go_mark_edit/internal/bridge"
	"github.com/sanyokkua/go_mark_edit/internal/logging"
)

// ApplicationHandler is the small Wails-bound lifecycle acknowledgement
// surface. It delegates to the native-window service only.
type ApplicationHandler struct {
	contextProvider func() context.Context
	service         ApplicationServiceAPI
	logger          *logging.Logger
}

// ApplicationServiceAPI is the repeatable startup lifecycle exposed to the
// Wails handler. The concrete context holder remains the composition owner.
type ApplicationServiceAPI interface {
	FrontendReady(context.Context)
	RetryStartup(context.Context) error
}

// NativeCloseServiceAPI is optional so the startup lifecycle seam remains
// usable by focused tests and older composition fixtures that do not install
// native close coordination.
type NativeCloseServiceAPI interface {
	AuthorizeQuit(context.Context) *apperr.ClassifiedError
	CancelQuit(context.Context)
}

func NewApplicationHandler(service ApplicationServiceAPI, logger *logging.Logger, contextProvider func() context.Context) *ApplicationHandler {
	return &ApplicationHandler{service: service, logger: logger, contextProvider: contextProvider}
}

// WindowReady acknowledges that the frontend hydrated and the hidden window
// may become visible.
func (handler *ApplicationHandler) WindowReady() (result apperr.VoidResult) {
	defer bridge.Guard(&result)
	handler.service.FrontendReady(handler.context())
	return apperr.VoidResult{}
}

// RetryStartup repeats backend initialization and hidden native restore.
func (handler *ApplicationHandler) RetryStartup() (result apperr.VoidResult) {
	defer bridge.Guard(&result)
	if err := handler.service.RetryStartup(handler.context()); err != nil {
		wire := apperr.ToWire(handler.zlog(), err)
		return apperr.VoidResult{Error: &wire}
	}
	return apperr.VoidResult{}
}

// AuthorizeQuit completes the frontend close plan and arms one native close
// permit. Wails calls this without a context argument; the captured lifecycle
// context is the only runtime context used by the handler.
//
// It returns a ClassifiedVoidResult because FR-FT-027 requires a drain failure
// to reach the user as a classified io-failure with Retry. A VoidResult can
// carry only a WireError, which the frontend renders as generic catalogue copy
// with no remediation control.
func (handler *ApplicationHandler) AuthorizeQuit() (result apperr.ClassifiedVoidResult) {
	defer bridge.Guard(&result)
	service, ok := handler.service.(NativeCloseServiceAPI)
	if !ok {
		return bridge.Refused[apperr.ClassifiedVoidResult](apperr.ClassifiedUnsupportedInput, "native close", "This build cannot authorize a native close.", apperr.RemediationNone)
	}
	if refusal := service.AuthorizeQuit(handler.context()); refusal != nil {
		logger := handler.zlog()
		logger.Warn().
			Str("category", string(refusal.Category)).
			Str("subject", refusal.SafeSubject).
			Msg("native close authorization refused")
		return bridge.FromClassified[apperr.ClassifiedVoidResult](refusal)
	}
	return apperr.ClassifiedVoidResult{}
}

// CancelQuit abandons the pending native close plan and leaves the window
// open. It is intentionally idempotent.
func (handler *ApplicationHandler) CancelQuit() (result apperr.VoidResult) {
	defer bridge.Guard(&result)
	service, ok := handler.service.(NativeCloseServiceAPI)
	if !ok {
		wire := apperr.ToWire(handler.zlog(), apperr.Unsupported("native close cancellation"))
		return apperr.VoidResult{Error: &wire}
	}
	service.CancelQuit(handler.context())
	return apperr.VoidResult{}
}

func (handler *ApplicationHandler) context() context.Context {
	if handler.contextProvider == nil {
		return context.Background()
	}
	ctx := handler.contextProvider()
	if ctx == nil {
		return context.Background()
	}
	return ctx
}

func (handler *ApplicationHandler) zlog() zerolog.Logger {
	if handler.logger == nil {
		return zerolog.Nop()
	}
	return handler.logger.Zerolog()
}
