package settings

import (
	"context"

	"github.com/sanyokkua/go_mark_edit/internal/apperr"
)

// SettingsRepositoryAPI is the persistence contract used by SettingsService.
// It stays in the settings package so future typed groups can reuse the same
// generic KV helpers without widening the Wails bridge.
type SettingsRepositoryAPI interface {
	GetAppearance(context.Context) (apperr.AppearanceSettings, error)
	GetMarkdown(context.Context) (apperr.MarkdownSettings, error)
	GetContentPrivacy(context.Context) (apperr.ContentPrivacySettings, error)
	UpdateAppearance(context.Context, apperr.AppearanceSettings) error
	ResetAppearance(context.Context) error
	UpdateMarkdown(context.Context, apperr.MarkdownSettings) error
	UpdateContentPrivacy(context.Context, apperr.ContentPrivacySettings) error
}
