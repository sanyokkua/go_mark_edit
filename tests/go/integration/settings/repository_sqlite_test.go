package settings_test

import (
	"context"
	"errors"
	. "github.com/sanyokkua/go_mark_edit/internal/settings"
	"path/filepath"
	"strconv"
	"strings"
	"testing"

	"github.com/sanyokkua/go_mark_edit/internal/apperr"
	"github.com/sanyokkua/go_mark_edit/internal/db"
	"github.com/sanyokkua/go_mark_edit/internal/kv"
)

// An empty typed KV store returns every complete Stage-1 scalar at its documented default.
func TestCompleteStageOneDefaultsFromEmptyKV(t *testing.T) {
	ctx := context.Background()
	database, err := db.Open(ctx, filepath.Join(t.TempDir(), "settings.db"))
	if err != nil {
		t.Fatalf("open temporary settings database: %v", err)
	}
	t.Cleanup(func() {
		if closeErr := database.Close(); closeErr != nil {
			t.Errorf("close temporary settings database: %v", closeErr)
		}
	})

	got, err := NewSettingsService(NewSqliteSettingsRepository(database)).Get(ctx)
	if err != nil {
		t.Fatalf("read empty settings registry: %v", err)
	}
	want := apperr.Settings{
		Appearance: apperr.AppearanceSettings{
			Theme:           ThemeMaterial,
			Mode:            ModeAuto,
			DefaultOpenMode: OpenModeEditor,
		},
		Markdown: apperr.MarkdownSettings{
			Standard:       MarkdownGFM,
			FormatOnSave:   false,
			LintOnSave:     true,
			BulletMarker:   BulletMarkerDash,
			EmphasisMarker: EmphasisMarkerUnderscore,
			HeadingStyle:   HeadingStyleATX,
		},
		ContentPrivacy: apperr.ContentPrivacySettings{RemotePolicy: RemotePolicyAsk},
		Editor:         DefaultSettings().Editor,
		File:           DefaultSettings().File,
	}
	if got != want {
		t.Fatalf("empty settings registry = %+v, want %+v", got, want)
	}
}

// Valid non-default Appearance and Markdown groups round-trip through their stable dotted keys with the declared scalar metadata.
func TestAppearanceAndMarkdownGroupsRoundTripDottedTypedKV(t *testing.T) {
	ctx := context.Background()
	database, err := db.Open(ctx, filepath.Join(t.TempDir(), "settings.db"))
	if err != nil {
		t.Fatalf("open temporary settings database: %v", err)
	}
	t.Cleanup(func() {
		if closeErr := database.Close(); closeErr != nil {
			t.Errorf("close temporary settings database: %v", closeErr)
		}
	})

	service := NewSettingsService(NewSqliteSettingsRepository(database))
	wantAppearance := apperr.AppearanceSettings{
		Theme:           ThemeGlass,
		Mode:            ModeDark,
		DefaultOpenMode: OpenModeViewer,
	}
	wantMarkdown := apperr.MarkdownSettings{
		Standard:       MarkdownFull,
		FormatOnSave:   true,
		LintOnSave:     false,
		BulletMarker:   BulletMarkerPlus,
		EmphasisMarker: EmphasisMarkerAsterisk,
		HeadingStyle:   HeadingStyleSetext,
	}
	if err := service.UpdateAppearance(ctx, wantAppearance); err != nil {
		t.Fatalf("update appearance: %v", err)
	}
	if err := service.UpdateMarkdown(ctx, wantMarkdown); err != nil {
		t.Fatalf("update markdown: %v", err)
	}
	wantFile := apperr.FileSettings{Autosave: false}
	if err := service.UpdateFile(ctx, wantFile); err != nil {
		t.Fatalf("update file settings: %v", err)
	}

	for key, want := range map[string]kv.KVEntry{
		"appearance.theme":      {Key: "appearance.theme", Value: ThemeGlass, Type: "string"},
		"appearance.mode":       {Key: "appearance.mode", Value: ModeDark, Type: "string"},
		"view.defaultOpenMode":  {Key: "view.defaultOpenMode", Value: OpenModeViewer, Type: "string"},
		"markdown.standard":     {Key: "markdown.standard", Value: MarkdownFull, Type: "string"},
		"format.onSave":         {Key: "format.onSave", Value: "true", Type: "bool"},
		"lint.onSave":           {Key: "lint.onSave", Value: "false", Type: "bool"},
		"format.bulletMarker":   {Key: "format.bulletMarker", Value: BulletMarkerPlus, Type: "string"},
		"format.emphasisMarker": {Key: "format.emphasisMarker", Value: EmphasisMarkerAsterisk, Type: "string"},
		"format.headingStyle":   {Key: "format.headingStyle", Value: HeadingStyleSetext, Type: "string"},
		"file.autosave":         {Key: "file.autosave", Value: "false", Type: "bool"},
	} {
		got, getErr := readKVSetting(database, ctx, key)
		if getErr != nil {
			t.Fatalf("read persisted key %q: %v", key, getErr)
		}
		if got.Key != want.Key || got.Value != want.Value || got.Type != want.Type {
			t.Fatalf("persisted key %q = %+v, want %+v", key, got, want)
		}
	}

	got, err := service.Get(ctx)
	if err != nil {
		t.Fatalf("read round-tripped registry: %v", err)
	}
	if got.Appearance != wantAppearance || got.Markdown != wantMarkdown || got.File != wantFile {
		t.Fatalf("round-tripped groups = %+v, want appearance %+v and markdown %+v", got, wantAppearance, wantMarkdown)
	}
	if got.ContentPrivacy.RemotePolicy != RemotePolicyAsk {
		t.Fatalf("unchanged content privacy = %q, want %q", got.ContentPrivacy.RemotePolicy, RemotePolicyAsk)
	}
}

