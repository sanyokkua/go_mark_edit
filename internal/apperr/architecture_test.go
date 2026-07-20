package apperr

import (
	"go/ast"
	"go/parser"
	"go/token"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// Proves: STORY-002-AC-3
// The bottom-of-graph apperr package imports no package under this application's internal tree.
func TestApperrHasNoInternalDependencies(t *testing.T) {
	t.Parallel()

	entries, err := os.ReadDir(".")
	if err != nil {
		t.Fatalf("read apperr package directory: %v", err)
	}
	for _, entry := range entries {
		if entry.IsDir() || !strings.HasSuffix(entry.Name(), ".go") || strings.HasSuffix(entry.Name(), "_test.go") {
			continue
		}
		path := filepath.Join(".", entry.Name())
		file, parseErr := parser.ParseFile(token.NewFileSet(), path, nil, parser.ImportsOnly)
		if parseErr != nil {
			t.Fatalf("parse imports in %s: %v", path, parseErr)
		}
		for _, importSpec := range file.Imports {
			assertNotInternalImport(t, path, importSpec)
		}
	}
}

func assertNotInternalImport(t *testing.T, sourcePath string, importSpec *ast.ImportSpec) {
	t.Helper()
	importPath := strings.Trim(importSpec.Path.Value, `\"`)
	if strings.HasPrefix(importPath, "github.com/sanyokkua/go_mark_edit/internal/") {
		t.Fatalf("%s imports internal package %q", sourcePath, importPath)
	}
}
