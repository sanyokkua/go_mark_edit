package file_test

import (
	. "github.com/sanyokkua/go_mark_edit/internal/file"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"testing"
	"time"
)

type windowsIdentityStat struct {
	VolumeSerialNumber uint32
	FileIndexHigh      uint32
	FileIndexLow       uint32
}

type syntheticFileInfo struct {
	sys any
}

func (info syntheticFileInfo) Name() string       { return "notes.md" }
func (info syntheticFileInfo) Size() int64        { return 1 }
func (info syntheticFileInfo) Mode() os.FileMode  { return 0o644 }
func (info syntheticFileInfo) ModTime() time.Time { return time.Unix(1, 0) }
func (info syntheticFileInfo) IsDir() bool        { return false }
func (info syntheticFileInfo) Sys() any           { return info.sys }

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
		{name: "production", isDev: false, appName: "GoMarkEdit"},
		{name: "development", isDev: true, appName: "GoMarkEdit-Dev"},
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
			if databasePath != filepath.Join(wantConfigDir, "settings.db") {
				t.Fatalf("database path = %q, want %q", databasePath, filepath.Join(wantConfigDir, "settings.db"))
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
	if canonical.Identity.IsZero() {
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
	// Windows forbids control characters in filenames, so exercise the
	// existing-file path only on platforms that can create this fixture.
	if runtime.GOOS != "windows" {
		if err := os.WriteFile(unsafePath, []byte("unsafe\n"), 0o644); err != nil {
			t.Fatalf("write hostile-name file: %v", err)
		}
		unsafeCanonical, err := CanonicalizeDocumentPath(unsafePath)
		if err != nil {
			t.Fatalf("canonicalize hostile name: %v", err)
		}
		assertEscapedHostileDisplayName(t, unsafeCanonical.DisplayName)
	}
	// Windows cannot use the hostile control-character filename as a candidate.
	if runtime.GOOS == "windows" {
		return
	}
	unsafeCandidate, err := CanonicalizeCandidateDocumentPath(unsafePath)
	if err != nil {
		t.Fatalf("canonicalize hostile candidate name: %v", err)
	}
	assertEscapedHostileDisplayName(t, unsafeCandidate.DisplayName)
}

func TestExistingPathIdentityUsesFilesystemObject(t *testing.T) {
	root := t.TempDir()
	original := filepath.Join(root, "original.md")
	link := filepath.Join(root, "hard-link.md")
	other := filepath.Join(root, "other.md")
	for _, path := range []string{original, other} {
		if err := os.WriteFile(path, []byte("same"), 0o644); err != nil {
			t.Fatal(err)
		}
	}
	if err := os.Link(original, link); err != nil {
		t.Fatalf("create hard link: %v", err)
	}
	first, err := CanonicalizeDocumentPath(original)
	if err != nil {
		t.Fatal(err)
	}
	linked, err := CanonicalizeCandidateDocumentPath(link)
	if err != nil {
		t.Fatal(err)
	}
	distinct, err := IdentityForExistingPath(other)
	if err != nil {
		t.Fatal(err)
	}
	if first.Identity.Path != "" || first.Identity.IsZero() || !first.Identity.Equal(linked.Identity) {
		t.Fatalf("hard-link identities: original=%+v linked=%+v", first.Identity, linked.Identity)
	}
	if first.Identity.Equal(distinct) {
		t.Fatalf("distinct files share identity: %+v", first.Identity)
	}
	alias := filepath.Join(root, "alias.md")
	if err := os.Symlink(original, alias); err == nil {
		viaAlias, err := IdentityForExistingPath(alias)
		if err != nil || !first.Identity.Equal(viaAlias) {
			t.Fatalf("symlink identity=%+v err=%v, want %+v", viaAlias, err, first.Identity)
		}
	}
	directory, err := IdentityForExistingPath(root)
	if err != nil || directory.IsZero() || directory.Path != "" {
		t.Fatalf("directory identity=%+v err=%v", directory, err)
	}
	again, err := IdentityForExistingPath(root)
	if err != nil || !directory.Equal(again) {
		t.Fatalf("directory identity changed: before=%+v after=%+v err=%v", directory, again, err)
	}
}

func assertEscapedHostileDisplayName(t *testing.T, displayName string) {
	t.Helper()
	if strings.ContainsAny(displayName, "\x00\x01\x1f\x7f\u202e") {
		t.Fatalf("unsafe display name contains an unescaped control or bidi character: %q", displayName)
	}
	if !strings.Contains(displayName, `\u0001`) || !strings.Contains(displayName, `\u202E`) {
		t.Fatalf("unsafe display name did not retain visible escapes: %q", displayName)
	}
}

func TestCandidatePathRejectsInspectionFailure(t *testing.T) {
	if _, err := CanonicalizeCandidateDocumentPath(filepath.Join(t.TempDir(), "invalid\x00.md")); err == nil {
		t.Fatal("invalid path inspection must fail rather than become a missing candidate")
	}
}