// Evidence: EC-THEME-3, EC-SET-2
// Per-scalar missing, invalid, and wrong-type persisted rows fall back independently while valid siblings remain intact.
func TestStoredSettingsFallbackMatrix(t *testing.T) {
	valid := apperr.Settings{
		Appearance: apperr.AppearanceSettings{Theme: ThemeGlass, Mode: ModeDark, DefaultOpenMode: OpenModeViewer},
		Markdown: apperr.MarkdownSettings{
			Standard:       MarkdownFull,
			FormatOnSave:   true,
			LintOnSave:     false,
			BulletMarker:   BulletMarkerPlus,
			EmphasisMarker: EmphasisMarkerAsterisk,
			HeadingStyle:   HeadingStyleSetext,
		},
		ContentPrivacy: apperr.ContentPrivacySettings{RemotePolicy: RemotePolicyAllow},
		Editor:         DefaultSettings().Editor,
		File:           DefaultSettings().File,
	}

	type storedFault struct {
		name  string
		key   string
		value string
		type_ string
		omit  bool
	}
	testCases := []storedFault{
		{name: "EC-THEME-3 missing theme", key: "appearance.theme", omit: true},
		{name: "EC-THEME-3 unsupported theme", key: "appearance.theme", value: "vaporwave", type_: "string"},
		{name: "EC-THEME-3 theme type mismatch", key: "appearance.theme", value: ThemeMinimal, type_: "bool"},
		{name: "missing color mode", key: "appearance.mode", omit: true},
		{name: "unsupported color mode", key: "appearance.mode", value: "midnight", type_: "string"},
		{name: "color mode type mismatch", key: "appearance.mode", value: ModeLight, type_: "bool"},
		{name: "missing default open mode", key: "view.defaultOpenMode", omit: true},
		{name: "unsupported default open mode", key: "view.defaultOpenMode", value: "split", type_: "string"},
		{name: "default open mode type mismatch", key: "view.defaultOpenMode", value: OpenModeEditor, type_: "bool"},
		{name: "missing markdown standard", key: "markdown.standard", omit: true},
		{name: "unsupported markdown standard", key: "markdown.standard", value: "plain-text", type_: "string"},
		{name: "markdown standard type mismatch", key: "markdown.standard", value: MarkdownGFM, type_: "bool"},
		{name: "missing format on save", key: "format.onSave", omit: true},
		{name: "malformed format on save", key: "format.onSave", value: "sometimes", type_: "bool"},
		{name: "format on save type mismatch", key: "format.onSave", value: "true", type_: "string"},
		{name: "missing lint on save", key: "lint.onSave", omit: true},
		{name: "malformed lint on save", key: "lint.onSave", value: "sometimes", type_: "bool"},
		{name: "lint on save type mismatch", key: "lint.onSave", value: "false", type_: "string"},
		{name: "missing bullet marker", key: "format.bulletMarker", omit: true},
		{name: "unsupported bullet marker", key: "format.bulletMarker", value: "•", type_: "string"},
		{name: "bullet marker type mismatch", key: "format.bulletMarker", value: BulletMarkerDash, type_: "bool"},
		{name: "missing emphasis marker", key: "format.emphasisMarker", omit: true},
		{name: "unsupported emphasis marker", key: "format.emphasisMarker", value: "~", type_: "string"},
		{name: "emphasis marker type mismatch", key: "format.emphasisMarker", value: EmphasisMarkerUnderscore, type_: "bool"},
		{name: "missing heading style", key: "format.headingStyle", omit: true},
		{name: "unsupported heading style", key: "format.headingStyle", value: "underlined", type_: "string"},
		{name: "heading style type mismatch", key: "format.headingStyle", value: HeadingStyleATX, type_: "bool"},
		{name: "missing remote policy", key: "content.remotePolicy", omit: true},
		{name: "unsupported remote policy", key: "content.remotePolicy", value: "sometimes", type_: "string"},
		{name: "remote policy type mismatch", key: "content.remotePolicy", value: RemotePolicyBlock, type_: "bool"},
		{name: "missing autosave", key: "file.autosave", omit: true},
		{name: "malformed autosave", key: "file.autosave", value: "sometimes", type_: "bool"},
		{name: "autosave type mismatch", key: "file.autosave", value: "false", type_: "string"},
	}

	for _, testCase := range testCases {
		t.Run(testCase.name, func(t *testing.T) {
			ctx := context.Background()
			database, err := db.Open(ctx, filepath.Join(t.TempDir(), "settings.db"))
			if err != nil {
				t.Fatalf("open temporary settings database: %v", err)
			}
			t.Cleanup(func() {
				if closeErr := database.Close(); closeErr != nil {
					t.Errorf("close temporary settings database: %v", closeErr)
				}
			})

			seedCompleteSettings(t, ctx, database, valid, testCase.key)
			if !testCase.omit {
				if err := writeKVSetting(database, ctx, kv.KVEntry{
					Key: testCase.key, Value: testCase.value, Type: testCase.type_,
				}); err != nil {
					t.Fatalf("seed corrupt setting %q: %v", testCase.key, err)
				}
			}

			want := valid
			setSettingsScalar(t, &want, testCase.key, settingsScalarValue(DefaultSettings(), testCase.key))
			got, err := NewSettingsService(NewSqliteSettingsRepository(database)).Get(ctx)
			if err != nil {
				t.Fatalf("read fallback settings: %v", err)
			}
			if got != want {
				t.Fatalf("fallback settings = %+v, want %+v", got, want)
			}
		})
	}

	t.Run("EC-SET-2 all empty canonical style scalars preserve boolean siblings", func(t *testing.T) {
		ctx := context.Background()
		database, err := db.Open(ctx, filepath.Join(t.TempDir(), "settings.db"))
		if err != nil {
			t.Fatalf("open temporary settings database: %v", err)
		}
		t.Cleanup(func() {
			if closeErr := database.Close(); closeErr != nil {
				t.Errorf("close temporary settings database: %v", closeErr)
			}
		})

		seedCompleteSettings(t, ctx, database, valid, "")
		for _, key := range []string{"format.bulletMarker", "format.emphasisMarker", "format.headingStyle"} {
			if err := writeKVSetting(database, ctx, kv.KVEntry{
				Key: key, Value: "", Type: "string",
			}); err != nil {
				t.Fatalf("seed empty canonical style %q: %v", key, err)
			}
		}

		want := valid
		want.Markdown.BulletMarker = DefaultSettings().Markdown.BulletMarker
		want.Markdown.EmphasisMarker = DefaultSettings().Markdown.EmphasisMarker
		want.Markdown.HeadingStyle = DefaultSettings().Markdown.HeadingStyle
		got, err := NewSettingsService(NewSqliteSettingsRepository(database)).Get(ctx)
		if err != nil {
			t.Fatalf("read independently normalized settings: %v", err)
		}
		if got != want {
			t.Fatalf("settings after empty canonical styles = %+v, want %+v", got, want)
		}
	})
}

