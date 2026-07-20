package settings

import (
	"context"
	"fmt"

	"github.com/rs/zerolog"
	"github.com/sanyokkua/go_mark_edit/internal/apperr"
	"github.com/sanyokkua/go_mark_edit/internal/logging"
)

const panicFormat = "panic: %v"

// SettingsHandler is the Wails-bound settings surface.
type SettingsHandler struct {
	contextProvider func() context.Context
	service         *SettingsService
	logger          *logging.Logger
}

// NewSettingsHandler constructs the bridge handler for SettingsService.
func NewSettingsHandler(service *SettingsService, logger *logging.Logger, contextProvider func() context.Context) *SettingsHandler {
	return &SettingsHandler{service: service, logger: logger, contextProvider: contextProvider}
}

// GetSettings returns all current typed setting groups.
func (handler *SettingsHandler) GetSettings() (res apperr.SettingsResult) {
	defer func() {
		if recovered := recover(); recovered != nil {
			wire := apperr.ToWire(handler.zlog(), apperr.Internal(fmt.Errorf(panicFormat, recovered)))
			res = apperr.SettingsResult{Error: &wire}
		}
	}()

	settings, err := handler.service.Get(handler.context())
	if err != nil {
		wire := apperr.ToWire(handler.zlog(), err)
		return apperr.SettingsResult{Error: &wire}
	}
	return apperr.SettingsResult{Data: &settings}
}

// UpdateAppearance validates and persists the appearance group immediately.
func (handler *SettingsHandler) UpdateAppearance(appearance apperr.AppearanceSettings) (res apperr.VoidResult) {
	defer func() {
		if recovered := recover(); recovered != nil {
			wire := apperr.ToWire(handler.zlog(), apperr.Internal(fmt.Errorf(panicFormat, recovered)))
			res = apperr.VoidResult{Error: &wire}
		}
	}()

	if err := handler.service.UpdateAppearance(handler.context(), appearance); err != nil {
		wire := apperr.ToWire(handler.zlog(), err)
		return apperr.VoidResult{Error: &wire}
	}
	return apperr.VoidResult{}
}

// UpdateMarkdown validates and persists the Markdown group immediately.
func (handler *SettingsHandler) UpdateMarkdown(markdown apperr.MarkdownSettings) (res apperr.VoidResult) {
	defer func() {
		if recovered := recover(); recovered != nil {
			wire := apperr.ToWire(handler.zlog(), apperr.Internal(fmt.Errorf(panicFormat, recovered)))
			res = apperr.VoidResult{Error: &wire}
		}
	}()

	if err := handler.service.UpdateMarkdown(handler.context(), markdown); err != nil {
		wire := apperr.ToWire(handler.zlog(), err)
		return apperr.VoidResult{Error: &wire}
	}
	return apperr.VoidResult{}
}

// UpdateContentPrivacy validates and persists the content-privacy group immediately.
func (handler *SettingsHandler) UpdateContentPrivacy(contentPrivacy apperr.ContentPrivacySettings) (res apperr.VoidResult) {
	defer func() {
		if recovered := recover(); recovered != nil {
			wire := apperr.ToWire(handler.zlog(), apperr.Internal(fmt.Errorf(panicFormat, recovered)))
			res = apperr.VoidResult{Error: &wire}
		}
	}()

	if err := handler.service.UpdateContentPrivacy(handler.context(), contentPrivacy); err != nil {
		wire := apperr.ToWire(handler.zlog(), err)
		return apperr.VoidResult{Error: &wire}
	}
	return apperr.VoidResult{}
}

func (handler *SettingsHandler) zlog() zerolog.Logger {
	if handler.logger == nil {
		return zerolog.Nop()
	}
	return handler.logger.Zerolog()
}

func (handler *SettingsHandler) context() context.Context {
	if handler.contextProvider == nil {
		return context.Background()
	}
	return handler.contextProvider()
}
