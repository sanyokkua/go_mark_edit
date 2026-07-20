package application

import (
	"go/ast"
	"go/parser"
	"go/token"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"testing"
)

// Proves: STORY-003-AC-4
// Story-003 scaffold sources and main import no network or single-instance-lock mechanism.
func TestScaffoldHasNoSingleInstanceOrNetworkPath(t *testing.T) {
	t.Parallel()

	repoRoot := storyThreeRepositoryRoot(t)
	for _, directory := range []string{
		"internal/bootstrap",
		"internal/logging",
		"internal/file",
		"internal/gate",
		"internal/application",
	} {
		entries, err := os.ReadDir(filepath.Join(repoRoot, directory))
		if err != nil {
			t.Fatalf("read Story-003 source directory %q: %v", directory, err)
		}
		for _, entry := range entries {
			if entry.IsDir() || !strings.HasSuffix(entry.Name(), ".go") || strings.HasSuffix(entry.Name(), "_test.go") {
				continue
			}
			assertNoNetworkOrSingleInstanceLock(t, filepath.Join(repoRoot, directory, entry.Name()))
		}
	}
	assertNoNetworkOrSingleInstanceLock(t, filepath.Join(repoRoot, "main.go"))
}

func storyThreeRepositoryRoot(t *testing.T) string {
	t.Helper()

	_, sourceFile, _, ok := runtime.Caller(0)
	if !ok {
		t.Fatal("locate architecture test source")
	}
	return filepath.Clean(filepath.Join(filepath.Dir(sourceFile), "..", ".."))
}

func assertNoNetworkOrSingleInstanceLock(t *testing.T, sourcePath string) {
	t.Helper()

	parsed, err := parser.ParseFile(token.NewFileSet(), sourcePath, nil, 0)
	if err != nil {
		t.Fatalf("parse %s: %v", sourcePath, err)
	}
	for _, importSpec := range parsed.Imports {
		importPath := strings.Trim(importSpec.Path.Value, `\"`)
		if importStartsNetworkOrLockPath(importPath) {
			t.Errorf("%s imports prohibited network or single-instance lock package %q", sourcePath, importPath)
		}
	}
	ast.Inspect(parsed, func(node ast.Node) bool {
		selector, ok := node.(*ast.SelectorExpr)
		if !ok || !isProhibitedNetworkOrLockSelector(selector) {
			return true
		}
		t.Errorf("%s uses prohibited network or single-instance lock selector %s.%s", sourcePath, selectorBase(selector), selector.Sel.Name)
		return true
	})
}

func importStartsNetworkOrLockPath(importPath string) bool {
	return importPath == "net" || strings.HasPrefix(importPath, "net/") ||
		strings.Contains(importPath, "flock") || strings.Contains(importPath, "lockfile") ||
		strings.Contains(importPath, "singleinstance")
}

func isProhibitedNetworkOrLockSelector(selector *ast.SelectorExpr) bool {
	base := selectorBase(selector)
	return (base == "net" && (selector.Sel.Name == "Dial" || selector.Sel.Name == "DialTimeout" || selector.Sel.Name == "Listen")) ||
		(base == "http" && (selector.Sel.Name == "Get" || selector.Sel.Name == "Post" || selector.Sel.Name == "ListenAndServe" || selector.Sel.Name == "ListenAndServeTLS")) ||
		((base == "syscall" || base == "unix") && selector.Sel.Name == "Flock") ||
		(base == "os" && selector.Sel.Name == "O_EXCL")
}

func selectorBase(selector *ast.SelectorExpr) string {
	identifier, _ := selector.X.(*ast.Ident)
	if identifier == nil {
		return ""
	}
	return identifier.Name
}