// A future bool scalar uses the same generic KV table and typed helpers without changing the existing registry or schema.
func TestSettingsRegistryAddsTypedScalarWithoutSchemaChange(t *testing.T) {
	ctx := context.Background()
	database, err := db.Open(ctx, filepath.Join(t.TempDir(), "settings.db"))
	if err != nil {
		t.Fatalf("open temporary settings database: %v", err)
	}
	t.Cleanup(func() {
		if closeErr := database.Close(); closeErr != nil {
			t.Errorf("close temporary settings database: %v", closeErr)
		}
	})

	repository := NewSqliteSettingsRepository(database)
	service := NewSettingsService(repository)
	existing := apperr.Settings{
		Appearance: apperr.AppearanceSettings{Theme: ThemeMinimal, Mode: ModeLight, DefaultOpenMode: OpenModeViewer},
		Markdown: apperr.MarkdownSettings{
			Standard:       MarkdownMinimal,
			FormatOnSave:   true,
			LintOnSave:     false,
			BulletMarker:   BulletMarkerAsterisk,
			EmphasisMarker: EmphasisMarkerAsterisk,
			HeadingStyle:   HeadingStyleSetext,
		},
		ContentPrivacy: apperr.ContentPrivacySettings{RemotePolicy: RemotePolicyBlock},
		Editor:         DefaultSettings().Editor,
		File:           DefaultSettings().File,
	}
	if err := service.UpdateAppearance(ctx, existing.Appearance); err != nil {
		t.Fatalf("seed appearance: %v", err)
	}
	if err := service.UpdateMarkdown(ctx, existing.Markdown); err != nil {
		t.Fatalf("seed markdown: %v", err)
	}
	if err := service.UpdateContentPrivacy(ctx, existing.ContentPrivacy); err != nil {
		t.Fatalf("seed content privacy: %v", err)
	}
	beforeSchema := settingsTableColumns(t, ctx, database)

	const futureLineNumbersKey = "future.preview.lineNumbers"
	if err := upsertBoolean(database, ctx, futureLineNumbersKey, true); err != nil {
		t.Fatalf("persist future typed scalar: %v", err)
	}
	gotFuture, err := readBoolean(database, ctx, futureLineNumbersKey, false)
	if err != nil {
		t.Fatalf("read future typed scalar: %v", err)
	}
	if !gotFuture {
		t.Fatal("future typed scalar = false, want true")
	}
	storedFuture, err := readKVSetting(database, ctx, futureLineNumbersKey)
	if err != nil {
		t.Fatalf("read future KV row: %v", err)
	}
	if storedFuture.Value != "true" || storedFuture.Type != "bool" {
		t.Fatalf("future KV row = %+v, want true bool", storedFuture)
	}
	if afterSchema := settingsTableColumns(t, ctx, database); afterSchema != beforeSchema {
		t.Fatalf("settings schema changed from %q to %q after future scalar", beforeSchema, afterSchema)
	}

	gotExisting, err := service.Get(ctx)
	if err != nil {
		t.Fatalf("read existing registry after future scalar: %v", err)
	}
	if gotExisting != existing {
		t.Fatalf("existing registry after future scalar = %+v, want %+v", gotExisting, existing)
	}
}

