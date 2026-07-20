package application

import (
	"context"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"testing"

	"github.com/sanyokkua/go_mark_edit/internal/apperr"
	"github.com/sanyokkua/go_mark_edit/internal/file"
	"github.com/sanyokkua/go_mark_edit/internal/logging"
	"github.com/sanyokkua/go_mark_edit/internal/settings"
)

// Proves: STORY-005-AC-4
// The composition root starts settings without persistence, then Init opens temporary SQLite, injects it, and exposes defaults through the bound handler.
func TestApplicationContextInitializesSettingsInTwoPhases(t *testing.T) {
	logger, err := logging.NewLogger(filepath.Join(t.TempDir(), "logs"), true)
	if err != nil {
		t.Fatalf("create temporary application logger: %v", err)
	}
	t.Cleanup(func() {
		if closeErr := logger.Close(); closeErr != nil {
			t.Errorf("close temporary application logger: %v", closeErr)
		}
	})

	paths := &fakeFileUtils{databasePath: filepath.Join(t.TempDir(), "settings.db")}
	holder := NewApplicationContextHolder(paths, logger)
	if holder.SettingsService == nil || holder.SettingsHandler == nil {
		t.Fatal("phase-one composition must create settings service and handler")
	}
	if holder.DB != nil {
		t.Fatal("phase-one composition must not open persistence")
	}
	beforeInit := holder.SettingsHandler.GetSettings()
	if beforeInit.Data != nil || beforeInit.Error == nil || beforeInit.Error.Code != apperr.CodeUnsupported {
		t.Fatalf("phase-one handler result = %+v, want unsupported error without data", beforeInit)
	}

	startupContext := context.WithValue(context.Background(), applicationContextKey{}, "startup")
	holder.SetContext(startupContext)
	if err := holder.Init(startupContext); err != nil {
		t.Fatalf("phase-two Init: %v", err)
	}
	t.Cleanup(func() {
		if closeErr := holder.Close(); closeErr != nil {
			t.Errorf("close application database: %v", closeErr)
		}
	})
	if holder.DB == nil {
		t.Fatal("phase-two Init did not retain the opened database")
	}
	if paths.databasePathCalls != 1 {
		t.Fatalf("database path calls = %d, want 1", paths.databasePathCalls)
	}

	afterInit := holder.SettingsHandler.GetSettings()
	if afterInit.Error != nil {
		t.Fatalf("handler after Init returned error = %+v", afterInit.Error)
	}
	if afterInit.Data == nil || *afterInit.Data != settings.DefaultSettings() {
		t.Fatalf("handler after Init data = %+v, want documented defaults %+v", afterInit.Data, settings.DefaultSettings())
	}

	t.Run("main binding and generated TypeScript surface expose the handler", func(t *testing.T) {
		_, sourceFile, _, ok := runtime.Caller(0)
		if !ok {
			t.Fatal("locate application test source")
		}
		repositoryRoot := filepath.Clean(filepath.Join(filepath.Dir(sourceFile), "..", ".."))
		mainSource, err := os.ReadFile(filepath.Join(repositoryRoot, "main.go"))
		if err != nil {
			t.Fatalf("read main binding source: %v", err)
		}
		if !strings.Contains(string(mainSource), "Bind:     []interface{}{applicationContext.SettingsHandler}") {
			t.Fatal("main does not bind the settings handler")
		}

		bindings, err := os.ReadFile(filepath.Join(repositoryRoot, "frontend", "wailsjs", "go", "settings", "SettingsHandler.d.ts"))
		if err != nil {
			t.Fatalf("read generated settings bindings: %v", err)
		}
		for _, method := range []string{"GetSettings", "UpdateAppearance", "UpdateMarkdown", "UpdateContentPrivacy"} {
			if !strings.Contains(string(bindings), method) {
				t.Errorf("generated settings bindings omit %s", method)
			}
		}
	})
}

type applicationContextKey struct{}

type fakeFileUtils struct {
	databasePath      string
	databasePathCalls int
}

func (utils *fakeFileUtils) GetAppConfigDir() (string, error) {
	return filepath.Dir(utils.databasePath), nil
}

func (utils *fakeFileUtils) GetAppLogsDir() (string, error) {
	return filepath.Join(filepath.Dir(utils.databasePath), "logs"), nil
}

func (utils *fakeFileUtils) GetAppDatabaseFilePath() (string, error) {
	utils.databasePathCalls++
	return utils.databasePath, nil
}

var _ file.FileUtilsServiceAPI = (*fakeFileUtils)(nil)
