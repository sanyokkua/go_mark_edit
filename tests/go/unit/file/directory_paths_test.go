package file_test

import (
	"errors"
	"os"
	"path/filepath"
	"testing"

	. "github.com/sanyokkua/go_mark_edit/internal/file"
)

func TestCanonicalizeDirectoryPathResolvesDirectoryAliasesAndRejectsFiles(t *testing.T) {
	root := t.TempDir()
	workspace := filepath.Join(root, "Workspace")
	if err := os.Mkdir(workspace, 0o755); err != nil {
		t.Fatalf("create workspace: %v", err)
	}
	t.Run("resolves directory aliases", func(t *testing.T) {
		link := filepath.Join(root, "workspace-link")
		if err := os.Symlink(workspace, link); err != nil {
			t.Skipf("OS cannot create required directory symlink fixture: %v", err)
		}

		canonical, err := CanonicalizeDirectoryPath(link)
		if err != nil {
			t.Fatalf("canonicalize directory symlink: %v", err)
		}
		want, err := filepath.EvalSymlinks(workspace)
		if err != nil {
			t.Fatalf("resolve expected directory: %v", err)
		}
		if canonical != want {
			t.Fatalf("canonical directory = %q, want %q", canonical, want)
		}
	})

	t.Run("rejects files and reports missing paths", func(t *testing.T) {
		filePath := filepath.Join(root, "notes.md")
		if err := os.WriteFile(filePath, []byte("note"), 0o600); err != nil {
			t.Fatalf("write regular file: %v", err)
		}
		if _, err := CanonicalizeDirectoryPath(filePath); err == nil {
			t.Fatal("regular file was accepted as a directory")
		}

		missing := filepath.Join(root, "missing")
		if _, err := CanonicalizeDirectoryPath(missing); !errors.Is(err, os.ErrNotExist) {
			t.Fatalf("missing directory error = %v, want not-exist", err)
		}
	})
}
