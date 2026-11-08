package settings_test

import (
	"context"
	"path/filepath"
	"testing"

	"github.com/sanyokkua/go_mark_edit/internal/db"
	"github.com/sanyokkua/go_mark_edit/internal/kv"
	"github.com/sanyokkua/go_mark_edit/internal/settings"
)

func openModeDatabase(t *testing.T) (*db.Database, context.Context) {
	t.Helper()
	ctx := context.Background()
	database, err := db.Open(ctx, filepath.Join(t.TempDir(), "settings.db"))
	if err != nil {
		t.Fatalf("open database: %v", err)
	}
	t.Cleanup(func() { _ = database.Close() })
	return database, ctx
}

func seedString(t *testing.T, database *db.Database, ctx context.Context, key, value string) {
	t.Helper()
	if err := kv.New(database.DB).Upsert(ctx, kv.KVEntry{Key: key, Value: value, Type: "string"}); err != nil {
		t.Fatalf("seed %s: %v", key, err)
	}
}

func readOpenMode(t *testing.T, database *db.Database, ctx context.Context) string {
	t.Helper()
	got, err := settings.NewSettingsService(settings.NewSqliteSettingsRepository(database)).Get(ctx)
	if err != nil {
		t.Fatalf("read settings: %v", err)
	}
	return got.Appearance.OpenMode
}

func TestOpenModeMigratesFromTheLegacyDefaultOpenModeKey(t *testing.T) {
	for _, testCase := range []struct {
		name   string
		keys   map[string]string
		wanted string
	}{
		{name: "nothing stored", keys: nil, wanted: settings.OpenModeLast},
		{name: "legacy viewer becomes reading", keys: map[string]string{"view.defaultOpenMode": "viewer"}, wanted: settings.OpenModeReading},
		{name: "legacy editor becomes last", keys: map[string]string{"view.defaultOpenMode": "editor"}, wanted: settings.OpenModeLast},
		{name: "unknown legacy value becomes last", keys: map[string]string{"view.defaultOpenMode": "split"}, wanted: settings.OpenModeLast},
		{name: "new key beats legacy", keys: map[string]string{"view.defaultOpenMode": "viewer", "view.openMode": "preview"}, wanted: settings.OpenModePreview},
		{name: "invalid new key is last even with a legacy value", keys: map[string]string{"view.defaultOpenMode": "viewer", "view.openMode": "viewer"}, wanted: settings.OpenModeLast},
	} {
		t.Run(testCase.name, func(t *testing.T) {
			database, ctx := openModeDatabase(t)
			for key, value := range testCase.keys {
				seedString(t, database, ctx, key, value)
			}
			if got := readOpenMode(t, database, ctx); got != testCase.wanted {
				t.Fatalf("open mode = %q, want %q", got, testCase.wanted)
			}
		})
	}
}

func TestEveryOpenModePersistsUnderTheNewKeyAndLeavesTheLegacyKey(t *testing.T) {
	for _, mode := range []string{settings.OpenModeReading, settings.OpenModeEditor, settings.OpenModeSplit, settings.OpenModePreview, settings.OpenModeLast} {
		t.Run(mode, func(t *testing.T) {
			database, ctx := openModeDatabase(t)
			seedString(t, database, ctx, "view.defaultOpenMode", "viewer")
			appearance := settings.DefaultSettings().Appearance
			appearance.OpenMode = mode
			service := settings.NewSettingsService(settings.NewSqliteSettingsRepository(database))
			if err := service.UpdateAppearance(ctx, appearance); err != nil {
				t.Fatalf("update: %v", err)
			}
			stored, err := readKVSetting(database, ctx, "view.openMode")
			if err != nil || stored.Value != mode || stored.Type != "string" {
				t.Fatalf("view.openMode = %+v (%v), want %q string", stored, err, mode)
			}
			legacy, err := readKVSetting(database, ctx, "view.defaultOpenMode")
			if err != nil || legacy.Value != "viewer" {
				t.Fatalf("legacy key = %+v (%v), want it left in place", legacy, err)
			}
			if got := readOpenMode(t, database, ctx); got != mode {
				t.Fatalf("open mode after write = %q, want %q (legacy must be ignored)", got, mode)
			}
		})
	}
}

func TestInvalidOpenModeWriteStoresNothing(t *testing.T) {
	database, ctx := openModeDatabase(t)
	appearance := settings.DefaultSettings().Appearance
	appearance.OpenMode = "viewer"
	err := settings.NewSettingsService(settings.NewSqliteSettingsRepository(database)).UpdateAppearance(ctx, appearance)
	if err == nil {
		t.Fatal("update with an invalid open mode succeeded")
	}
	if _, readErr := readKVSetting(database, ctx, "view.openMode"); readErr == nil {
		t.Fatal("view.openMode was stored by a refused write")
	}
}

func TestResetAppearanceRestoresLastOverALegacyViewer(t *testing.T) {
	database, ctx := openModeDatabase(t)
	seedString(t, database, ctx, "view.defaultOpenMode", "viewer")
	service := settings.NewSettingsService(settings.NewSqliteSettingsRepository(database))
	if err := service.ResetAppearance(ctx); err != nil {
		t.Fatalf("reset: %v", err)
	}
	if got := readOpenMode(t, database, ctx); got != settings.OpenModeLast {
		t.Fatalf("open mode after reset = %q, want last", got)
	}
}
