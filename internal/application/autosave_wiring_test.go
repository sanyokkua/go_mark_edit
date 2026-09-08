package application

import (
	"context"
	"path/filepath"
	"testing"

	"github.com/sanyokkua/go_mark_edit/internal/apperr"
	"github.com/sanyokkua/go_mark_edit/internal/settings"
)

// The defect the 2026-08-14 walkthrough found was not in the autosave scheduler,
// which honours its flag correctly, and not in the settings persistence, which
// stored the preference correctly. It was the absent join between them:
// SetAutosaveEnabled had zero production callers, so the preference reached the
// database and the status bar but never the scheduler.
//
// These tests cover that join at the composition root, which is the only place
// that holds both services.

func TestUpdateFilePropagatesAutosavePreferenceToDocumentModel(t *testing.T) {
	holder := NewApplicationContextHolder(nil, nil)
	holder.SettingsService.SetRepository(&stubAutosaveSettingsRepository{autosave: true})

	if !holder.AppModelService.AutosaveEnabled() {
		t.Fatal("autosave starts disabled, want the documented default of enabled")
	}

	if err := holder.SettingsService.UpdateFile(context.Background(), apperr.FileSettings{Autosave: false}); err != nil {
		t.Fatalf("UpdateFile(false): %v", err)
	}
	if holder.AppModelService.AutosaveEnabled() {
		t.Fatal("document model still autosaving after the preference was turned off")
	}

	if err := holder.SettingsService.UpdateFile(context.Background(), apperr.FileSettings{Autosave: true}); err != nil {
		t.Fatalf("UpdateFile(true): %v", err)
	}
	if !holder.AppModelService.AutosaveEnabled() {
		t.Fatal("document model still not autosaving after the preference was turned back on")
	}
}

// A preference that only survives until the next launch is not a preference.
//
// This goes through the real Init and real SQLite rather than calling the
// startup helper directly, because a helper nothing calls is the same defect
// class as the one being fixed: turn autosave off in one process, and the next
// process must come up with it off.
func TestPersistedAutosavePreferenceSurvivesRestart(t *testing.T) {
	databasePath := filepath.Join(t.TempDir(), "settings.db")
	ctx := context.Background()

	first := NewApplicationContextHolder(&fakeFileUtils{databasePath: databasePath}, nil)
	if err := first.Init(ctx); err != nil {
		t.Fatalf("first Init: %v", err)
	}
	if !first.AppModelService.AutosaveEnabled() {
		t.Fatal("first launch started with autosave off, want the documented default of on")
	}
	if err := first.SettingsService.UpdateFile(ctx, apperr.FileSettings{Autosave: false}); err != nil {
		t.Fatalf("persist autosave=false: %v", err)
	}
	if first.AppModelService.AutosaveEnabled() {
		t.Fatal("document model still autosaving in the process that turned it off")
	}
	if first.DB != nil {
		if err := first.DB.Close(); err != nil {
			t.Fatalf("close first database: %v", err)
		}
	}

	second := NewApplicationContextHolder(&fakeFileUtils{databasePath: databasePath}, nil)
	if err := second.Init(ctx); err != nil {
		t.Fatalf("second Init: %v", err)
	}
	defer func() {
		if second.DB != nil {
			_ = second.DB.Close()
		}
	}()

	if second.AppModelService.AutosaveEnabled() {
		t.Fatal("autosave came back on at the next launch despite a stored preference of false")
	}
}

func TestStartupLeavesAutosaveEnabledWhenTheStoreCannotBeRead(t *testing.T) {
	holder := NewApplicationContextHolder(nil, nil)
	// No repository injected: Get fails. Startup must not silently disable
	// autosave on an unreadable store — the documented default is enabled.
	holder.applyPersistedAutosavePreference(context.Background())

	if !holder.AppModelService.AutosaveEnabled() {
		t.Fatal("an unreadable settings store disabled autosave, want the default preserved")
	}
}

type stubAutosaveSettingsRepository struct {
	autosave bool
}

func (repository *stubAutosaveSettingsRepository) GetAppearance(context.Context) (apperr.AppearanceSettings, error) {
	return apperr.AppearanceSettings{}, nil
}

func (repository *stubAutosaveSettingsRepository) UpdateAppearance(context.Context, apperr.AppearanceSettings) error {
	return nil
}

func (repository *stubAutosaveSettingsRepository) ResetAppearance(context.Context) error {
	return nil
}

func (repository *stubAutosaveSettingsRepository) GetMarkdown(context.Context) (apperr.MarkdownSettings, error) {
	return apperr.MarkdownSettings{}, nil
}

func (repository *stubAutosaveSettingsRepository) UpdateMarkdown(context.Context, apperr.MarkdownSettings) error {
	return nil
}

func (repository *stubAutosaveSettingsRepository) GetContentPrivacy(context.Context) (apperr.ContentPrivacySettings, error) {
	return apperr.ContentPrivacySettings{}, nil
}

func (repository *stubAutosaveSettingsRepository) UpdateContentPrivacy(context.Context, apperr.ContentPrivacySettings) error {
	return nil
}

func (repository *stubAutosaveSettingsRepository) GetEditor(context.Context) (apperr.EditorSettings, error) {
	return apperr.EditorSettings{}, nil
}

func (repository *stubAutosaveSettingsRepository) UpdateEditor(context.Context, apperr.EditorSettings) error {
	return nil
}

func (repository *stubAutosaveSettingsRepository) GetFile(context.Context) (apperr.FileSettings, error) {
	return apperr.FileSettings{Autosave: repository.autosave}, nil
}

func (repository *stubAutosaveSettingsRepository) UpdateFile(_ context.Context, fileSettings apperr.FileSettings) error {
	repository.autosave = fileSettings.Autosave
	return nil
}

var _ settings.SettingsRepositoryAPI = (*stubAutosaveSettingsRepository)(nil)