// Typed grouped defaults and updates survive a reopen through the generic dotted-key KV table, while a future scalar needs no migration.
func TestTypedGroupedDefaultsRoundTripThroughKV(t *testing.T) {
	ctx := context.Background()
	path := filepath.Join(t.TempDir(), "settings.db")
	database, err := db.Open(ctx, path)
	if err != nil {
		t.Fatalf("open temporary settings database: %v", err)
	}

	repository := NewSqliteSettingsRepository(database)
	defaults := DefaultSettings()
	assertRepositorySettings(t, ctx, repository, defaults)

	want := apperr.Settings{
		Appearance:     apperr.AppearanceSettings{Theme: ThemeMinimal, Mode: ModeDark},
		Markdown:       apperr.MarkdownSettings{Standard: MarkdownFull},
		ContentPrivacy: apperr.ContentPrivacySettings{RemotePolicy: RemotePolicyAllow},
		Editor:         DefaultSettings().Editor,
		File:           DefaultSettings().File,
	}
	if err := repository.UpdateAppearance(ctx, want.Appearance); err != nil {
		if closeErr := database.Close(); closeErr != nil {
			t.Errorf("close settings database after appearance failure: %v", closeErr)
		}
		t.Fatalf("update appearance: %v", err)
	}
	if err := repository.UpdateMarkdown(ctx, want.Markdown); err != nil {
		if closeErr := database.Close(); closeErr != nil {
			t.Errorf("close settings database after markdown failure: %v", closeErr)
		}
		t.Fatalf("update markdown: %v", err)
	}
	if err := repository.UpdateContentPrivacy(ctx, want.ContentPrivacy); err != nil {
		if closeErr := database.Close(); closeErr != nil {
			t.Errorf("close settings database after content privacy failure: %v", closeErr)
		}
		t.Fatalf("update content privacy: %v", err)
	}
	for key, value := range map[string]string{
		"appearance.theme":     want.Appearance.Theme,
		"appearance.mode":      want.Appearance.Mode,
		"markdown.standard":    want.Markdown.Standard,
		"content.remotePolicy": want.ContentPrivacy.RemotePolicy,
	} {
		stored, getErr := readKVSetting(database, ctx, key)
		if getErr != nil {
			if closeErr := database.Close(); closeErr != nil {
				t.Errorf("close settings database after read failure: %v", closeErr)
			}
			t.Fatalf("read typed dotted key %q: %v", key, getErr)
		}
		if stored.Value != value || stored.Type != "string" {
			if closeErr := database.Close(); closeErr != nil {
				t.Errorf("close settings database after assertion failure: %v", closeErr)
			}
			t.Fatalf("stored %q = %+v, want value %q and type %q", key, stored, value, "string")
		}
	}
	if err := writeKVSetting(database, ctx, kv.KVEntry{
		Key: "future.editor.tabSize", Value: "4", Type: "int",
	}); err != nil {
		if closeErr := database.Close(); closeErr != nil {
			t.Errorf("close settings database after future scalar failure: %v", closeErr)
		}
		t.Fatalf("persist future scalar without migration: %v", err)
	}
	if err := database.Close(); err != nil {
		t.Fatalf("close initial settings database: %v", err)
	}

	reopened, err := db.Open(ctx, path)
	if err != nil {
		t.Fatalf("reopen settings database: %v", err)
	}
	t.Cleanup(func() {
		if closeErr := reopened.Close(); closeErr != nil {
			t.Errorf("close reopened settings database: %v", closeErr)
		}
	})
	assertRepositorySettings(t, ctx, NewSqliteSettingsRepository(reopened), want)
	future, err := readKVSetting(reopened, ctx, "future.editor.tabSize")
	if err != nil {
		t.Fatalf("read future scalar after reopen: %v", err)
	}
	if future.Value != "4" || future.Type != "int" {
		t.Fatalf("future scalar after reopen = %+v, want value 4 and type int", future)
	}
}

