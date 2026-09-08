package application

import (
	"context"
	"path/filepath"
	"testing"

	"github.com/sanyokkua/go_mark_edit/internal/apperr"
	"github.com/sanyokkua/go_mark_edit/internal/appmodel"
	"github.com/sanyokkua/go_mark_edit/internal/settings"
)

// T104's defect verbatim, one setting over.
//
// SetDefaultOpenMode is correct and had zero production callers, no Wails
// binding and no frontend reference, so service.defaultOpenMode stayed pinned to
// OpenModeEditor for the process lifetime while openArrangement was its only
// reader. FR-FT-003 requires Open to apply the acknowledged default open mode
// first; the setting was persisted, validated and reset correctly and reached
// nothing.
//
// The contrast with autosave is exact: that fix added an observer plus a startup
// push of the stored value. Default open mode had neither, which is why these
// tests mirror autosave_wiring_test.go rather than inventing a shape.

func TestUpdateAppearancePropagatesDefaultOpenModeToDocumentModel(t *testing.T) {
	holder := NewApplicationContextHolder(nil, nil)
	holder.SettingsService.SetRepository(&stubOpenModeSettingsRepository{defaultOpenMode: settings.OpenModeEditor})

	if holder.AppModelService.DefaultOpenMode() != appmodel.OpenModeEditor {
		t.Fatalf("default open mode starts at %q, want the documented default of editor", holder.AppModelService.DefaultOpenMode())
	}

	appearance := apperr.AppearanceSettings{Theme: "material", Mode: "auto", DefaultOpenMode: settings.OpenModeViewer}
	if err := holder.SettingsService.UpdateAppearance(context.Background(), appearance); err != nil {
		t.Fatalf("UpdateAppearance(viewer): %v", err)
	}
	if holder.AppModelService.DefaultOpenMode() != appmodel.OpenModeViewer {
		t.Fatalf("document model default open mode = %q after persisting viewer, want viewer", holder.AppModelService.DefaultOpenMode())
	}

	appearance.DefaultOpenMode = settings.OpenModeEditor
	if err := holder.SettingsService.UpdateAppearance(context.Background(), appearance); err != nil {
		t.Fatalf("UpdateAppearance(editor): %v", err)
	}
	if holder.AppModelService.DefaultOpenMode() != appmodel.OpenModeEditor {
		t.Fatalf("document model default open mode = %q after persisting editor, want editor", holder.AppModelService.DefaultOpenMode())
	}
}

func TestResetAppearanceReturnsTheDocumentModelToEditor(t *testing.T) {
	// A reset that leaves the document model on the old value is the same class
	// of gap as no observer at all: the store and the model disagree, and only
	// the store is visible in the interface.
	holder := NewApplicationContextHolder(nil, nil)
	holder.SettingsService.SetRepository(&stubOpenModeSettingsRepository{defaultOpenMode: settings.OpenModeViewer})
	holder.AppModelService.SetDefaultOpenMode(appmodel.OpenModeViewer)

	if err := holder.SettingsService.ResetAppearance(context.Background()); err != nil {
		t.Fatalf("ResetAppearance: %v", err)
	}
	if holder.AppModelService.DefaultOpenMode() != appmodel.OpenModeEditor {
		t.Fatalf("document model default open mode = %q after a reset, want editor", holder.AppModelService.DefaultOpenMode())
	}
}

