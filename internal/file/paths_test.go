package file

import (
	"path/filepath"
	"runtime"
	"testing"
)

// Proves: STORY-003-AC-2
// Development and production use separate configuration, log, and database paths below an injected temporary root.
func TestResolvePathsSeparatesDevelopmentFromProduction(t *testing.T) {
	userRoot := t.TempDir()
	t.Setenv("HOME", userRoot)
	t.Setenv("XDG_CONFIG_HOME", userRoot)
	t.Setenv("APPDATA", userRoot)
	configRoot := userRoot
	if runtime.GOOS == "darwin" {
		configRoot = filepath.Join(userRoot, "Library", "Application Support")
	}

	cases := []struct {
		name    string
		isDev   bool
		appName string
	}{
		{name: "production", isDev: false, appName: productionAppName},
		{name: "development", isDev: true, appName: developmentAppName},
	}

	resolvedConfigDirs := make(map[string]string, len(cases))
	for _, tt := range cases {
		t.Run(tt.name, func(t *testing.T) {
			service := NewFileUtilsService(tt.isDev)
			configDir, err := service.GetAppConfigDir()
			if err != nil {
				t.Fatalf("resolve config directory: %v", err)
			}
			logsDir, err := service.GetAppLogsDir()
			if err != nil {
				t.Fatalf("resolve logs directory: %v", err)
			}
			databasePath, err := service.GetAppDatabaseFilePath()
			if err != nil {
				t.Fatalf("resolve database path: %v", err)
			}

			wantConfigDir := filepath.Join(configRoot, tt.appName)
			if configDir != wantConfigDir {
				t.Fatalf("config directory = %q, want %q", configDir, wantConfigDir)
			}
			if logsDir != filepath.Join(wantConfigDir, "logs") {
				t.Fatalf("logs directory = %q, want %q", logsDir, filepath.Join(wantConfigDir, "logs"))
			}
			if databasePath != filepath.Join(wantConfigDir, settingsDatabase) {
				t.Fatalf("database path = %q, want %q", databasePath, filepath.Join(wantConfigDir, settingsDatabase))
			}
			resolvedConfigDirs[tt.name] = configDir
		})
	}
	if resolvedConfigDirs["development"] == resolvedConfigDirs["production"] {
		t.Fatalf("development and production config directories must differ: %q", resolvedConfigDirs["development"])
	}
}