// Missing, malformed, wrong-type, and unsupported stored values in every initial group resolve to documented defaults.
func TestStoredInvalidValuesResolveToDefaults(t *testing.T) {
	testCases := []struct {
		name string
		seed func(t *testing.T, database *db.Database)
	}{
		{
			name: "missing",
			seed: func(*testing.T, *db.Database) {},
		},
		{
			name: "malformed",
			seed: func(t *testing.T, database *db.Database) {
				seedStoredSettings(t, database, "string", map[string]string{
					"appearance.theme":     "vaporwave",
					"appearance.mode":      "midnight",
					"markdown.standard":    "plain-text",
					"content.remotePolicy": "sometimes",
				})
			},
		},
		{
			name: "wrong type",
			seed: func(t *testing.T, database *db.Database) {
				seedStoredSettings(t, database, "bool", map[string]string{
					"appearance.theme":     ThemeMinimal,
					"appearance.mode":      ModeDark,
					"markdown.standard":    MarkdownFull,
					"content.remotePolicy": RemotePolicyAllow,
				})
			},
		},
		{
			name: "unsupported type",
			seed: func(t *testing.T, database *db.Database) {
				seedStoredSettings(t, database, "future-enum", map[string]string{
					"appearance.theme":     ThemeGlass,
					"appearance.mode":      ModeLight,
					"markdown.standard":    MarkdownMinimal,
					"content.remotePolicy": RemotePolicyBlock,
				})
			},
		},
	}

	for _, testCase := range testCases {
		t.Run(testCase.name, func(t *testing.T) {
			ctx := context.Background()
			database, err := db.Open(ctx, filepath.Join(t.TempDir(), "settings.db"))
			if err != nil {
				t.Fatalf("open temporary settings database: %v", err)
			}
			t.Cleanup(func() {
				if closeErr := database.Close(); closeErr != nil {
					t.Errorf("close settings database: %v", closeErr)
				}
			})
			testCase.seed(t, database)

			got, err := NewSettingsService(NewSqliteSettingsRepository(database)).Get(ctx)
			if err != nil {
				t.Fatalf("get normalized settings: %v", err)
			}
			if got != DefaultSettings() {
				t.Fatalf("normalized settings = %+v, want documented defaults %+v", got, DefaultSettings())
			}
		})
	}
}

