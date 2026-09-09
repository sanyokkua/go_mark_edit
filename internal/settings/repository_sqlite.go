package settings

import (
	"context"
	"errors"
	"strconv"

	"github.com/sanyokkua/go_mark_edit/internal/apperr"
	"github.com/sanyokkua/go_mark_edit/internal/db"
	"github.com/sanyokkua/go_mark_edit/internal/kv"
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
	editorLineNumbersKey   = "editor.lineNumbers"
	editorWordWrapKey      = "editor.wordWrap"
	editorFontSizeKey      = "editor.fontSize"
	fileAutosaveKey        = "file.autosave"
	settingTypeString      = "string"
	settingTypeBool        = "bool"
)

// SqliteSettingsRepository persists typed groups through the generic settings
// key-value table. New scalar settings only need a dotted key and typed helper.
type SqliteSettingsRepository struct {
	store *kv.Store
}

// NewSqliteSettingsRepository constructs the SQLite implementation used after
// ApplicationContextHolder opens the database.
func NewSqliteSettingsRepository(database *db.Database) *SqliteSettingsRepository {
	if database == nil {
		return &SqliteSettingsRepository{store: kv.New(nil)}
	}
	return &SqliteSettingsRepository{store: kv.New(database.DB)}
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

// GetEditor reads the persisted editor display group with scalar defaults.
func (repository *SqliteSettingsRepository) GetEditor(ctx context.Context) (apperr.EditorSettings, error) {
	defaults := DefaultSettings().Editor
	lineNumbers, err := repository.getBool(ctx, editorLineNumbersKey, defaults.LineNumbers)
	if err != nil {
		return apperr.EditorSettings{}, err
	}
	wordWrap, err := repository.getBool(ctx, editorWordWrapKey, defaults.WordWrap)
	if err != nil {
		return apperr.EditorSettings{}, err
	}
	fontSize, err := repository.getInt(ctx, editorFontSizeKey, defaults.FontSize)
	if err != nil {
		return apperr.EditorSettings{}, err
	}
	return apperr.EditorSettings{LineNumbers: lineNumbers, WordWrap: wordWrap, FontSize: fontSize}, nil
}

// GetFile reads the persisted file-automation group with scalar defaults.
func (repository *SqliteSettingsRepository) GetFile(ctx context.Context) (apperr.FileSettings, error) {
	autosave, err := repository.getBool(ctx, fileAutosaveKey, DefaultAutosave)
	if err != nil {
		return apperr.FileSettings{}, err
	}
	return apperr.FileSettings{Autosave: autosave}, nil
}

// UpdateAppearance writes the complete appearance group in one transaction.
func (repository *SqliteSettingsRepository) UpdateAppearance(ctx context.Context, appearance apperr.AppearanceSettings) error {
	return repository.updateGroup(ctx, []kv.KVEntry{
		{Key: appearanceThemeKey, Value: appearance.Theme, Type: settingTypeString},
		{Key: appearanceModeKey, Value: appearance.Mode, Type: settingTypeString},
		{Key: defaultOpenModeKey, Value: appearance.DefaultOpenMode, Type: settingTypeString},
	})
}

// ResetAppearance atomically restores all and only the delivered appearance
// values; layout, documents, and every other settings group stay untouched.
func (repository *SqliteSettingsRepository) ResetAppearance(ctx context.Context) error {
	defaults := DefaultSettings().Appearance
	return repository.updateGroup(ctx, []kv.KVEntry{
		{Key: appearanceThemeKey, Value: defaults.Theme, Type: settingTypeString},
		{Key: appearanceModeKey, Value: defaults.Mode, Type: settingTypeString},
		{Key: defaultOpenModeKey, Value: defaults.DefaultOpenMode, Type: settingTypeString},
	})
}

// UpdateMarkdown writes the complete Markdown group in one transaction.
func (repository *SqliteSettingsRepository) UpdateMarkdown(ctx context.Context, markdown apperr.MarkdownSettings) error {
	return repository.updateGroup(ctx, []kv.KVEntry{
		{Key: markdownStandardKey, Value: markdown.Standard, Type: settingTypeString},
		{Key: formatOnSaveKey, Value: strconv.FormatBool(markdown.FormatOnSave), Type: settingTypeBool},
		{Key: lintOnSaveKey, Value: strconv.FormatBool(markdown.LintOnSave), Type: settingTypeBool},
		{Key: formatBulletMarkerKey, Value: markdown.BulletMarker, Type: settingTypeString},
		{Key: formatEmphasisKey, Value: markdown.EmphasisMarker, Type: settingTypeString},
		{Key: formatHeadingStyleKey, Value: markdown.HeadingStyle, Type: settingTypeString},
	})
}

// UpdateContentPrivacy writes the complete content-privacy group in one transaction.
func (repository *SqliteSettingsRepository) UpdateContentPrivacy(ctx context.Context, contentPrivacy apperr.ContentPrivacySettings) error {
	return repository.updateGroup(ctx, []kv.KVEntry{{Key: contentRemotePolicyKey, Value: contentPrivacy.RemotePolicy, Type: settingTypeString}})
}

// UpdateEditor writes the editor display group in one transaction.
func (repository *SqliteSettingsRepository) UpdateEditor(ctx context.Context, editor apperr.EditorSettings) error {
	return repository.updateGroup(ctx, []kv.KVEntry{
		{Key: editorLineNumbersKey, Value: strconv.FormatBool(editor.LineNumbers), Type: settingTypeBool},
		{Key: editorWordWrapKey, Value: strconv.FormatBool(editor.WordWrap), Type: settingTypeBool},
		{Key: editorFontSizeKey, Value: strconv.Itoa(editor.FontSize), Type: settingTypeString},
	})
}

// UpdateFile writes the complete file-automation group in one transaction.
func (repository *SqliteSettingsRepository) UpdateFile(ctx context.Context, fileSettings apperr.FileSettings) error {
	return repository.updateGroup(ctx, []kv.KVEntry{{Key: fileAutosaveKey, Value: strconv.FormatBool(fileSettings.Autosave), Type: settingTypeBool}})
}

func (repository *SqliteSettingsRepository) getString(ctx context.Context, key, defaultValue string) (string, error) {
	entry, found, err := repository.store.Get(ctx, key)
	if err != nil {
		return "", err
	}
	if !found || entry.Type != settingTypeString {
		return defaultValue, nil
	}
	return entry.Value, nil
}

func (repository *SqliteSettingsRepository) getBool(ctx context.Context, key string, defaultValue bool) (bool, error) {
	entry, found, err := repository.store.Get(ctx, key)
	if err != nil {
		return false, err
	}
	if !found || entry.Type != settingTypeBool {
		return defaultValue, nil
	}
	value, err := strconv.ParseBool(entry.Value)
	if err != nil {
		return defaultValue, nil
	}
	return value, nil
}

func (repository *SqliteSettingsRepository) getInt(ctx context.Context, key string, defaultValue int) (int, error) {
	entry, found, err := repository.store.Get(ctx, key)
	if err != nil {
		return 0, err
	}
	if !found || entry.Type != settingTypeString {
		return defaultValue, nil
	}
	value, err := strconv.Atoi(entry.Value)
	if err != nil {
		return defaultValue, nil
	}
	return value, nil
}

func (repository *SqliteSettingsRepository) upsertBool(ctx context.Context, key string, value bool) error {
	return repository.store.Upsert(ctx, kv.KVEntry{Key: key, Value: strconv.FormatBool(value), Type: settingTypeBool})
}

func (repository *SqliteSettingsRepository) updateGroup(ctx context.Context, entries []kv.KVEntry) error {
	if len(entries) == 0 {
		return errors.New("settings group is empty")
	}
	return repository.store.Tx(ctx, func(transaction *kv.Tx) error {
		for _, entry := range entries {
			if err := transaction.Upsert(ctx, entry); err != nil {
				return err
			}
		}
		return nil
	})
}

var _ SettingsRepositoryAPI = (*SqliteSettingsRepository)(nil)
