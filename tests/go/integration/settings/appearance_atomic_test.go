package settings_test

import (
	"context"
	"path/filepath"
	"testing"

	"github.com/sanyokkua/go_mark_edit/internal/apperr"
	"github.com/sanyokkua/go_mark_edit/internal/db"
	"github.com/sanyokkua/go_mark_edit/internal/settings"
)

func TestAppearanceUpdateRollsBackEveryFieldWhenTheSecondUpdateFails(t *testing.T) {
	ctx := context.Background()
	path := filepath.Join(t.TempDir(), "settings.db")
	database, err := db.Open(ctx, path)
	if err != nil {
		t.Fatalf("open database: %v", err)
	}

	old := apperr.AppearanceSettings{Theme: settings.ThemeMinimal, Mode: settings.ModeDark, DefaultOpenMode: settings.OpenModeViewer}
	newValue := apperr.AppearanceSettings{Theme: settings.ThemeGlass, Mode: settings.ModeLight, DefaultOpenMode: settings.OpenModeEditor}
	repository := settings.NewSqliteSettingsRepository(database)
	if err := repository.UpdateAppearance(ctx, old); err != nil {
		_ = database.Close()
		t.Fatalf("seed appearance: %v", err)
	}
	if _, err := database.DB.ExecContext(ctx, `
		CREATE TRIGGER reject_second_appearance_update
		BEFORE UPDATE ON settings
		WHEN NEW.key = 'appearance.mode'
		BEGIN
			SELECT RAISE(ABORT, 'forced second-key failure');
		END`); err != nil {
		_ = database.Close()
		t.Fatalf("install failure trigger: %v", err)
	}
	if err := repository.UpdateAppearance(ctx, newValue); err == nil {
		_ = database.Close()
		t.Fatal("appearance update succeeded despite the second-key trigger")
	}
	if err := database.Close(); err != nil {
		t.Fatalf("close database after failed update: %v", err)
	}

	reopened, err := db.Open(ctx, path)
	if err != nil {
		t.Fatalf("reopen database: %v", err)
	}
	t.Cleanup(func() { _ = reopened.Close() })
	got, err := settings.NewSqliteSettingsRepository(reopened).GetAppearance(ctx)
	if err != nil {
		t.Fatalf("read appearance after rollback: %v", err)
	}
	if got != old {
		t.Fatalf("appearance after rollback = %+v, want %+v", got, old)
	}
}
