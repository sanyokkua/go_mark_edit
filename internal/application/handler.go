package application

import (
	"context"
	"fmt"

	"github.com/rs/zerolog"
	"github.com/sanyokkua/go_mark_edit/internal/apperr"
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

func NewApplicationHandler(service ApplicationServiceAPI, logger *logging.Logger, contextProvider func() context.Context) *ApplicationHandler {
	return &ApplicationHandler{service: service, logger: logger, contextProvider: contextProvider}
}

// WindowReady acknowledges that the frontend hydrated and the hidden window
// may become visible.
func (handler *ApplicationHandler) WindowReady() (result apperr.VoidResult) {
	defer func() {
		if recovered := recover(); recovered != nil {
			wire := apperr.ToWire(handler.zlog(), apperr.Internal(fmt.Errorf("panic: %v", recovered)))
			result = apperr.VoidResult{Error: &wire}
		}
	}()
	handler.service.FrontendReady(handler.context())
	return apperr.VoidResult{}
}

// RetryStartup repeats backend initialization and hidden native restore.
func (handler *ApplicationHandler) RetryStartup() (result apperr.VoidResult) {
	defer func() {
		if recovered := recover(); recovered != nil {
			wire := apperr.ToWire(handler.zlog(), apperr.Internal(fmt.Errorf("panic: %v", recovered)))
			result = apperr.VoidResult{Error: &wire}
		}
	}()
	if err := handler.service.RetryStartup(handler.context()); err != nil {
		wire := apperr.ToWire(handler.zlog(), err)
		return apperr.VoidResult{Error: &wire}
	}
	return apperr.VoidResult{}
}

func (handler *ApplicationHandler) context() context.Context {
	if handler.contextProvider == nil {
		return context.Background()
	}
	return handler.contextProvider()
}

func (handler *ApplicationHandler) zlog() zerolog.Logger {
	if handler.logger == nil {
		return zerolog.Nop()
	}
	return handler.logger.Zerolog()
}
