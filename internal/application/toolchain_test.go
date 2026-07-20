package application

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// Proves: STORY-008-AC-1
// The Justfile exposes every documented developer command, including the staged quality and trace gates.
func TestJustfileExposesRequiredCommandTaxonomy(t *testing.T) {
	t.Parallel()

	repositoryRoot := storyEightRepositoryRoot(t)
	contents, err := os.ReadFile(filepath.Join(repositoryRoot, "justfile"))
	if err != nil {
		t.Fatalf("read justfile: %v", err)
	}
	justfile := string(contents)

	for _, recipe := range []string{
		"setup", "dev", "dev-ui", "build", "gen", "fmt", "fmt-check", "lint", "typecheck", "test",
		"verify-ui", "gen-check", "sqlc-check", "vuln", "trace", "trace-check", "check",
	} {
		if !strings.Contains(justfile, "\n"+recipe+":") && !strings.HasPrefix(justfile, recipe+":") {
			t.Errorf("justfile omits %q recipe", recipe)
		}
	}

	golangci, err := os.ReadFile(filepath.Join(repositoryRoot, ".golangci.yml"))
	if err != nil {
		t.Fatalf("read .golangci.yml: %v", err)
	}
	if !strings.Contains(string(golangci), "staticcheck") {
		t.Error(".golangci.yml does not enable staticcheck")
	}
}

// Proves: STORY-008-AC-2
// Lefthook and the GitHub Actions skeleton run bindings, frontend gates, then Go gates in the required order.
func TestHooksAndCISkeletonPreserveBuildOrdering(t *testing.T) {
	t.Parallel()

	repositoryRoot := storyEightRepositoryRoot(t)
	paths := []string{
		"lefthook.yml",
		"scripts/hooks/pre-push-bindings.sh",
		"scripts/hooks/pre-push-frontend.sh",
		"scripts/hooks/pre-push-go.sh",
		".github/workflows/main.yml",
	}
	contents := make(map[string]string, len(paths))
	for _, path := range paths {
		fileContents, err := os.ReadFile(filepath.Join(repositoryRoot, path))
		if err != nil {
			t.Fatalf("read %s: %v", path, err)
		}
		contents[path] = string(fileContents)
	}

	for _, orderedStep := range []string{"01-bindings", "02-frontend", "03-go"} {
		if !strings.Contains(contents["lefthook.yml"], orderedStep) {
			t.Errorf("lefthook pre-push omits %s", orderedStep)
		}
	}
	bindingsIndex := strings.Index(contents["lefthook.yml"], "01-bindings")
	frontendIndex := strings.Index(contents["lefthook.yml"], "02-frontend")
	goIndex := strings.Index(contents["lefthook.yml"], "03-go")
	if bindingsIndex >= frontendIndex || frontendIndex >= goIndex {
		t.Error("lefthook does not preserve bindings -> frontend -> Go ordering")
	}

	for path, required := range map[string][]string{
		"scripts/hooks/pre-push-bindings.sh": {"wails generate module"},
		"scripts/hooks/pre-push-frontend.sh": {"npm --prefix frontend run build", "npm --prefix frontend run lint", "npm --prefix frontend run typecheck", "npm --prefix frontend test"},
		"scripts/hooks/pre-push-go.sh":       {"go vet ./...", "go test -race ./..."},
		".github/workflows/main.yml":         {"workflow_dispatch", "v*.*.*", "just gen", "just frontend-build", "just frontend-lint", "just typecheck", "just frontend-test", "just go-vet", "just go-test", "just trace-check"},
	} {
		for _, expected := range required {
			if !strings.Contains(contents[path], expected) {
				t.Errorf("%s omits %q", path, expected)
			}
		}
	}
	if strings.Contains(contents[".github/workflows/main.yml"], "node-version-file:") || !strings.Contains(contents[".github/workflows/main.yml"], "node-version: \"22\"") {
		t.Error("CI must select its supported Node version directly instead of referencing a missing version file")
	}
}
