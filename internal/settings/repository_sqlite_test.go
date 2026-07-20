package settings

import (
	"context"
	"path/filepath"
	"strings"
	"testing"

	"github.com/sanyokkua/go_mark_edit/internal/apperr"
	"github.com/sanyokkua/go_mark_edit/internal/db"
	"github.com/sanyokkua/go_mark_edit/internal/db/store"
)

// Proves: STORY-009-AC-1
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
	}
	if got != want {
		t.Fatalf("empty settings registry = %+v, want %+v", got, want)
	}
}

// Proves: STORY-009-AC-2
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
		Theme:           ThemeLiquidGlass,
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

	for key, want := range map[string]store.UpsertSettingParams{
		appearanceThemeKey:    {Key: appearanceThemeKey, Value: ThemeLiquidGlass, Type: settingTypeString},
		appearanceModeKey:     {Key: appearanceModeKey, Value: ModeDark, Type: settingTypeString},
		defaultOpenModeKey:    {Key: defaultOpenModeKey, Value: OpenModeViewer, Type: settingTypeString},
		markdownStandardKey:   {Key: markdownStandardKey, Value: MarkdownFull, Type: settingTypeString},
		formatOnSaveKey:       {Key: formatOnSaveKey, Value: "true", Type: settingTypeBool},
		lintOnSaveKey:         {Key: lintOnSaveKey, Value: "false", Type: settingTypeBool},
		formatBulletMarkerKey: {Key: formatBulletMarkerKey, Value: BulletMarkerPlus, Type: settingTypeString},
		formatEmphasisKey:     {Key: formatEmphasisKey, Value: EmphasisMarkerAsterisk, Type: settingTypeString},
		formatHeadingStyleKey: {Key: formatHeadingStyleKey, Value: HeadingStyleSetext, Type: settingTypeString},
	} {
		got, getErr := database.Queries.GetSetting(ctx, key)
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
	if got.Appearance != wantAppearance || got.Markdown != wantMarkdown {
		t.Fatalf("round-tripped groups = %+v, want appearance %+v and markdown %+v", got, wantAppearance, wantMarkdown)
	}
	if got.ContentPrivacy.RemotePolicy != RemotePolicyAsk {
		t.Fatalf("unchanged content privacy = %q, want %q", got.ContentPrivacy.RemotePolicy, RemotePolicyAsk)
	}
}