func assertRepositorySettings(t *testing.T, ctx context.Context, repository *SqliteSettingsRepository, want apperr.Settings) {
	t.Helper()

	appearance, err := repository.GetAppearance(ctx)
	if err != nil {
		t.Fatalf("get appearance: %v", err)
	}
	markdown, err := repository.GetMarkdown(ctx)
	if err != nil {
		t.Fatalf("get markdown: %v", err)
	}
	contentPrivacy, err := repository.GetContentPrivacy(ctx)
	if err != nil {
		t.Fatalf("get content privacy: %v", err)
	}
	editor, err := repository.GetEditor(ctx)
	if err != nil {
		t.Fatalf("get editor: %v", err)
	}
	fileSettings, err := repository.GetFile(ctx)
	if err != nil {
		t.Fatalf("get file settings: %v", err)
	}
	got := apperr.Settings{Appearance: appearance, Markdown: markdown, ContentPrivacy: contentPrivacy, Editor: editor, File: fileSettings}
	if got != want {
		t.Fatalf("repository settings = %+v, want %+v", got, want)
	}
}

func seedStoredSettings(t *testing.T, database *db.Database, settingType string, values map[string]string) {
	t.Helper()

	for key, value := range values {
		if err := writeKVSetting(database, context.Background(), kv.KVEntry{
			Key: key, Value: value, Type: settingType,
		}); err != nil {
			t.Fatalf("seed %q: %v", key, err)
		}
	}
}

func seedCompleteSettings(t *testing.T, ctx context.Context, database *db.Database, settings apperr.Settings, omitKey string) {
	t.Helper()

	for _, setting := range settingsKVRows(settings) {
		if setting.Key == omitKey {
			continue
		}
		if err := writeKVSetting(database, ctx, setting); err != nil {
			t.Fatalf("seed complete setting %q: %v", setting.Key, err)
		}
	}
}

func settingsKVRows(settings apperr.Settings) []kv.KVEntry {
	return []kv.KVEntry{
		{Key: "appearance.theme", Value: settings.Appearance.Theme, Type: "string"},
		{Key: "appearance.mode", Value: settings.Appearance.Mode, Type: "string"},
		{Key: "view.defaultOpenMode", Value: settings.Appearance.DefaultOpenMode, Type: "string"},
		{Key: "markdown.standard", Value: settings.Markdown.Standard, Type: "string"},
		{Key: "format.onSave", Value: boolString(settings.Markdown.FormatOnSave), Type: "bool"},
		{Key: "lint.onSave", Value: boolString(settings.Markdown.LintOnSave), Type: "bool"},
		{Key: "format.bulletMarker", Value: settings.Markdown.BulletMarker, Type: "string"},
		{Key: "format.emphasisMarker", Value: settings.Markdown.EmphasisMarker, Type: "string"},
		{Key: "format.headingStyle", Value: settings.Markdown.HeadingStyle, Type: "string"},
		{Key: "content.remotePolicy", Value: settings.ContentPrivacy.RemotePolicy, Type: "string"},
		{Key: "editor.lineNumbers", Value: boolString(settings.Editor.LineNumbers), Type: "bool"},
		{Key: "editor.wordWrap", Value: boolString(settings.Editor.WordWrap), Type: "bool"},
		{Key: "editor.fontSize", Value: strconv.Itoa(settings.Editor.FontSize), Type: "string"},
		{Key: "file.autosave", Value: boolString(settings.File.Autosave), Type: "bool"},
	}
}

