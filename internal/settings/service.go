package settings

import (
	"context"
	"strconv"
	"sync"

	"github.com/sanyokkua/go_mark_edit/internal/apperr"
)

// AutosaveObserver is notified whenever the persisted autosave preference is
// written. Settings owns the preference; it does not own the document model, so
// it must not import it. The composition root supplies this so the preference
// reaches the scheduler instead of stopping at the database and the status bar —
// the exact gap the 2026-08-14 walkthrough found.
type AutosaveObserver func(enabled bool)

// DefaultOpenModeObserver is notified whenever the persisted default open mode is
// written. Same reason as AutosaveObserver, and the same defect one setting over:
// SetDefaultOpenMode had zero production callers, so the preference reached the
// database and the Settings menu's tick and never the document model, which kept
// opening every file in Editor for the process lifetime (FR-FT-003).
//
// One observer per setting rather than a generic registry, matching the shape
// already established here.
type DefaultOpenModeObserver func(mode string)

// SettingsService contains settings validation and stored-value normalization.
type SettingsService struct {
	mu                      sync.RWMutex
	repository              SettingsRepositoryAPI
	autosaveObserver        AutosaveObserver
	defaultOpenModeObserver DefaultOpenModeObserver
}

// SetAutosaveObserver wires the composition root's document-model command.
func (service *SettingsService) SetAutosaveObserver(observer AutosaveObserver) {
	service.mu.Lock()
	defer service.mu.Unlock()

	service.autosaveObserver = observer
}

func (service *SettingsService) notifyAutosave(enabled bool) {
	service.mu.RLock()
	observer := service.autosaveObserver
	service.mu.RUnlock()

	if observer != nil {
		observer(enabled)
	}
}

// SetDefaultOpenModeObserver wires the composition root's document-model command.
func (service *SettingsService) SetDefaultOpenModeObserver(observer DefaultOpenModeObserver) {
	service.mu.Lock()
	defer service.mu.Unlock()

	service.defaultOpenModeObserver = observer
}

func (service *SettingsService) notifyDefaultOpenMode(mode string) {
	service.mu.RLock()
	observer := service.defaultOpenModeObserver
	service.mu.RUnlock()

	if observer != nil {
		observer(mode)
	}
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
	editor, err := repository.GetEditor(ctx)
	if err != nil {
		return apperr.Settings{}, apperr.IO("read settings", err)
	}
	fileSettings, err := repository.GetFile(ctx)
	if err != nil {
		return apperr.Settings{}, apperr.IO("read settings", err)
	}

	return apperr.Settings{
		Appearance:     normalizeAppearance(appearance),
		Markdown:       normalizeMarkdown(markdown),
		ContentPrivacy: normalizeContentPrivacy(contentPrivacy),
		Editor:         normalizeEditor(editor),
		File:           normalizeFile(fileSettings),
	}, nil
}

// UpdateFile validates and persists the complete file-automation group.
func (service *SettingsService) UpdateFile(ctx context.Context, fileSettings apperr.FileSettings) error {
	repository, err := service.getRepository()
	if err != nil {
		return err
	}
	if err := repository.UpdateFile(nonNilContext(ctx), fileSettings); err != nil {
		return apperr.IO("update settings", err)
	}
	// Only after the write succeeds: a preference that failed to persist must
	// not change what the document model does.
	service.notifyAutosave(fileSettings.Autosave)
	return nil
}

// UpdateEditor validates and persists the complete editor display group.
func (service *SettingsService) UpdateEditor(ctx context.Context, editor apperr.EditorSettings) error {
	if err := validateEditor(editor); err != nil {
		return err
	}
	repository, err := service.getRepository()
	if err != nil {
		return err
	}
	if err := repository.UpdateEditor(nonNilContext(ctx), editor); err != nil {
		return apperr.IO("update settings", err)
	}
	return nil
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
	// Only after the write succeeds, for the same reason as UpdateFile: a
	// preference that failed to persist must not change what the document model
	// does.
	service.notifyDefaultOpenMode(appearance.DefaultOpenMode)
	return nil
}

func (service *SettingsService) ResetAppearance(ctx context.Context) error {
	repository, err := service.getRepository()
	if err != nil {
		return err
	}
	if err := repository.ResetAppearance(nonNilContext(ctx)); err != nil {
		return apperr.IO("reset appearance", err)
	}
	// A reset that left the document model on the old value would put the store
	// and the model in disagreement, with only the store visible in the interface.
	// Read the reset value back rather than assuming it, so this stays correct if
	// the default ever changes.
	restored, err := repository.GetAppearance(nonNilContext(ctx))
	if err != nil {
		return apperr.IO("read reset appearance", err)
	}
	service.notifyDefaultOpenMode(restored.DefaultOpenMode)
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
	if appearance.Theme == "liquid-glass" {
		appearance.Theme = ThemeGlass
	} else if !isTheme(appearance.Theme) {
		appearance.Theme = defaults.Theme
	}
	if !isMode(appearance.Mode) {
		appearance.Mode = defaults.Mode
	}
	if !isOpenMode(appearance.DefaultOpenMode) {
		appearance.DefaultOpenMode = defaults.DefaultOpenMode
	}
	return appearance
}