// The test that actually proves the defect.
//
// The observer alone only fires when the user changes the setting, so a stored
// preference of Reading would silently come back as Editor at every launch.
// This goes through the real Init and real SQLite rather than calling the
// startup helper directly, because a helper nothing calls is the same defect
// class as the one being fixed.
func TestPersistedDefaultOpenModeSurvivesRestart(t *testing.T) {
	databasePath := filepath.Join(t.TempDir(), "settings.db")
	ctx := context.Background()

	first := NewApplicationContextHolder(&fakeFileUtils{databasePath: databasePath}, nil)
	if err := first.Init(ctx); err != nil {
		t.Fatalf("first Init: %v", err)
	}
	if first.AppModelService.DefaultOpenMode() != appmodel.OpenModeEditor {
		t.Fatalf("first launch started at %q, want the documented default of editor", first.AppModelService.DefaultOpenMode())
	}
	stored, err := first.SettingsService.Get(ctx)
	if err != nil {
		t.Fatalf("read settings: %v", err)
	}
	appearance := stored.Appearance
	appearance.DefaultOpenMode = settings.OpenModeViewer
	if err := first.SettingsService.UpdateAppearance(ctx, appearance); err != nil {
		t.Fatalf("persist defaultOpenMode=viewer: %v", err)
	}
	if first.AppModelService.DefaultOpenMode() != appmodel.OpenModeViewer {
		t.Fatal("document model still on editor in the process that chose Reading")
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

	if second.AppModelService.DefaultOpenMode() != appmodel.OpenModeViewer {
		t.Fatalf("default open mode came back as %q at the next launch despite a stored preference of viewer", second.AppModelService.DefaultOpenMode())
	}
}

func TestStartupLeavesDefaultOpenModeAtEditorWhenTheStoreCannotBeRead(t *testing.T) {
	holder := NewApplicationContextHolder(nil, nil)
	// No repository injected: Get fails. An unreadable store is not a reason to
	// change behaviour — the documented default stands.
	holder.applyPersistedDefaultOpenMode(context.Background())

	if holder.AppModelService.DefaultOpenMode() != appmodel.OpenModeEditor {
		t.Fatalf("an unreadable settings store left the default open mode at %q, want editor", holder.AppModelService.DefaultOpenMode())
	}
}

type stubOpenModeSettingsRepository struct {
	defaultOpenMode string
}

func (repository *stubOpenModeSettingsRepository) GetAppearance(context.Context) (apperr.AppearanceSettings, error) {
	return apperr.AppearanceSettings{Theme: "material", Mode: "auto", DefaultOpenMode: repository.defaultOpenMode}, nil
}

func (repository *stubOpenModeSettingsRepository) UpdateAppearance(_ context.Context, appearance apperr.AppearanceSettings) error {
	repository.defaultOpenMode = appearance.DefaultOpenMode
	return nil
}

func (repository *stubOpenModeSettingsRepository) ResetAppearance(context.Context) error {
	repository.defaultOpenMode = settings.OpenModeEditor
	return nil
}

func (repository *stubOpenModeSettingsRepository) GetMarkdown(context.Context) (apperr.MarkdownSettings, error) {
	return apperr.MarkdownSettings{}, nil
}

func (repository *stubOpenModeSettingsRepository) UpdateMarkdown(context.Context, apperr.MarkdownSettings) error {
	return nil
}

func (repository *stubOpenModeSettingsRepository) GetContentPrivacy(context.Context) (apperr.ContentPrivacySettings, error) {
	return apperr.ContentPrivacySettings{}, nil
}

func (repository *stubOpenModeSettingsRepository) UpdateContentPrivacy(context.Context, apperr.ContentPrivacySettings) error {
	return nil
}

func (repository *stubOpenModeSettingsRepository) GetEditor(context.Context) (apperr.EditorSettings, error) {
	return apperr.EditorSettings{}, nil
}

func (repository *stubOpenModeSettingsRepository) UpdateEditor(context.Context, apperr.EditorSettings) error {
	return nil
}

func (repository *stubOpenModeSettingsRepository) GetFile(context.Context) (apperr.FileSettings, error) {
	return apperr.FileSettings{Autosave: true}, nil
}

func (repository *stubOpenModeSettingsRepository) UpdateFile(context.Context, apperr.FileSettings) error {
	return nil
}

var _ settings.SettingsRepositoryAPI = (*stubOpenModeSettingsRepository)(nil)
