package file

import (
	"os"
	"path/filepath"
	"runtime"
	"strings"
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

func TestCanonicalizeDocumentPath(t *testing.T) {
	root := t.TempDir()
	caseDir := filepath.Join(root, "CaseSensitive")
	if err := os.MkdirAll(caseDir, 0o755); err != nil {
		t.Fatalf("create case-sensitive directory: %v", err)
	}
	target := filepath.Join(caseDir, "Report.MD")
	if err := os.WriteFile(target, []byte("# report\n"), 0o640); err != nil {
		t.Fatalf("write target: %v", err)
	}
	alias := filepath.Join(root, "alias.md")
	if err := os.Symlink(target, alias); err != nil {
		t.Fatalf("create alias: %v", err)
	}

	canonical, err := CanonicalizeDocumentPath(alias)
	if err != nil {
		t.Fatalf("canonicalize alias: %v", err)
	}
	wantPath, err := filepath.EvalSymlinks(target)
	if err != nil {
		t.Fatalf("resolve expected path: %v", err)
	}
	if canonical.Path != wantPath {
		t.Fatalf("canonical path = %q, want %q", canonical.Path, wantPath)
	}
	if canonical.Identity == "" {
		t.Fatal("canonical identity must be filesystem-aware or path-backed")
	}
	if canonical.DisplayName != "Report.MD" {
		t.Fatalf("display name = %q, want %q", canonical.DisplayName, "Report.MD")
	}
	if canonical.ParentName != "CaseSensitive" {
		t.Fatalf("parent name = %q, want %q", canonical.ParentName, "CaseSensitive")
	}
	if !strings.Contains(canonical.Path, "CaseSensitive") {
		t.Fatalf("canonical path lost the original path case: %q", canonical.Path)
	}

	for _, suffix := range []string{".md", ".MD", ".markdown", ".MARKDOWN", ".mdown", ".txt", ".TXT"} {
		if !IsSupportedDocumentSuffix("report" + suffix) {
			t.Errorf("suffix %q should be supported", suffix)
		}
	}
	for _, suffix := range []string{"", ".rst", ".pdf", ".mdx"} {
		if IsSupportedDocumentSuffix("report" + suffix) {
			t.Errorf("suffix %q should be unsupported", suffix)
		}
	}

	unsafeName := "bad-\x01-\x7f-\u202e.md"
	unsafePath := filepath.Join(root, unsafeName)
	if err := os.WriteFile(unsafePath, []byte("unsafe\n"), 0o644); err != nil {
		t.Fatalf("write hostile-name file: %v", err)
	}
	unsafeCanonical, err := CanonicalizeDocumentPath(unsafePath)
	if err != nil {
		t.Fatalf("canonicalize hostile name: %v", err)
	}
	if strings.ContainsAny(unsafeCanonical.DisplayName, "\x00\x01\x1f\x7f\u202e") {
		t.Fatalf("unsafe display name contains an unescaped control or bidi character: %q", unsafeCanonical.DisplayName)
	}
	if !strings.Contains(unsafeCanonical.DisplayName, `\u0001`) || !strings.Contains(unsafeCanonical.DisplayName, `\u202E`) {
		t.Fatalf("unsafe display name did not retain visible escapes: %q", unsafeCanonical.DisplayName)
	}
}
