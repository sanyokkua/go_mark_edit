package settings

import (
	"context"
	"database/sql"
	"errors"
	"strconv"

	"github.com/sanyokkua/go_mark_edit/internal/apperr"
	"github.com/sanyokkua/go_mark_edit/internal/db"
	"github.com/sanyokkua/go_mark_edit/internal/db/store"
)

const (
	appearanceThemeKey     = "appearance.theme"
	appearanceModeKey      = "appearance.mode"
	defaultOpenModeKey     = "view.defaultOpenMode"
	markdownStandardKey    = "markdown.standard"
	formatOnSaveKey        = "format.onSave"
	lintOnSaveKey          = "lint.onSave"
	formatBulletMarkerKey  = "format.bulletMarker"
	formatEmphasisKey      = "format.emphasisMarker"
	formatHeadingStyleKey  = "format.headingStyle"
	contentRemotePolicyKey = "content.remotePolicy"
	settingTypeString      = "string"
	settingTypeBool        = "bool"
)

// SqliteSettingsRepository persists typed groups through the generic settings
// key-value table. New scalar settings only need a dotted key and typed helper.
type SqliteSettingsRepository struct {
	queries *store.Queries
}

// NewSqliteSettingsRepository constructs the SQLite implementation used after
// ApplicationContextHolder opens the database.
func NewSqliteSettingsRepository(database *db.Database) *SqliteSettingsRepository {
	return &SqliteSettingsRepository{queries: database.Queries}
}

// GetAppearance reads the persisted appearance group with scalar defaults.
func (repository *SqliteSettingsRepository) GetAppearance(ctx context.Context) (apperr.AppearanceSettings, error) {
	defaults := DefaultSettings().Appearance
	theme, err := repository.getString(ctx, appearanceThemeKey, defaults.Theme)
	if err != nil {
		return apperr.AppearanceSettings{}, err
	}
	mode, err := repository.getString(ctx, appearanceModeKey, defaults.Mode)
	if err != nil {
		return apperr.AppearanceSettings{}, err
	}
	defaultOpenMode, err := repository.getString(ctx, defaultOpenModeKey, defaults.DefaultOpenMode)
	if err != nil {
		return apperr.AppearanceSettings{}, err
	}
	return apperr.AppearanceSettings{Theme: theme, Mode: mode, DefaultOpenMode: defaultOpenMode}, nil
}

// GetMarkdown reads the persisted Markdown group with scalar defaults.
func (repository *SqliteSettingsRepository) GetMarkdown(ctx context.Context) (apperr.MarkdownSettings, error) {
	defaults := DefaultSettings().Markdown
	standard, err := repository.getString(ctx, markdownStandardKey, defaults.Standard)
	if err != nil {
		return apperr.MarkdownSettings{}, err
	}
	formatOnSave, err := repository.getBool(ctx, formatOnSaveKey, defaults.FormatOnSave)
	if err != nil {
		return apperr.MarkdownSettings{}, err
	}
	lintOnSave, err := repository.getBool(ctx, lintOnSaveKey, defaults.LintOnSave)
	if err != nil {
		return apperr.MarkdownSettings{}, err
	}
	bulletMarker, err := repository.getString(ctx, formatBulletMarkerKey, defaults.BulletMarker)
	if err != nil {
		return apperr.MarkdownSettings{}, err
	}
	emphasisMarker, err := repository.getString(ctx, formatEmphasisKey, defaults.EmphasisMarker)
	if err != nil {
		return apperr.MarkdownSettings{}, err
	}
	headingStyle, err := repository.getString(ctx, formatHeadingStyleKey, defaults.HeadingStyle)
	if err != nil {
		return apperr.MarkdownSettings{}, err
	}
	return apperr.MarkdownSettings{
		Standard:       standard,
		FormatOnSave:   formatOnSave,
		LintOnSave:     lintOnSave,
		BulletMarker:   bulletMarker,
		EmphasisMarker: emphasisMarker,
		HeadingStyle:   headingStyle,
	}, nil
}

