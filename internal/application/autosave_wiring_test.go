package application

import (
	"context"
	"os"
	"path/filepath"
	"sync"
	"testing"
	"time"

	"github.com/sanyokkua/go_mark_edit/internal/apperr"
	"github.com/sanyokkua/go_mark_edit/internal/appmodel"
	"github.com/sanyokkua/go_mark_edit/internal/file"
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
	clock := &wiringAutosaveClock{}
	holder := newAutosaveWiringHolder(nil, clock)
	holder.SettingsService.SetRepository(&stubAutosaveSettingsRepository{autosave: true})
	openAndEditAutosaveDocument(t, holder)
	if got := clock.pending(); got != 1 {
		t.Fatalf("initial autosave timers = %d, want one", got)
	}

	if err := holder.SettingsService.UpdateFile(context.Background(), apperr.FileSettings{Autosave: false}); err != nil {
		t.Fatalf("UpdateFile(false): %v", err)
	}
	if got := clock.pending(); got != 0 {
		t.Fatalf("autosave timers after disabling the preference = %d, want zero", got)
	}

	if err := holder.SettingsService.UpdateFile(context.Background(), apperr.FileSettings{Autosave: true}); err != nil {
		t.Fatalf("UpdateFile(true): %v", err)
	}
	openAndEditAutosaveDocument(t, holder)
	if got := clock.pending(); got != 1 {
		t.Fatalf("autosave timers after re-enabling the preference = %d, want one", got)
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

	firstClock := &wiringAutosaveClock{}
	first := newAutosaveWiringHolder(&fakeFileUtils{databasePath: databasePath}, firstClock)
	if err := first.Init(ctx); err != nil {
		t.Fatalf("first Init: %v", err)
	}
	openAndEditAutosaveDocument(t, first)
	if got := firstClock.pending(); got != 1 {
		t.Fatalf("first launch autosave timers = %d, want one", got)
	}
	if err := first.SettingsService.UpdateFile(ctx, apperr.FileSettings{Autosave: false}); err != nil {
		t.Fatalf("persist autosave=false: %v", err)
	}
	if got := firstClock.pending(); got != 0 {
		t.Fatalf("first process autosave timers after disabling = %d, want zero", got)
	}
	if first.DB != nil {
		if err := first.DB.Close(); err != nil {
			t.Fatalf("close first database: %v", err)
		}
	}

	secondClock := &wiringAutosaveClock{}
	second := newAutosaveWiringHolder(&fakeFileUtils{databasePath: databasePath}, secondClock)
	if err := second.Init(ctx); err != nil {
		t.Fatalf("second Init: %v", err)
	}
	defer func() {
		if second.DB != nil {
			_ = second.DB.Close()
		}
	}()

	openAndEditAutosaveDocument(t, second)
	if got := secondClock.pending(); got != 0 {
		t.Fatalf("second launch autosave timers = %d, want zero for the stored disabled preference", got)
	}
}

func TestStartupLeavesAutosaveEnabledWhenTheStoreCannotBeRead(t *testing.T) {
	clock := &wiringAutosaveClock{}
	holder := newAutosaveWiringHolder(nil, clock)
	// No repository injected: Get fails. Startup must not silently disable
	// autosave on an unreadable store — the documented default is enabled.
	holder.applyPersistedAutosavePreference(context.Background())
	openAndEditAutosaveDocument(t, holder)
	if got := clock.pending(); got != 1 {
		t.Fatalf("autosave timers after an unreadable settings store = %d, want one", got)
	}
}

func newAutosaveWiringHolder(fileService file.FileUtilsServiceAPI, clock *wiringAutosaveClock) *ApplicationContextHolder {
	return NewApplicationContextHolderWithOptions(fileService, nil, ApplicationContextOptions{
		AppModelOptions: []appmodel.AppModelOption{
			appmodel.WithEmitter(discardingLifecycleEmitter{}),
			appmodel.WithAutosaveTimer(clock),
		},
	})
}

func openAndEditAutosaveDocument(t *testing.T, holder *ApplicationContextHolder) {
	t.Helper()
	path := filepath.Join(t.TempDir(), "autosave.md")
	if err := os.WriteFile(path, []byte("base\n"), 0o644); err != nil {
		t.Fatalf("write autosave fixture: %v", err)
	}
	state, err := holder.AppModelService.GetState(context.Background())
	if err != nil {
		t.Fatalf("state before autosave fixture: %v", err)
	}
	opened := holder.AppModelService.OpenPath(context.Background(), path, state.Snapshot.TabSetRevision)
	if opened.Error != nil {
		t.Fatalf("OpenPath autosave fixture: %+v", opened)
	}
	if err := holder.AppModelService.UpdateBuffer(context.Background(), opened.DocumentID, "edited\n"); err != nil {
		t.Fatalf("edit autosave fixture: %v", err)
	}
}

type wiringAutosaveClock struct {
	mu     sync.Mutex
	timers []*wiringAutosaveTimer
}

type wiringAutosaveTimer struct {
	clock   *wiringAutosaveClock
	stopped bool
}

func (clock *wiringAutosaveClock) AfterFunc(_ time.Duration, _ func()) appmodel.AutosaveTimer {
	timer := &wiringAutosaveTimer{clock: clock}
	clock.mu.Lock()
	clock.timers = append(clock.timers, timer)
	clock.mu.Unlock()
	return timer
}

func (clock *wiringAutosaveClock) pending() int {
	clock.mu.Lock()
	defer clock.mu.Unlock()
	return len(clock.timers)
}

func (timer *wiringAutosaveTimer) Stop() bool {
	timer.clock.mu.Lock()
	defer timer.clock.mu.Unlock()
	if timer.stopped {
		return false
	}
	timer.stopped = true
	for index, candidate := range timer.clock.timers {
		if candidate == timer {
			timer.clock.timers = append(timer.clock.timers[:index], timer.clock.timers[index+1:]...)
			break
		}
	}
	return true
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
