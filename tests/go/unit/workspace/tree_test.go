package workspace_test

import (
	"os"
	"path/filepath"
	"reflect"
	"runtime"
	"testing"

	"github.com/sanyokkua/go_mark_edit/internal/workspace"
)

func TestBuildFiltersFilesAndHiddenFolders(t *testing.T) {
	root := t.TempDir()
	writeTreeFile(t, root, "NOTES.MD")
	writeTreeFile(t, root, "readme.png")
	writeTreeFile(t, root, ".draft.md")
	writeTreeFile(t, filepath.Join(root, ".obsidian"), "notes.md")

	visible, err := workspace.Build(root, 20, false)
	if err != nil {
		t.Fatalf("Build with hidden folders off: %v", err)
	}
	if got := workspaceChildNames(visible.Root.Children); !reflect.DeepEqual(got, []string{"NOTES.MD"}) {
		t.Fatalf("visible root children = %v, want only NOTES.MD", got)
	}
	if visible.TotalEntries != 2 {
		t.Fatalf("visible total entries = %d, want root plus one supported file", visible.TotalEntries)
	}

	hidden, err := workspace.Build(root, 20, true)
	if err != nil {
		t.Fatalf("Build with hidden folders on: %v", err)
	}
	if got := workspaceChildNames(hidden.Root.Children); !reflect.DeepEqual(got, []string{".obsidian", "NOTES.MD"}) {
		t.Fatalf("hidden root children = %v, want .obsidian and NOTES.MD", got)
	}
	if got := workspaceChildNames(hidden.Root.Children[0].Children); !reflect.DeepEqual(got, []string{"notes.md"}) {
		t.Fatalf("shown hidden folder children = %v, want notes.md", got)
	}
	if hidden.TotalEntries != 4 {
		t.Fatalf("hidden total entries = %d, want root, folder, and both supported files", hidden.TotalEntries)
	}
}

func TestBuildOrdersFoldersThenFilesWithStableCaseTieBreak(t *testing.T) {
	root := t.TempDir()
	for _, directory := range []string{"zeta", "beta"} {
		if err := os.Mkdir(filepath.Join(root, directory), 0o755); err != nil {
			t.Fatalf("create directory %q: %v", directory, err)
		}
	}
	caseSensitiveNames := true
	if err := os.Mkdir(filepath.Join(root, "Beta"), 0o755); err != nil {
		if !os.IsExist(err) {
			t.Fatalf("create case-variant directory: %v", err)
		}
		caseSensitiveNames = false
	}
	for _, name := range []string{"zulu.txt", "alpha.md", "NOTES.MD"} {
		writeTreeFile(t, root, name)
	}
	if caseSensitiveNames {
		writeTreeFile(t, root, "Alpha.md")
	}

	snapshot, err := workspace.Build(root, 20, false)
	if err != nil {
		t.Fatalf("Build: %v", err)
	}
	want := []string{"beta", "zeta", "alpha.md", "NOTES.MD", "zulu.txt"}
	if caseSensitiveNames {
		want = []string{"Beta", "beta", "zeta", "Alpha.md", "alpha.md", "NOTES.MD", "zulu.txt"}
	}
	if got := workspaceChildNames(snapshot.Root.Children); !reflect.DeepEqual(got, want) {
		t.Fatalf("ordered children = %v, want %v", got, want)
	}
}

func TestBuildSkipsSymbolicLinksAndTerminatesCycles(t *testing.T) {
	root := t.TempDir()
	targetFile := filepath.Join(root, "target.md")
	writeTreeFile(t, root, "target.md")
	targetDirectory := filepath.Join(root, "target-directory")
	if err := os.Mkdir(targetDirectory, 0o755); err != nil {
		t.Fatalf("create target directory: %v", err)
	}
	writeTreeFile(t, targetDirectory, "nested.md")

	for _, link := range []struct{ target, name string }{
		{targetFile, filepath.Join(root, "file-link.md")},
		{targetDirectory, filepath.Join(root, "directory-link")},
		{root, filepath.Join(targetDirectory, "cycle")},
	} {
		if err := os.Symlink(link.target, link.name); err != nil {
			t.Skipf("OS cannot create required symbolic link fixture: %v", err)
		}
	}

	snapshot, err := workspace.Build(root, 20, true)
	if err != nil {
		t.Fatalf("Build with symlink cycle: %v", err)
	}
	if got := workspaceChildNames(snapshot.Root.Children); !reflect.DeepEqual(got, []string{"target-directory", "target.md"}) {
		t.Fatalf("root children = %v, want only real directory and file", got)
	}
	if got := workspaceChildNames(snapshot.Root.Children[0].Children); !reflect.DeepEqual(got, []string{"nested.md"}) {
		t.Fatalf("directory children = %v, want nested.md without cycle", got)
	}
}

