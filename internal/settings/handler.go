package settings

import (
	"context"

	"github.com/rs/zerolog"
	"github.com/sanyokkua/go_mark_edit/internal/apperr"
	"github.com/sanyokkua/go_mark_edit/internal/bridge"
	"github.com/sanyokkua/go_mark_edit/internal/logging"
)

// SettingsHandler is the Wails-bound settings surface.
type SettingsHandler struct {
	contextProvider func() context.Context
	service         *SettingsService
	logger          *logging.Logger
	outcomes        *bridge.OutcomeCache
}

// NewSettingsHandler constructs the bridge handler for SettingsService.
func NewSettingsHandler(service *SettingsService, logger *logging.Logger, contextProvider func() context.Context, outcomeCaches ...*bridge.OutcomeCache) *SettingsHandler {
	outcomes := bridge.NewOutcomeCache()
	if len(outcomeCaches) > 0 && outcomeCaches[0] != nil {
		outcomes = outcomeCaches[0]
	}
	return &SettingsHandler{service: service, logger: logger, contextProvider: contextProvider, outcomes: outcomes}
}

// GetSettings returns all current typed setting groups.
func (handler *SettingsHandler) GetSettings(request bridge.Request) (res apperr.SettingsResult) {
	defer bridge.Guard(&res)
	return bridge.Once(handler.outcomes, request, func() apperr.SettingsResult {
		settings, err := handler.service.Get(handler.context())
		if err != nil {
			wire := apperr.ToWire(handler.zlog(), err)
			return apperr.SettingsResult{Error: &wire}
		}
		return apperr.SettingsResult{Data: &settings}
	})
}

// UpdateAppearance validates and persists the appearance group immediately.
func (handler *SettingsHandler) UpdateAppearance(request bridge.Request, appearance apperr.AppearanceSettings) (res apperr.VoidResult) {
	defer bridge.Guard(&res)
	return bridge.Once(handler.outcomes, request, func() apperr.VoidResult {
		if err := handler.service.UpdateAppearance(handler.context(), appearance); err != nil {
			wire := apperr.ToWire(handler.zlog(), err)
			return apperr.VoidResult{Error: &wire}
		}
		return apperr.VoidResult{}
	})
}

func (handler *SettingsHandler) ResetAppearance(request bridge.Request) (res apperr.VoidResult) {
	defer bridge.Guard(&res)
	return bridge.Once(handler.outcomes, request, func() apperr.VoidResult {
		if err := handler.service.ResetAppearance(handler.context()); err != nil {
			wire := apperr.ToWire(handler.zlog(), err)
			return apperr.VoidResult{Error: &wire}
		}
		return apperr.VoidResult{}
	})
}

// UpdateMarkdown validates and persists the Markdown group immediately.
func (handler *SettingsHandler) UpdateMarkdown(request bridge.Request, markdown apperr.MarkdownSettings) (res apperr.VoidResult) {
	defer bridge.Guard(&res)
	return bridge.Once(handler.outcomes, request, func() apperr.VoidResult {
		if err := handler.service.UpdateMarkdown(handler.context(), markdown); err != nil {
			wire := apperr.ToWire(handler.zlog(), err)
			return apperr.VoidResult{Error: &wire}
		}
		return apperr.VoidResult{}
	})
}

// UpdateContentPrivacy validates and persists the content-privacy group immediately.
func (handler *SettingsHandler) UpdateContentPrivacy(request bridge.Request, contentPrivacy apperr.ContentPrivacySettings) (res apperr.VoidResult) {
	defer bridge.Guard(&res)
	return bridge.Once(handler.outcomes, request, func() apperr.VoidResult {
		if err := handler.service.UpdateContentPrivacy(handler.context(), contentPrivacy); err != nil {
			wire := apperr.ToWire(handler.zlog(), err)
			return apperr.VoidResult{Error: &wire}
		}
		return apperr.VoidResult{}
	})
}

// UpdateEditor validates and persists the acknowledged editor display group.
func (handler *SettingsHandler) UpdateEditor(request bridge.Request, editor apperr.EditorSettings) (res apperr.VoidResult) {
	defer bridge.Guard(&res)
	return bridge.Once(handler.outcomes, request, func() apperr.VoidResult {
		if err := handler.service.UpdateEditor(handler.context(), editor); err != nil {
			wire := apperr.ToWire(handler.zlog(), err)
			return apperr.VoidResult{Error: &wire}
		}
		return apperr.VoidResult{}
	})
}

// UpdateFile validates and persists the acknowledged file-automation group.
func (handler *SettingsHandler) UpdateFile(request bridge.Request, fileSettings apperr.FileSettings) (res apperr.VoidResult) {
	defer bridge.Guard(&res)
	return bridge.Once(handler.outcomes, request, func() apperr.VoidResult {
		if err := handler.service.UpdateFile(handler.context(), fileSettings); err != nil {
			wire := apperr.ToWire(handler.zlog(), err)
			return apperr.VoidResult{Error: &wire}
		}
		return apperr.VoidResult{}
	})
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
