package settings

import (
	"context"
	"sync"

	"github.com/sanyokkua/go_mark_edit/internal/apperr"
)

// SettingsService contains settings validation and stored-value normalization.
type SettingsService struct {
	mu         sync.RWMutex
	repository SettingsRepositoryAPI
}

// NewSettingsService creates the phase-one service. The repository is nil
// until ApplicationContextHolder injects it after opening SQLite.
func NewSettingsService(repository SettingsRepositoryAPI) *SettingsService {
	return &SettingsService{repository: repository}
}

// SetRepository performs phase-two persistence injection.
func (service *SettingsService) SetRepository(repository SettingsRepositoryAPI) {
	service.mu.Lock()
	defer service.mu.Unlock()

	service.repository = repository
}

// Get returns every exposed typed settings group. Bad stored scalar values are
// intentionally normalized to documented defaults so startup remains usable.
func (service *SettingsService) Get(ctx context.Context) (apperr.Settings, error) {
	repository, err := service.getRepository()
	if err != nil {
		return apperr.Settings{}, err
	}
	ctx = nonNilContext(ctx)

	appearance, err := repository.GetAppearance(ctx)
	if err != nil {
		return apperr.Settings{}, apperr.IO("read settings", err)
	}
	markdown, err := repository.GetMarkdown(ctx)
	if err != nil {
		return apperr.Settings{}, apperr.IO("read settings", err)
	}
	contentPrivacy, err := repository.GetContentPrivacy(ctx)
	if err != nil {
		return apperr.Settings{}, apperr.IO("read settings", err)
	}

	return apperr.Settings{
		Appearance:     normalizeAppearance(appearance),
		Markdown:       normalizeMarkdown(markdown),
		ContentPrivacy: normalizeContentPrivacy(contentPrivacy),
	}, nil
}

// UpdateAppearance validates and persists the complete appearance group.
func (service *SettingsService) UpdateAppearance(ctx context.Context, appearance apperr.AppearanceSettings) error {
	if err := validateAppearance(appearance); err != nil {
		return err
	}
	repository, err := service.getRepository()
	if err != nil {
		return err
	}
	if err := repository.UpdateAppearance(nonNilContext(ctx), appearance); err != nil {
		return apperr.IO("update settings", err)
	}
	return nil
}

// UpdateMarkdown validates and persists the complete Markdown group.
func (service *SettingsService) UpdateMarkdown(ctx context.Context, markdown apperr.MarkdownSettings) error {
	if err := validateMarkdown(markdown); err != nil {
		return err
	}
	repository, err := service.getRepository()
	if err != nil {
		return err
	}
	if err := repository.UpdateMarkdown(nonNilContext(ctx), markdown); err != nil {
		return apperr.IO("update settings", err)
	}
	return nil
}

// UpdateContentPrivacy validates and persists the complete content-privacy group.
func (service *SettingsService) UpdateContentPrivacy(ctx context.Context, contentPrivacy apperr.ContentPrivacySettings) error {
	if err := validateContentPrivacy(contentPrivacy); err != nil {
		return err
	}
	repository, err := service.getRepository()
	if err != nil {
		return err
	}
	if err := repository.UpdateContentPrivacy(nonNilContext(ctx), contentPrivacy); err != nil {
		return apperr.IO("update settings", err)
	}
	return nil
}

func (service *SettingsService) getRepository() (SettingsRepositoryAPI, error) {
	service.mu.RLock()
	defer service.mu.RUnlock()

	if service.repository == nil {
		return nil, apperr.Unsupported("settings persistence")
	}
	return service.repository, nil
}

func nonNilContext(ctx context.Context) context.Context {
	if ctx == nil {
		return context.Background()
	}
	return ctx
}

func normalizeAppearance(appearance apperr.AppearanceSettings) apperr.AppearanceSettings {
	defaults := DefaultSettings().Appearance
	if !isTheme(appearance.Theme) {
		appearance.Theme = defaults.Theme
	}
	if !isMode(appearance.Mode) {
		appearance.Mode = defaults.Mode
	}
	return appearance
}

func normalizeMarkdown(markdown apperr.MarkdownSettings) apperr.MarkdownSettings {
	if !isMarkdownStandard(markdown.Standard) {
		markdown.Standard = DefaultSettings().Markdown.Standard
	}
	return markdown
}

func normalizeContentPrivacy(contentPrivacy apperr.ContentPrivacySettings) apperr.ContentPrivacySettings {
	if !isRemotePolicy(contentPrivacy.RemotePolicy) {
		contentPrivacy.RemotePolicy = DefaultSettings().ContentPrivacy.RemotePolicy
	}
	return contentPrivacy
}

func validateAppearance(appearance apperr.AppearanceSettings) error {
	if !isTheme(appearance.Theme) {
		return apperr.Validation("appearance.theme", "liquid-glass, material, or minimal", appearance.Theme)
	}
	if !isMode(appearance.Mode) {
		return apperr.Validation("appearance.mode", "auto, light, or dark", appearance.Mode)
	}
	return nil
}

func validateMarkdown(markdown apperr.MarkdownSettings) error {
	if !isMarkdownStandard(markdown.Standard) {
		return apperr.Validation("markdown.standard", "minimal, gfm, or full", markdown.Standard)
	}
	return nil
}

func validateContentPrivacy(contentPrivacy apperr.ContentPrivacySettings) error {
	if !isRemotePolicy(contentPrivacy.RemotePolicy) {
		return apperr.Validation("content.remotePolicy", "ask, allow, or block", contentPrivacy.RemotePolicy)
	}
	return nil
}

func isTheme(value string) bool {
	return value == ThemeLiquidGlass || value == ThemeMaterial || value == ThemeMinimal
}

func isMode(value string) bool {
	return value == ModeAuto || value == ModeLight || value == ModeDark
}

func isMarkdownStandard(value string) bool {
	return value == MarkdownMinimal || value == MarkdownGFM || value == MarkdownFull
}

func isRemotePolicy(value string) bool {
	return value == RemotePolicyAsk || value == RemotePolicyAllow || value == RemotePolicyBlock
}
