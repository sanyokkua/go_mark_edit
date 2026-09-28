//go:build darwin || linux

package file

import (
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"testing"

	. "github.com/sanyokkua/go_mark_edit/internal/file"
)

func TestPlatformRevealSelectsFilesAndFoldersOnMacAndOpensParentOnLinux(t *testing.T) {
	root := t.TempDir()
	folder := filepath.Join(root, "folder")
	if err := os.Mkdir(folder, 0755); err != nil {
		t.Fatal(err)
	}
	filePath := filepath.Join(folder, "note.md")
	if err := os.WriteFile(filePath, nil, 0644); err != nil {
		t.Fatal(err)
	}
	commands := t.TempDir()
	captured := filepath.Join(t.TempDir(), "reveal.txt")
	for _, name := range []string{"open", "xdg-open"} {
		stub := "#!/bin/sh\n/bin/echo " + name + " \"$@\" > \"" + captured + "\"\n"
		if err := os.WriteFile(filepath.Join(commands, name), []byte(stub), 0755); err != nil {
			t.Fatal(err)
		}
	}
	t.Setenv("PATH", commands)
	for _, path := range []string{root, folder, filePath} {
		if err := NewPlatformRevealPort().Reveal(path); err != nil {
			t.Fatalf("reveal %q: %v", path, err)
		}
		output, err := os.ReadFile(captured)
		if err != nil {
			t.Fatal(err)
		}
		want := "xdg-open " + filepath.Dir(path)
		if runtime.GOOS == "darwin" {
			want = "open -R " + path
		}
		if got := strings.TrimSpace(string(output)); got != want {
			t.Errorf("reveal %q ran %q, want %q", path, got, want)
		}
	}
}
