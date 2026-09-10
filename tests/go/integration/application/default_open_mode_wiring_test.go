package application_test

import (
	"context"
	"errors"
	. "github.com/sanyokkua/go_mark_edit/internal/application"
	"os"
	"path/filepath"
	"testing"

	"github.com/sanyokkua/go_mark_edit/internal/apperr"
	"github.com/sanyokkua/go_mark_edit/internal/appmodel"
	"github.com/sanyokkua/go_mark_edit/internal/settings"
)

// 's defect verbatim, one setting over.
//
// SetDefaultOpenMode is correct and had zero production callers, no Wails
// binding and no frontend reference, so service.defaultOpenMode stayed pinned to
// OpenModeEditor for the process lifetime while openArrangement was its only
// reader. requires Open to apply the acknowledged default open mode
// first; the setting was persisted, validated and reset correctly and reached
// nothing.
//
// The contrast with autosave is exact: that fix added an observer plus a startup
// push of the stored value. Default open mode had neither, which is why these
// tests mirror autosave_wiring_test.go rather than inventing a shape.

func TestUpdateAppearancePropagatesDefaultOpenModeToDocumentModel(t *testing.T) {
	holder := NewApplicationContextHolderWithOptions(&fakeFileUtils{databasePath: filepath.Join(t.TempDir(), "settings.db")}, nil, ApplicationContextOptions{
		AppModelOptions: []appmodel.AppModelOption{appmodel.WithEmitter(discardingLifecycleEmitter{})},
	})
	holder.SettingsService.SetRepository(&stubOpenModeSettingsRepository{defaultOpenMode: settings.OpenModeEditor})

	assertNextOpenArrangement(t, holder, appmodel.ArrangementSplit)

	appearance := apperr.AppearanceSettings{Theme: "material", Mode: "auto", DefaultOpenMode: settings.OpenModeViewer}
	if err := holder.SettingsService.UpdateAppearance(context.Background(), appearance); err != nil {
		t.Fatalf("UpdateAppearance(viewer): %v", err)
	}
	assertNextOpenArrangement(t, holder, appmodel.ArrangementPreview)

	appearance.DefaultOpenMode = settings.OpenModeEditor
	if err := holder.SettingsService.UpdateAppearance(context.Background(), appearance); err != nil {
		t.Fatalf("UpdateAppearance(editor): %v", err)
	}
	assertNextOpenArrangement(t, holder, appmodel.ArrangementSplit)
}

func TestResetAppearanceReturnsTheDocumentModelToEditor(t *testing.T) {
	// A reset that leaves the document model on the old value is the same class
	// of gap as no observer at all: the store and the model disagree, and only
	// the store is visible in the interface.
	holder := NewApplicationContextHolderWithOptions(nil, nil, ApplicationContextOptions{
		AppModelOptions: []appmodel.AppModelOption{appmodel.WithEmitter(discardingLifecycleEmitter{})},
	})
	holder.SettingsService.SetRepository(&stubOpenModeSettingsRepository{defaultOpenMode: settings.OpenModeViewer})
	holder.AppModelService.SetDefaultOpenMode(appmodel.OpenModeViewer)

	if err := holder.SettingsService.ResetAppearance(context.Background()); err != nil {
		t.Fatalf("ResetAppearance: %v", err)
	}
	assertNextOpenArrangement(t, holder, appmodel.ArrangementSplit)
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

	first := NewApplicationContextHolderWithOptions(&fakeFileUtils{databasePath: databasePath}, nil, ApplicationContextOptions{
		AppModelOptions: []appmodel.AppModelOption{appmodel.WithEmitter(discardingLifecycleEmitter{})},
	})
	if err := first.Init(ctx); err != nil {
		t.Fatalf("first Init: %v", err)
	}
	assertNextOpenArrangement(t, first, appmodel.ArrangementSplit)
	stored, err := first.SettingsService.Get(ctx)
	if err != nil {
		t.Fatalf("read settings: %v", err)
	}
	appearance := stored.Appearance
	appearance.DefaultOpenMode = settings.OpenModeViewer
	if err := first.SettingsService.UpdateAppearance(ctx, appearance); err != nil {
		t.Fatalf("persist defaultOpenMode=viewer: %v", err)
	}
	assertNextOpenArrangement(t, first, appmodel.ArrangementPreview)
	if first.DB != nil {
		if err := first.DB.Close(); err != nil {
			t.Fatalf("close first database: %v", err)
		}
	}

	second := NewApplicationContextHolderWithOptions(&fakeFileUtils{databasePath: databasePath}, nil, ApplicationContextOptions{
		AppModelOptions: []appmodel.AppModelOption{appmodel.WithEmitter(discardingLifecycleEmitter{})},
	})
	if err := second.Init(ctx); err != nil {
		t.Fatalf("second Init: %v", err)
	}
	defer func() {
		if second.DB != nil {
			_ = second.DB.Close()
		}
	}()

	assertNextOpenArrangement(t, second, appmodel.ArrangementPreview)
}