func TestBuildMarksUnreadableSubtreeAndRejectsUnreadableRoot(t *testing.T) {
	root := t.TempDir()
	readable := filepath.Join(root, "readable")
	blocked := filepath.Join(root, "blocked")
	if err := os.Mkdir(readable, 0o755); err != nil {
		t.Fatalf("create readable directory: %v", err)
	}
	if err := os.Mkdir(blocked, 0o755); err != nil {
		t.Fatalf("create blocked directory: %v", err)
	}
	writeTreeFile(t, readable, "visible.md")
	writeTreeFile(t, blocked, "hidden-behind-permission.md")
	if err := os.Chmod(blocked, 0); err != nil {
		t.Fatalf("remove blocked directory permissions: %v", err)
	}
	t.Cleanup(func() { _ = os.Chmod(blocked, 0o755) })
	if _, err := os.ReadDir(blocked); err == nil {
		if runtime.GOOS == "windows" {
			t.Skip("OS does not enforce unreadable directory permissions")
		}
		t.Skip("filesystem does not enforce unreadable directory permissions")
	}

	snapshot, err := workspace.Build(root, 20, false)
	if err != nil {
		t.Fatalf("Build with unreadable subdirectory: %v", err)
	}
	blockedNode := snapshot.Root.Children[0]
	if !blockedNode.Unreadable || len(blockedNode.Children) != 0 {
		t.Fatalf("blocked node = %+v, want unreadable with no children", blockedNode)
	}
	if got := workspaceChildNames(snapshot.Root.Children[1].Children); !reflect.DeepEqual(got, []string{"visible.md"}) {
		t.Fatalf("readable sibling children = %v, want visible.md", got)
	}

	if err := os.Chmod(root, 0); err != nil {
		t.Fatalf("remove root permissions: %v", err)
	}
	t.Cleanup(func() { _ = os.Chmod(root, 0o755) })
	if _, err := os.ReadDir(root); err == nil {
		t.Skip("filesystem does not enforce unreadable root permissions")
	}
	if _, err := workspace.Build(root, 20, false); err == nil {
		t.Fatal("Build accepted an unreadable root")
	}
}

func TestBuildCountsRootAndStopsAtFirstEntryPastLimit(t *testing.T) {
	root := t.TempDir()
	writeTreeFile(t, root, "a.md")
	writeTreeFile(t, root, "b.md")

	complete, err := workspace.Build(root, 3, false)
	if err != nil {
		t.Fatalf("Build at exact limit: %v", err)
	}
	if complete.TotalEntries != 3 || complete.Truncated {
		t.Fatalf("exact limit snapshot = total %d, truncated %t; want 3 and false", complete.TotalEntries, complete.Truncated)
	}

	limited, err := workspace.Build(root, 2, false)
	if err != nil {
		t.Fatalf("Build over limit: %v", err)
	}
	if limited.TotalEntries != 2 || !limited.Truncated {
		t.Fatalf("over-limit snapshot = total %d, truncated %t; want 2 and true", limited.TotalEntries, limited.Truncated)
	}
	if got := workspaceChildNames(limited.Root.Children); !reflect.DeepEqual(got, []string{"a.md"}) {
		t.Fatalf("children after limit = %v, want only a.md", got)
	}
}

func writeTreeFile(t *testing.T, directory, name string) {
	t.Helper()
	if err := os.MkdirAll(directory, 0o755); err != nil {
		t.Fatalf("create directory %q: %v", directory, err)
	}
	if err := os.WriteFile(filepath.Join(directory, name), []byte("note"), 0o600); err != nil {
		t.Fatalf("write file %q: %v", name, err)
	}
}

func workspaceChildNames(nodes []workspace.Node) []string {
	names := make([]string, len(nodes))
	for index, node := range nodes {
		names[index] = node.Name
	}
	return names
}
