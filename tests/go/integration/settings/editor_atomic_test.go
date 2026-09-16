package settings_test

import (
	"context"
	"path/filepath"
	"testing"

	"github.com/sanyokkua/go_mark_edit/internal/apperr"
	"github.com/sanyokkua/go_mark_edit/internal/db"
	"github.com/sanyokkua/go_mark_edit/internal/settings"
)

// A failure on the final key rolls back every field UpdateEditor writes in the
// same transaction, including the synchronized-scrolling choice.
func TestEditorUpdateRollsBackEveryFieldWhenTheLastKeyFails(t *testing.T) {
	ctx := context.Background()
	path := filepath.Join(t.TempDir(), "settings.db")
	database, err := db.Open(ctx, path)
	if err != nil {
		t.Fatalf("open database: %v", err)
	}

	old := apperr.EditorSettings{LineNumbers: true, WordWrap: false, ScrollSync: false, FontSize: settings.EditorFontSizeMedium}
	newValue := apperr.EditorSettings{LineNumbers: false, WordWrap: true, ScrollSync: true, FontSize: settings.EditorFontSizeLarge}
	repository := settings.NewSqliteSettingsRepository(database)
	if err := repository.UpdateEditor(ctx, old); err != nil {
		_ = database.Close()
		t.Fatalf("seed editor settings: %v", err)
	}
	if _, err := database.DB.ExecContext(ctx, `
		CREATE TRIGGER reject_editor_font_size_update
		BEFORE UPDATE ON settings
		WHEN NEW.key = 'editor.fontSize'
		BEGIN
			SELECT RAISE(ABORT, 'forced last-key failure');
		END`); err != nil {
		_ = database.Close()
		t.Fatalf("install failure trigger: %v", err)
	}
	if err := repository.UpdateEditor(ctx, newValue); err == nil {
		_ = database.Close()
		t.Fatal("editor update succeeded despite the last-key trigger")
	}
	if err := database.Close(); err != nil {
		t.Fatalf("close database after failed update: %v", err)
	}

	reopened, err := db.Open(ctx, path)
	if err != nil {
		t.Fatalf("reopen database: %v", err)
	}
	t.Cleanup(func() {
		if closeErr := reopened.Close(); closeErr != nil {
			t.Errorf("close reopened database: %v", closeErr)
		}
	})
	got, err := settings.NewSqliteSettingsRepository(reopened).GetEditor(ctx)
	if err != nil {
		t.Fatalf("read editor settings after rollback: %v", err)
	}
	if got != old {
		t.Fatalf("editor settings after rollback = %+v, want %+v", got, old)
	}
}