func writeKVSetting(database *db.Database, ctx context.Context, entry kv.KVEntry) error {
	return kv.New(database.DB).Upsert(ctx, entry)
}

func readKVSetting(database *db.Database, ctx context.Context, key string) (kv.KVEntry, error) {
	entry, found, err := kv.New(database.DB).Get(ctx, key)
	if err != nil {
		return kv.KVEntry{}, err
	}
	if !found {
		return kv.KVEntry{}, errors.New("setting is absent")
	}
	return entry, nil
}

func settingsScalarValue(settings apperr.Settings, key string) string {
	for _, setting := range settingsKVRows(settings) {
		if setting.Key == key {
			return setting.Value
		}
	}
	panic("unknown settings scalar key: " + key)
}

func setSettingsScalar(t *testing.T, settings *apperr.Settings, key, value string) {
	t.Helper()

	switch key {
	case "appearance.theme":
		settings.Appearance.Theme = value
	case "appearance.mode":
		settings.Appearance.Mode = value
	case "view.defaultOpenMode":
		settings.Appearance.DefaultOpenMode = value
	case "markdown.standard":
		settings.Markdown.Standard = value
	case "format.onSave":
		settings.Markdown.FormatOnSave = value == "true"
	case "lint.onSave":
		settings.Markdown.LintOnSave = value == "true"
	case "format.bulletMarker":
		settings.Markdown.BulletMarker = value
	case "format.emphasisMarker":
		settings.Markdown.EmphasisMarker = value
	case "format.headingStyle":
		settings.Markdown.HeadingStyle = value
	case "content.remotePolicy":
		settings.ContentPrivacy.RemotePolicy = value
	case "file.autosave":
		settings.File.Autosave = value == "true"
	default:
		t.Fatalf("unknown settings scalar key %q", key)
	}
}

func boolString(value bool) string {
	if value {
		return "true"
	}
	return "false"
}

// Reset changes exactly Theme, Appearance mode, and default Editor open mode in
// one transaction; unrelated and future keys retain their original values.
func TestResetAppearanceChangesOnlyDeliveredAppearanceKeys(t *testing.T) {
	ctx := context.Background()
	database, err := db.Open(ctx, filepath.Join(t.TempDir(), "settings.db"))
	if err != nil {
		t.Fatalf("open reset database: %v", err)
	}
	t.Cleanup(func() {
		if closeErr := database.Close(); closeErr != nil {
			t.Errorf("close reset database: %v", closeErr)
		}
	})

	before := map[string]kv.KVEntry{
		"appearance.theme":       {Key: "appearance.theme", Value: ThemeMinimal, Type: "string"},
		"appearance.mode":        {Key: "appearance.mode", Value: ModeDark, Type: "string"},
		"view.defaultOpenMode":   {Key: "view.defaultOpenMode", Value: OpenModeViewer, Type: "string"},
		"markdown.standard":      {Key: "markdown.standard", Value: MarkdownFull, Type: "string"},
		"layout.workspaceWidth":  {Key: "layout.workspaceWidth", Value: "314", Type: "int"},
		"document.active":        {Key: "document.active", Value: "document-7", Type: "string"},
		"recent.paths":           {Key: "recent.paths", Value: "opaque", Type: "string"},
		"future.appearance.glow": {Key: "future.appearance.glow", Value: "high", Type: "string"},
	}
	for _, setting := range before {
		if err := writeKVSetting(database, ctx, setting); err != nil {
			t.Fatalf("seed reset key %q: %v", setting.Key, err)
		}
	}

	if err := NewSqliteSettingsRepository(database).ResetAppearance(ctx); err != nil {
		t.Fatalf("reset appearance: %v", err)
	}

	wantAppearance := map[string]string{
		"appearance.theme":     ThemeMaterial,
		"appearance.mode":      ModeAuto,
		"view.defaultOpenMode": OpenModeEditor,
	}
	for key, want := range wantAppearance {
		stored, getErr := readKVSetting(database, ctx, key)
		if getErr != nil {
			t.Fatalf("read reset key %q: %v", key, getErr)
		}
		if stored.Value != want || stored.Type != "string" {
			t.Fatalf("reset key %q = %+v, want value %q string", key, stored, want)
		}
	}
	for _, key := range []string{"markdown.standard", "layout.workspaceWidth", "document.active", "recent.paths", "future.appearance.glow"} {
		stored, getErr := readKVSetting(database, ctx, key)
		if getErr != nil {
			t.Fatalf("read retained key %q: %v", key, getErr)
		}
		if stored.Value != before[key].Value || stored.Type != before[key].Type {
			t.Fatalf("retained key %q = %+v, want %+v", key, stored, before[key])
		}
	}
}