func TestStartupLeavesDefaultOpenModeAtEditorWhenTheStoreCannotBeRead(t *testing.T) {
	holder := NewApplicationContextHolderWithOptions(&fakeFileUtils{databasePath: filepath.Join(t.TempDir(), "settings.db")}, nil, ApplicationContextOptions{
		SettingsRepository: failingDefaultOpenModeSettingsRepository{},
		AppModelOptions:    []appmodel.AppModelOption{appmodel.WithEmitter(discardingLifecycleEmitter{})},
	})
	// No repository injected: Get fails. An unreadable store is not a reason to
	// change behaviour — the documented default stands.
	if err := holder.Init(context.Background()); err != nil {
		t.Fatalf("initialize with unreadable settings store: %v", err)
	}
	t.Cleanup(func() { _ = holder.Close() })

	assertNextOpenArrangement(t, holder, appmodel.ArrangementSplit)
}

type failingDefaultOpenModeSettingsRepository struct{}

func (failingDefaultOpenModeSettingsRepository) GetAppearance(context.Context) (apperr.AppearanceSettings, error) {
	return apperr.AppearanceSettings{}, errors.New("settings unavailable")
}
func (failingDefaultOpenModeSettingsRepository) GetMarkdown(context.Context) (apperr.MarkdownSettings, error) {
	return apperr.MarkdownSettings{}, errors.New("settings unavailable")
}
func (failingDefaultOpenModeSettingsRepository) GetContentPrivacy(context.Context) (apperr.ContentPrivacySettings, error) {
	return apperr.ContentPrivacySettings{}, errors.New("settings unavailable")
}
func (failingDefaultOpenModeSettingsRepository) GetEditor(context.Context) (apperr.EditorSettings, error) {
	return apperr.EditorSettings{}, errors.New("settings unavailable")
}
func (failingDefaultOpenModeSettingsRepository) GetFile(context.Context) (apperr.FileSettings, error) {
	return apperr.FileSettings{}, errors.New("settings unavailable")
}
func (failingDefaultOpenModeSettingsRepository) UpdateAppearance(context.Context, apperr.AppearanceSettings) error {
	return nil
}
func (failingDefaultOpenModeSettingsRepository) ResetAppearance(context.Context) error { return nil }
func (failingDefaultOpenModeSettingsRepository) UpdateMarkdown(context.Context, apperr.MarkdownSettings) error {
	return nil
}
func (failingDefaultOpenModeSettingsRepository) UpdateContentPrivacy(context.Context, apperr.ContentPrivacySettings) error {
	return nil
}
func (failingDefaultOpenModeSettingsRepository) UpdateEditor(context.Context, apperr.EditorSettings) error {
	return nil
}
func (failingDefaultOpenModeSettingsRepository) UpdateFile(context.Context, apperr.FileSettings) error {
	return nil
}

func assertNextOpenArrangement(t *testing.T, holder *ApplicationContextHolder, want string) {
	t.Helper()
	path := filepath.Join(t.TempDir(), "notes.md")
	if err := os.WriteFile(path, []byte("# notes\n"), 0o644); err != nil {
		t.Fatalf("write arrangement fixture: %v", err)
	}
	state, err := holder.AppModelService.GetState(context.Background())
	if err != nil {
		t.Fatalf("read state before arrangement check: %v", err)
	}
	opened := holder.AppModelService.OpenPath(context.Background(), path, state.Snapshot.TabSetRevision)
	if opened.Error != nil {
		t.Fatalf("OpenPath for arrangement check: %+v", opened)
	}
	state, err = holder.AppModelService.GetState(context.Background())
	if err != nil {
		t.Fatalf("read state after arrangement check: %v", err)
	}
	document := state.Snapshot.Documents[opened.DocumentID]
	if document.View.Arrangement != want {
		t.Fatalf("opened arrangement = %q, want %q", document.View.Arrangement, want)
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
