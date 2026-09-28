// Package workspace builds the filtered filesystem tree shown for an open folder.
package workspace

import (
	"fmt"
	"io/fs"
	"os"
	"path/filepath"
	"sort"
	"strings"

	"github.com/sanyokkua/go_mark_edit/internal/file"
)

// Node is one supported file or traversable folder in a workspace tree.
type Node struct {
	Path       string
	Name       string
	IsDir      bool
	Unreadable bool
	Children   []Node
}

// Snapshot is the complete filtered tree produced by Build.
type Snapshot struct {
	RootPath     string
	Root         Node
	TotalEntries int
	Truncated    bool
}

// Build walks root in os.ReadDir order and returns a filtered, presentation-
// sorted tree. The root counts as one entry and is always included. A zero or
// negative bound cannot contain that required root and is rejected.
func Build(root string, maxEntries int, showHiddenFolders bool) (Snapshot, error) {
	if maxEntries < 1 {
		return Snapshot{}, fmt.Errorf("workspace entry limit must include the root")
	}
	absolute, err := filepath.Abs(root)
	if err != nil {
		return Snapshot{}, fmt.Errorf("resolve workspace root: %w", err)
	}
	absolute = filepath.Clean(absolute)
	rootInfo, err := os.Stat(absolute)
	if err != nil {
		return Snapshot{}, fmt.Errorf("inspect workspace root: %w", err)
	}
	if !rootInfo.IsDir() {
		return Snapshot{}, fmt.Errorf("workspace root is not a directory: %w", file.ErrNotDirectory)
	}

	rootNode := Node{Path: absolute, Name: filepath.Base(absolute), IsDir: true}
	if rootNode.Name == "." || rootNode.Name == string(filepath.Separator) {
		rootNode.Name = string(filepath.Separator)
	}
	builder := treeBuilder{
		maxEntries:        maxEntries,
		totalEntries:      1,
		showHiddenFolders: showHiddenFolders,
	}
	if err := builder.readDirectory(&rootNode, true); err != nil {
		return Snapshot{}, err
	}
	return Snapshot{
		RootPath:     absolute,
		Root:         rootNode,
		TotalEntries: builder.totalEntries,
		Truncated:    builder.truncated,
	}, nil
}

type treeBuilder struct {
	maxEntries        int
	totalEntries      int
	truncated         bool
	stopped           bool
	showHiddenFolders bool
}

func (builder *treeBuilder) readDirectory(node *Node, isRoot bool) error {
	entries, err := os.ReadDir(node.Path)
	if err != nil {
		if isRoot {
			return fmt.Errorf("read workspace root: %w", err)
		}
		node.Unreadable = true
		return nil
	}

	children := make([]Node, 0, len(entries))
	defer func() {
		sortChildren(children)
		node.Children = children
	}()
	for _, entry := range entries {
		if builder.stopped {
			return nil
		}
		child, include := builder.includedChild(node.Path, entry)
		if !include {
			continue
		}
		if builder.totalEntries == builder.maxEntries {
			builder.truncated = true
			builder.stopped = true
			return nil
		}
		builder.totalEntries++
		if child.IsDir && !child.Unreadable {
			if err := builder.readDirectory(&child, false); err != nil {
				return err
			}
		}
		children = append(children, child)
	}
	return nil
}

func (builder *treeBuilder) includedChild(parent string, entry os.DirEntry) (Node, bool) {
	name := entry.Name()
	if name == "" || name == "." || name == ".." || entry.Type()&fs.ModeSymlink != 0 {
		return Node{}, false
	}
	info, err := entry.Info()
	if err != nil {
		if entry.IsDir() && (builder.showHiddenFolders || !strings.HasPrefix(name, ".")) {
			return Node{Path: filepath.Join(parent, name), Name: name, IsDir: true, Unreadable: true}, true
		}
		return Node{}, false
	}
	mode := info.Mode()
	if mode&fs.ModeSymlink != 0 {
		return Node{}, false
	}
	path := filepath.Join(parent, name)
	if mode.IsDir() {
		if strings.HasPrefix(name, ".") && !builder.showHiddenFolders {
			return Node{}, false
		}
		return Node{Path: path, Name: name, IsDir: true}, true
	}
	if !mode.IsRegular() || strings.HasPrefix(name, ".") || !file.IsSupportedDocumentSuffix(name) {
		return Node{}, false
	}
	return Node{Path: path, Name: name}, true
}

func sortChildren(children []Node) {
	sort.Slice(children, func(left, right int) bool {
		if children[left].IsDir != children[right].IsDir {
			return children[left].IsDir
		}
		leftLower := strings.ToLower(children[left].Name)
		rightLower := strings.ToLower(children[right].Name)
		if leftLower != rightLower {
			return leftLower < rightLower
		}
		return children[left].Name < children[right].Name
	})
}