// GetContentPrivacy reads the persisted content-privacy group with defaults.
func (repository *SqliteSettingsRepository) GetContentPrivacy(ctx context.Context) (apperr.ContentPrivacySettings, error) {
	defaults := DefaultSettings().ContentPrivacy
	remotePolicy, err := repository.getString(ctx, contentRemotePolicyKey, defaults.RemotePolicy)
	if err != nil {
		return apperr.ContentPrivacySettings{}, err
	}
	return apperr.ContentPrivacySettings{RemotePolicy: remotePolicy}, nil
}

// UpdateAppearance writes the complete appearance group through typed KV keys.
func (repository *SqliteSettingsRepository) UpdateAppearance(ctx context.Context, appearance apperr.AppearanceSettings) error {
	if err := repository.upsertString(ctx, appearanceThemeKey, appearance.Theme); err != nil {
		return err
	}
	if err := repository.upsertString(ctx, appearanceModeKey, appearance.Mode); err != nil {
		return err
	}
	return repository.upsertString(ctx, defaultOpenModeKey, appearance.DefaultOpenMode)
}

// UpdateMarkdown writes the complete Markdown group through typed KV keys.
func (repository *SqliteSettingsRepository) UpdateMarkdown(ctx context.Context, markdown apperr.MarkdownSettings) error {
	if err := repository.upsertString(ctx, markdownStandardKey, markdown.Standard); err != nil {
		return err
	}
	if err := repository.upsertBool(ctx, formatOnSaveKey, markdown.FormatOnSave); err != nil {
		return err
	}
	if err := repository.upsertBool(ctx, lintOnSaveKey, markdown.LintOnSave); err != nil {
		return err
	}
	if err := repository.upsertString(ctx, formatBulletMarkerKey, markdown.BulletMarker); err != nil {
		return err
	}
	if err := repository.upsertString(ctx, formatEmphasisKey, markdown.EmphasisMarker); err != nil {
		return err
	}
	return repository.upsertString(ctx, formatHeadingStyleKey, markdown.HeadingStyle)
}

// UpdateContentPrivacy writes the complete content-privacy group through typed KV keys.
func (repository *SqliteSettingsRepository) UpdateContentPrivacy(ctx context.Context, contentPrivacy apperr.ContentPrivacySettings) error {
	return repository.upsertString(ctx, contentRemotePolicyKey, contentPrivacy.RemotePolicy)
}

func (repository *SqliteSettingsRepository) getString(ctx context.Context, key, defaultValue string) (string, error) {
	setting, err := repository.queries.GetSetting(ctx, key)
	if errors.Is(err, sql.ErrNoRows) {
		return defaultValue, nil
	}
	if err != nil {
		return "", err
	}
	if setting.Type != settingTypeString {
		return defaultValue, nil
	}
	return setting.Value, nil
}

func (repository *SqliteSettingsRepository) getBool(ctx context.Context, key string, defaultValue bool) (bool, error) {
	setting, err := repository.queries.GetSetting(ctx, key)
	if errors.Is(err, sql.ErrNoRows) {
		return defaultValue, nil
	}
	if err != nil {
		return false, err
	}
	if setting.Type != settingTypeBool {
		return defaultValue, nil
	}
	value, err := strconv.ParseBool(setting.Value)
	if err != nil {
		return defaultValue, nil
	}
	return value, nil
}

func (repository *SqliteSettingsRepository) upsertString(ctx context.Context, key, value string) error {
	return repository.queries.UpsertSetting(ctx, store.UpsertSettingParams{
		Key:   key,
		Value: value,
		Type:  settingTypeString,
	})
}

func (repository *SqliteSettingsRepository) upsertBool(ctx context.Context, key string, value bool) error {
	return repository.queries.UpsertSetting(ctx, store.UpsertSettingParams{
		Key:   key,
		Value: strconv.FormatBool(value),
		Type:  settingTypeBool,
	})
}

var _ SettingsRepositoryAPI = (*SqliteSettingsRepository)(nil)