// Proves: STORY-009-AC-4
// Per-scalar missing, invalid, and wrong-type persisted rows fall back independently while valid siblings remain intact (EC-THEME-3; EC-SET-2 safe default).
func TestStoredSettingsFallbackMatrix(t *testing.T) {
	valid := apperr.Settings{
		Appearance: apperr.AppearanceSettings{Theme: ThemeLiquidGlass, Mode: ModeDark, DefaultOpenMode: OpenModeViewer},
		Markdown: apperr.MarkdownSettings{
			Standard:       MarkdownFull,
			FormatOnSave:   true,
			LintOnSave:     false,
			BulletMarker:   BulletMarkerPlus,
			EmphasisMarker: EmphasisMarkerAsterisk,
			HeadingStyle:   HeadingStyleSetext,
		},
		ContentPrivacy: apperr.ContentPrivacySettings{RemotePolicy: RemotePolicyAllow},
	}

	type storedFault struct {
		name  string
		key   string
		value string
		type_ string
		omit  bool
	}
	testCases := []storedFault{
		{name: "EC-THEME-3 missing theme", key: appearanceThemeKey, omit: true},
		{name: "EC-THEME-3 unsupported theme", key: appearanceThemeKey, value: "vaporwave", type_: settingTypeString},
		{name: "EC-THEME-3 theme type mismatch", key: appearanceThemeKey, value: ThemeMinimal, type_: settingTypeBool},
		{name: "missing color mode", key: appearanceModeKey, omit: true},
		{name: "unsupported color mode", key: appearanceModeKey, value: "midnight", type_: settingTypeString},
		{name: "color mode type mismatch", key: appearanceModeKey, value: ModeLight, type_: settingTypeBool},
		{name: "missing default open mode", key: defaultOpenModeKey, omit: true},
		{name: "unsupported default open mode", key: defaultOpenModeKey, value: "split", type_: settingTypeString},
		{name: "default open mode type mismatch", key: defaultOpenModeKey, value: OpenModeEditor, type_: settingTypeBool},
		{name: "missing markdown standard", key: markdownStandardKey, omit: true},
		{name: "unsupported markdown standard", key: markdownStandardKey, value: "plain-text", type_: settingTypeString},
		{name: "markdown standard type mismatch", key: markdownStandardKey, value: MarkdownGFM, type_: settingTypeBool},
		{name: "missing format on save", key: formatOnSaveKey, omit: true},
		{name: "malformed format on save", key: formatOnSaveKey, value: "sometimes", type_: settingTypeBool},
		{name: "format on save type mismatch", key: formatOnSaveKey, value: "true", type_: settingTypeString},
		{name: "missing lint on save", key: lintOnSaveKey, omit: true},
		{name: "malformed lint on save", key: lintOnSaveKey, value: "sometimes", type_: settingTypeBool},
		{name: "lint on save type mismatch", key: lintOnSaveKey, value: "false", type_: settingTypeString},
		{name: "missing bullet marker", key: formatBulletMarkerKey, omit: true},
		{name: "unsupported bullet marker", key: formatBulletMarkerKey, value: "•", type_: settingTypeString},
		{name: "bullet marker type mismatch", key: formatBulletMarkerKey, value: BulletMarkerDash, type_: settingTypeBool},
		{name: "missing emphasis marker", key: formatEmphasisKey, omit: true},
		{name: "unsupported emphasis marker", key: formatEmphasisKey, value: "~", type_: settingTypeString},
		{name: "emphasis marker type mismatch", key: formatEmphasisKey, value: EmphasisMarkerUnderscore, type_: settingTypeBool},
		{name: "missing heading style", key: formatHeadingStyleKey, omit: true},
		{name: "unsupported heading style", key: formatHeadingStyleKey, value: "underlined", type_: settingTypeString},
		{name: "heading style type mismatch", key: formatHeadingStyleKey, value: HeadingStyleATX, type_: settingTypeBool},
		{name: "missing remote policy", key: contentRemotePolicyKey, omit: true},
		{name: "unsupported remote policy", key: contentRemotePolicyKey, value: "sometimes", type_: settingTypeString},
		{name: "remote policy type mismatch", key: contentRemotePolicyKey, value: RemotePolicyBlock, type_: settingTypeBool},
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
				if err := database.Queries.UpsertSetting(ctx, store.UpsertSettingParams{
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
		for _, key := range []string{formatBulletMarkerKey, formatEmphasisKey, formatHeadingStyleKey} {
			if err := database.Queries.UpsertSetting(ctx, store.UpsertSettingParams{
				Key: key, Value: "", Type: settingTypeString,
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

// Proves: STORY-009-AC-5
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
	if err := repository.upsertBool(ctx, futureLineNumbersKey, true); err != nil {
		t.Fatalf("persist future typed scalar: %v", err)
	}
	gotFuture, err := repository.getBool(ctx, futureLineNumbersKey, false)
	if err != nil {
		t.Fatalf("read future typed scalar: %v", err)
	}
	if !gotFuture {
		t.Fatal("future typed scalar = false, want true")
	}
	storedFuture, err := database.Queries.GetSetting(ctx, futureLineNumbersKey)
	if err != nil {
		t.Fatalf("read future KV row: %v", err)
	}
	if storedFuture.Value != "true" || storedFuture.Type != settingTypeBool {
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

// Proves: STORY-005-AC-2
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
	}
	if err := repository.UpdateAppearance(ctx, want.Appearance); err != nil {
		database.Close()
		t.Fatalf("update appearance: %v", err)
	}
	if err := repository.UpdateMarkdown(ctx, want.Markdown); err != nil {
		database.Close()
		t.Fatalf("update markdown: %v", err)
	}
	if err := repository.UpdateContentPrivacy(ctx, want.ContentPrivacy); err != nil {
		database.Close()
		t.Fatalf("update content privacy: %v", err)
	}
	for key, value := range map[string]string{
		appearanceThemeKey:     want.Appearance.Theme,
		appearanceModeKey:      want.Appearance.Mode,
		markdownStandardKey:    want.Markdown.Standard,
		contentRemotePolicyKey: want.ContentPrivacy.RemotePolicy,
	} {
		stored, getErr := database.Queries.GetSetting(ctx, key)
		if getErr != nil {
			database.Close()
			t.Fatalf("read typed dotted key %q: %v", key, getErr)
		}
		if stored.Value != value || stored.Type != settingTypeString {
			database.Close()
			t.Fatalf("stored %q = %+v, want value %q and type %q", key, stored, value, settingTypeString)
		}
	}
	if err := database.Queries.UpsertSetting(ctx, store.UpsertSettingParams{
		Key: "future.editor.tabSize", Value: "4", Type: "int",
	}); err != nil {
		database.Close()
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
	future, err := reopened.Queries.GetSetting(ctx, "future.editor.tabSize")
	if err != nil {
		t.Fatalf("read future scalar after reopen: %v", err)
	}
	if future.Value != "4" || future.Type != "int" {
		t.Fatalf("future scalar after reopen = %+v, want value 4 and type int", future)
	}
}

// Proves: STORY-005-AC-3
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
				seedStoredSettings(t, database, settingTypeString, map[string]string{
					appearanceThemeKey:     "vaporwave",
					appearanceModeKey:      "midnight",
					markdownStandardKey:    "plain-text",
					contentRemotePolicyKey: "sometimes",
				})
			},
		},
		{
			name: "wrong type",
			seed: func(t *testing.T, database *db.Database) {
				seedStoredSettings(t, database, "bool", map[string]string{
					appearanceThemeKey:     ThemeMinimal,
					appearanceModeKey:      ModeDark,
					markdownStandardKey:    MarkdownFull,
					contentRemotePolicyKey: RemotePolicyAllow,
				})
			},
		},
		{
			name: "unsupported type",
			seed: func(t *testing.T, database *db.Database) {
				seedStoredSettings(t, database, "future-enum", map[string]string{
					appearanceThemeKey:     ThemeLiquidGlass,
					appearanceModeKey:      ModeLight,
					markdownStandardKey:    MarkdownMinimal,
					contentRemotePolicyKey: RemotePolicyBlock,
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
	got := apperr.Settings{Appearance: appearance, Markdown: markdown, ContentPrivacy: contentPrivacy}
	if got != want {
		t.Fatalf("repository settings = %+v, want %+v", got, want)
	}
}

func seedStoredSettings(t *testing.T, database *db.Database, settingType string, values map[string]string) {
	t.Helper()

	for key, value := range values {
		if err := database.Queries.UpsertSetting(context.Background(), store.UpsertSettingParams{
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
		if err := database.Queries.UpsertSetting(ctx, setting); err != nil {
			t.Fatalf("seed complete setting %q: %v", setting.Key, err)
		}
	}
}

func settingsKVRows(settings apperr.Settings) []store.UpsertSettingParams {
	return []store.UpsertSettingParams{
		{Key: appearanceThemeKey, Value: settings.Appearance.Theme, Type: settingTypeString},
		{Key: appearanceModeKey, Value: settings.Appearance.Mode, Type: settingTypeString},
		{Key: defaultOpenModeKey, Value: settings.Appearance.DefaultOpenMode, Type: settingTypeString},
		{Key: markdownStandardKey, Value: settings.Markdown.Standard, Type: settingTypeString},
		{Key: formatOnSaveKey, Value: boolString(settings.Markdown.FormatOnSave), Type: settingTypeBool},
		{Key: lintOnSaveKey, Value: boolString(settings.Markdown.LintOnSave), Type: settingTypeBool},
		{Key: formatBulletMarkerKey, Value: settings.Markdown.BulletMarker, Type: settingTypeString},
		{Key: formatEmphasisKey, Value: settings.Markdown.EmphasisMarker, Type: settingTypeString},
		{Key: formatHeadingStyleKey, Value: settings.Markdown.HeadingStyle, Type: settingTypeString},
		{Key: contentRemotePolicyKey, Value: settings.ContentPrivacy.RemotePolicy, Type: settingTypeString},
	}
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
	case appearanceThemeKey:
		settings.Appearance.Theme = value
	case appearanceModeKey:
		settings.Appearance.Mode = value
	case defaultOpenModeKey:
		settings.Appearance.DefaultOpenMode = value
	case markdownStandardKey:
		settings.Markdown.Standard = value
	case formatOnSaveKey:
		settings.Markdown.FormatOnSave = value == "true"
	case lintOnSaveKey:
		settings.Markdown.LintOnSave = value == "true"
	case formatBulletMarkerKey:
		settings.Markdown.BulletMarker = value
	case formatEmphasisKey:
		settings.Markdown.EmphasisMarker = value
	case formatHeadingStyleKey:
		settings.Markdown.HeadingStyle = value
	case contentRemotePolicyKey:
		settings.ContentPrivacy.RemotePolicy = value
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
