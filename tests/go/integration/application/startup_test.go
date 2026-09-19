package application_test

import (
	"context"
	"errors"
	"path/filepath"
	"sync"
	"testing"
	"time"

	"github.com/sanyokkua/go_mark_edit/internal/apperr"
	"github.com/sanyokkua/go_mark_edit/internal/application"
	"github.com/sanyokkua/go_mark_edit/internal/settings"
)

type startupFileUtils struct {
	databasePath string
}

func (utils *startupFileUtils) GetAppConfigDir() (string, error) {
	return filepath.Dir(utils.databasePath), nil
}

func (utils *startupFileUtils) GetAppLogsDir() (string, error) {
	return filepath.Join(filepath.Dir(utils.databasePath), "logs"), nil
}

func (utils *startupFileUtils) GetAppDatabaseFilePath() (string, error) {
	return utils.databasePath, nil
}

type startupSettingsRepository struct {
	mu              sync.Mutex
	active          int
	appearanceReads int
	failNext        bool
	maxActive       int
	release         chan struct{}
	started         chan struct{}
}

func (repository *startupSettingsRepository) GetAppearance(context.Context) (apperr.AppearanceSettings, error) {
	repository.mu.Lock()
	repository.appearanceReads++
	shouldFail := repository.failNext
	repository.failNext = false
	release := repository.release
	if release != nil {
		repository.active++
		if repository.active > repository.maxActive {
			repository.maxActive = repository.active
		}
		repository.started <- struct{}{}
	}
	repository.mu.Unlock()

	if release != nil {
		<-release
		repository.mu.Lock()
		repository.active--
		repository.mu.Unlock()
	}
	if shouldFail {
		return apperr.AppearanceSettings{}, errors.New("settings read failed")
	}
	return settings.DefaultSettings().Appearance, nil
}

func (repository *startupSettingsRepository) GetMarkdown(context.Context) (apperr.MarkdownSettings, error) {
	return settings.DefaultSettings().Markdown, nil
}

func (repository *startupSettingsRepository) GetContentPrivacy(context.Context) (apperr.ContentPrivacySettings, error) {
	return settings.DefaultSettings().ContentPrivacy, nil
}

func (repository *startupSettingsRepository) GetEditor(context.Context) (apperr.EditorSettings, error) {
	return settings.DefaultSettings().Editor, nil
}

func (repository *startupSettingsRepository) GetFile(context.Context) (apperr.FileSettings, error) {
	return settings.DefaultSettings().File, nil
}

func (*startupSettingsRepository) UpdateAppearance(context.Context, apperr.AppearanceSettings) error {
	return nil
}

func (*startupSettingsRepository) ResetAppearance(context.Context) error {
	return nil
}

func (*startupSettingsRepository) UpdateMarkdown(context.Context, apperr.MarkdownSettings) error {
	return nil
}

func (*startupSettingsRepository) UpdateContentPrivacy(context.Context, apperr.ContentPrivacySettings) error {
	return nil
}

func (*startupSettingsRepository) UpdateEditor(context.Context, apperr.EditorSettings) error {
	return nil
}

func (*startupSettingsRepository) UpdateFile(context.Context, apperr.FileSettings) error {
	return nil
}

func TestStartupRetryReadsSettingsAgainAfterAReadFailure(t *testing.T) {
	repository := &startupSettingsRepository{}
	holder := application.NewApplicationContextHolderWithOptions(
		&startupFileUtils{databasePath: filepath.Join(t.TempDir(), "settings.db")},
		nil,
		application.ApplicationContextOptions{SettingsRepository: repository},
	)
	if err := holder.Init(context.Background()); err != nil {
		t.Fatalf("initialize application: %v", err)
	}
	t.Cleanup(func() {
		if err := holder.Close(); err != nil {
			t.Errorf("close application: %v", err)
		}
	})

	repository.mu.Lock()
	initialReads := repository.appearanceReads
	repository.failNext = true
	repository.mu.Unlock()
	if err := holder.RetryStartup(context.Background()); err == nil {
		t.Fatal("first retry succeeded despite a settings read failure")
	}
	if err := holder.RetryStartup(context.Background()); err != nil {
		t.Fatalf("second retry: %v", err)
	}

	repository.mu.Lock()
	reads := repository.appearanceReads
	repository.mu.Unlock()
	if reads < initialReads+2 {
		t.Fatalf("settings appearance reads = %d, want at least %d", reads, initialReads+2)
	}
}

func TestConcurrentStartupRetriesRunOneAttemptAtATime(t *testing.T) {
	repository := &startupSettingsRepository{}
	holder := application.NewApplicationContextHolderWithOptions(
		&startupFileUtils{databasePath: filepath.Join(t.TempDir(), "settings.db")},
		nil,
		application.ApplicationContextOptions{SettingsRepository: repository},
	)
	if err := holder.Init(context.Background()); err != nil {
		t.Fatalf("initialize application: %v", err)
	}
	t.Cleanup(func() {
		if err := holder.Close(); err != nil {
			t.Errorf("close application: %v", err)
		}
	})

	repository.mu.Lock()
	repository.release = make(chan struct{})
	repository.started = make(chan struct{}, 1)
	repository.mu.Unlock()

	results := make(chan error, 2)
	for range 2 {
		go func() {
			results <- holder.RetryStartup(context.Background())
		}()
	}
	select {
	case <-repository.started:
	case <-time.After(2 * time.Second):
		t.Fatal("startup retry did not enter settings read")
	}
	select {
	case <-repository.started:
		t.Fatal("second startup retry entered while the first was blocked")
	case <-time.After(100 * time.Millisecond):
	}
	repository.mu.Lock()
	close(repository.release)
	repository.mu.Unlock()
	for range 2 {
		select {
		case err := <-results:
			if err != nil {
				t.Fatalf("startup retry: %v", err)
			}
		case <-time.After(2 * time.Second):
			t.Fatal("startup retry did not finish")
		}
	}

	repository.mu.Lock()
	maxActive := repository.maxActive
	repository.mu.Unlock()
	if maxActive != 1 {
		t.Fatalf("maximum concurrent startup attempts = %d, want 1", maxActive)
	}
}