// A failure on the second delivered key rolls the first write back as well.
func TestResetAppearanceRollsBackEveryValueOnFailure(t *testing.T) {
	ctx := context.Background()
	database, err := db.Open(ctx, filepath.Join(t.TempDir(), "settings.db"))
	if err != nil {
		t.Fatalf("open rollback database: %v", err)
	}
	t.Cleanup(func() {
		if closeErr := database.Close(); closeErr != nil {
			t.Errorf("close rollback database: %v", closeErr)
		}
	})
	original := apperr.AppearanceSettings{Theme: ThemeMinimal, Mode: ModeDark, DefaultOpenMode: OpenModeViewer}
	if err := NewSqliteSettingsRepository(database).UpdateAppearance(ctx, original); err != nil {
		t.Fatalf("seed appearance before rollback: %v", err)
	}
	if _, err := database.DB.ExecContext(ctx, `
		CREATE TRIGGER reject_appearance_mode
		BEFORE INSERT ON settings
		WHEN NEW.key = 'appearance.mode'
		BEGIN
			SELECT RAISE(ABORT, 'forced reset failure');
		END`); err != nil {
		t.Fatalf("install reset failure trigger: %v", err)
	}

	repository := NewSqliteSettingsRepository(database)
	if err := repository.ResetAppearance(ctx); err == nil {
		t.Fatal("reset appearance succeeded despite forced middle-key failure")
	}
	got, err := repository.GetAppearance(ctx)
	if err != nil {
		t.Fatalf("read appearance after rollback: %v", err)
	}
	if got != original {
		t.Fatalf("appearance after rollback = %+v, want %+v", got, original)
	}
}

func settingsTableColumns(t *testing.T, ctx context.Context, database *db.Database) string {
	t.Helper()

	rows, err := database.DB.QueryContext(ctx, "PRAGMA table_info(settings)")
	if err != nil {
		t.Fatalf("inspect settings table: %v", err)
	}
	t.Cleanup(func() {
		if closeErr := rows.Close(); closeErr != nil {
			t.Errorf("close settings schema rows: %v", closeErr)
		}
	})

	columns := make([]string, 0, 3)
	for rows.Next() {
		var (
			index      int
			name       string
			columnType string
			notNull    int
			defaultVal any
			primaryKey int
		)
		if err := rows.Scan(&index, &name, &columnType, &notNull, &defaultVal, &primaryKey); err != nil {
			t.Fatalf("scan settings schema row: %v", err)
		}
		columns = append(columns, name+":"+columnType)
	}
	if err := rows.Err(); err != nil {
		t.Fatalf("iterate settings schema: %v", err)
	}
	return strings.Join(columns, ",")
}

func upsertBoolean(database *db.Database, ctx context.Context, key string, value bool) error {
	return kv.New(database.DB).Upsert(ctx, kv.KVEntry{Key: key, Value: strconv.FormatBool(value), Type: "bool"})
}

func readBoolean(database *db.Database, ctx context.Context, key string, fallback bool) (bool, error) {
	entry, found, err := kv.New(database.DB).Get(ctx, key)
	if err != nil {
		return false, err
	}
	if !found || entry.Type != "bool" {
		return fallback, nil
	}
	parsed, err := strconv.ParseBool(entry.Value)
	if err != nil {
		return fallback, nil
	}
	return parsed, nil
}
