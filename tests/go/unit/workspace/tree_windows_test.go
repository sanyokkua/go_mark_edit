//go:build windows

package workspace_test

import (
	"os"
	"os/exec"
	"path/filepath"
	"testing"

	"github.com/sanyokkua/go_mark_edit/internal/workspace"
)

func TestBuildSkipsWindowsDirectoryJunction(t *testing.T) {
	root := t.TempDir()
	target := filepath.Join(root, "target")
	if err := os.Mkdir(target, 0o755); err != nil {
		t.Fatalf("create target directory: %v", err)
	}
	writeTreeFile(t, target, "nested.md")
	junction := filepath.Join(root, "junction")
	output, err := exec.Command("cmd.exe", "/c", "mklink", "/J", junction, target).CombinedOutput()
	if err != nil {
		t.Skipf("OS cannot create required directory junction fixture: %v (%s)", err, output)
	}

	snapshot, err := workspace.Build(root, 20, true)
	if err != nil {
		t.Fatalf("Build with directory junction: %v", err)
	}
	for _, node := range snapshot.Root.Children {
		if node.Name == "junction" {
			t.Fatal("directory junction was included in the workspace tree")
		}
	}
}
