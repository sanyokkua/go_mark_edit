package settings

import (
	"context"
	"path/filepath"
	"testing"

	"github.com/sanyokkua/go_mark_edit/internal/apperr"
	"github.com/sanyokkua/go_mark_edit/internal/db"
	"github.com/sanyokkua/go_mark_edit/internal/db/store"
)

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