func normalizeMarkdown(markdown apperr.MarkdownSettings) apperr.MarkdownSettings {
	defaults := DefaultSettings().Markdown
	if !isMarkdownStandard(markdown.Standard) {
		markdown.Standard = defaults.Standard
	}
	if !isBulletMarker(markdown.BulletMarker) {
		markdown.BulletMarker = defaults.BulletMarker
	}
	if !isEmphasisMarker(markdown.EmphasisMarker) {
		markdown.EmphasisMarker = defaults.EmphasisMarker
	}
	if !isHeadingStyle(markdown.HeadingStyle) {
		markdown.HeadingStyle = defaults.HeadingStyle
	}
	return markdown
}

func normalizeContentPrivacy(contentPrivacy apperr.ContentPrivacySettings) apperr.ContentPrivacySettings {
	if !isRemotePolicy(contentPrivacy.RemotePolicy) {
		contentPrivacy.RemotePolicy = DefaultSettings().ContentPrivacy.RemotePolicy
	}
	return contentPrivacy
}

func normalizeEditor(editor apperr.EditorSettings) apperr.EditorSettings {
	defaults := DefaultSettings().Editor
	if editor.FontSize != EditorFontSizeSmall && editor.FontSize != EditorFontSizeMedium && editor.FontSize != EditorFontSizeLarge {
		editor.FontSize = defaults.FontSize
	}
	return editor
}

func normalizeFile(fileSettings apperr.FileSettings) apperr.FileSettings {
	return fileSettings
}

func validateAppearance(appearance apperr.AppearanceSettings) error {
	if !isTheme(appearance.Theme) {
		return apperr.Validation("appearance.theme", "liquid-glass, material, or minimal", appearance.Theme)
	}
	if !isMode(appearance.Mode) {
		return apperr.Validation("appearance.mode", "auto, light, or dark", appearance.Mode)
	}
	if !isOpenMode(appearance.DefaultOpenMode) {
		return apperr.Validation("view.defaultOpenMode", "editor or viewer", appearance.DefaultOpenMode)
	}
	return nil
}

func validateMarkdown(markdown apperr.MarkdownSettings) error {
	if !isMarkdownStandard(markdown.Standard) {
		return apperr.Validation("markdown.standard", "minimal, gfm, or full", markdown.Standard)
	}
	if !isBulletMarker(markdown.BulletMarker) {
		return apperr.Validation("format.bulletMarker", "-, *, or +", markdown.BulletMarker)
	}
	if !isEmphasisMarker(markdown.EmphasisMarker) {
		return apperr.Validation("format.emphasisMarker", "_ or *", markdown.EmphasisMarker)
	}
	if !isHeadingStyle(markdown.HeadingStyle) {
		return apperr.Validation("format.headingStyle", "atx or setext", markdown.HeadingStyle)
	}
	return nil
}

func validateContentPrivacy(contentPrivacy apperr.ContentPrivacySettings) error {
	if !isRemotePolicy(contentPrivacy.RemotePolicy) {
		return apperr.Validation("content.remotePolicy", "ask, allow, or block", contentPrivacy.RemotePolicy)
	}
	return nil
}

func validateEditor(editor apperr.EditorSettings) error {
	if editor.FontSize != EditorFontSizeSmall && editor.FontSize != EditorFontSizeMedium && editor.FontSize != EditorFontSizeLarge {
		return apperr.Validation("editor.fontSize", "13, 14, or 16", strconv.Itoa(editor.FontSize))
	}
	return nil
}

func isTheme(value string) bool {
	return value == ThemeGlass || value == ThemeMaterial || value == ThemeMinimal
}

func isMode(value string) bool {
	return value == ModeAuto || value == ModeLight || value == ModeDark
}

func isOpenMode(value string) bool {
	return value == OpenModeEditor || value == OpenModeViewer
}

func isMarkdownStandard(value string) bool {
	return value == MarkdownMinimal || value == MarkdownGFM || value == MarkdownFull
}

func isBulletMarker(value string) bool {
	return value == BulletMarkerDash || value == BulletMarkerAsterisk || value == BulletMarkerPlus
}

func isEmphasisMarker(value string) bool {
	return value == EmphasisMarkerUnderscore || value == EmphasisMarkerAsterisk
}

func isHeadingStyle(value string) bool {
	return value == HeadingStyleATX || value == HeadingStyleSetext
}

func isRemotePolicy(value string) bool {
	return value == RemotePolicyAsk || value == RemotePolicyAllow || value == RemotePolicyBlock
}
