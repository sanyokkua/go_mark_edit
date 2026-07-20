package application

import (
	"os"
	"os/exec"
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
		"scripts/hooks/pre-push-bindings.sh": {"just gen-check"},
		"scripts/hooks/pre-push-frontend.sh": {"just frontend-build", "just frontend-format-check", "just frontend-lint", "just typecheck", "just frontend-test"},
		"scripts/hooks/pre-push-go.sh":       {"just go-format-check", "just go-lint", "just go-vet", "just go-test", "just trace-check"},
		".github/workflows/main.yml":         {"workflow_dispatch", "v*.*.*", "just gen-check", "just frontend-build", "just fmt-check", "just lint", "just typecheck", "just frontend-test", "just go-vet", "just go-test", "just trace-check"},
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

// Proves: STORY-010-AC-2
// The generation-drift recipe, binding hook, CI, and tracked bindings match Wails' generated output.
func TestWailsBindingsAreTrackedAndGenCheckIsClean(t *testing.T) {
	repositoryRoot := storyEightRepositoryRoot(t)
	justfile := readToolchainFile(t, repositoryRoot, "justfile")
	assertExactCommands(t, "gen-check", justRecipeCommands(t, justfile, "gen-check"), []string{
		"wails generate module",
		"git diff --exit-code -- frontend/wailsjs/",
	})

	bindingsHook := readToolchainFile(t, repositoryRoot, "scripts/hooks/pre-push-bindings.sh")
	assertExactCommands(t, "bindings pre-push hook", shellCommands(bindingsHook), []string{"just gen-check"})

	ci := readToolchainFile(t, repositoryRoot, ".github/workflows/main.yml")
	for _, expected := range []string{
		"just gen-check",
		"github.com/wailsapp/wails/v2/cmd/wails@v2.12.0",
		"github.com/golangci/golangci-lint/v2/cmd/golangci-lint@v2.12.2",
	} {
		if !strings.Contains(ci, expected) {
			t.Errorf("CI omits %q", expected)
		}
	}

	command := exec.Command("git", "ls-files", "--stage", "frontend/wailsjs")
	command.Dir = repositoryRoot
	output, err := command.Output()
	if err != nil {
		t.Fatalf("list tracked Wails bindings: %v", err)
	}
	expectedBindings := map[string]bool{
		"frontend/wailsjs/go/models.ts":                     false,
		"frontend/wailsjs/go/settings/SettingsHandler.d.ts": false,
		"frontend/wailsjs/go/settings/SettingsHandler.js":   false,
		"frontend/wailsjs/runtime/package.json":             false,
		"frontend/wailsjs/runtime/runtime.d.ts":             false,
		"frontend/wailsjs/runtime/runtime.js":               false,
	}
	entries := strings.FieldsFunc(string(output), func(r rune) bool { return r == '\n' })
	if len(entries) == 0 {
		t.Fatal("no Wails bindings are tracked")
	}
	for _, entry := range entries {
		fields := strings.Fields(entry)
		if len(fields) != 4 {
			t.Errorf("invalid tracked Wails binding entry %q", entry)
			continue
		}
		if fields[0] != "100755" {
			t.Errorf("Wails binding mode = %q, want generated mode 100755", entry)
		}
		if _, required := expectedBindings[fields[3]]; required {
			expectedBindings[fields[3]] = true
		}
	}
	for path, found := range expectedBindings {
		if !found {
			t.Errorf("required Wails binding %q is not tracked", path)
		}
	}
}

// Proves: STORY-010-AC-3
// The Phase-00 composite gate runs generated-binding, frontend, then Go and trace gates in the required order.
func TestJustCheckRunsPhaseZeroGateSetInRequiredOrder(t *testing.T) {
	repositoryRoot := storyEightRepositoryRoot(t)
	justfile := readToolchainFile(t, repositoryRoot, "justfile")
	assertExactCommands(t, "check", justRecipeCommands(t, justfile, "check"), []string{
		"just gen-check",
		"just frontend-build",
		"just fmt-check",
		"just lint",
		"just typecheck",
		"just frontend-test",
		"just go-vet",
		"just go-test",
		"just trace-check",
	})
}

// Proves: STORY-010-AC-4
// Go lint is isolated from frontend dependencies while ordered pre-push hooks call focused shared gates.
func TestJustLintScopesGoToRootAndInternalWithoutFrontendResolution(t *testing.T) {
	repositoryRoot := storyEightRepositoryRoot(t)
	justfile := readToolchainFile(t, repositoryRoot, "justfile")
	assertExactCommands(t, "go-lint", justRecipeCommands(t, justfile, "go-lint"), []string{
		"golangci-lint run . ./internal/...",
	})
	if strings.Contains(justfile, "golangci-lint run ./...") {
		t.Error("justfile retains unscoped golangci-lint run ./... invocation")
	}
	assertExactCommands(t, "lint", justRecipeCommands(t, justfile, "lint"), []string{
		"just go-lint",
		"just frontend-lint",
	})

	for path, want := range map[string][]string{
		"scripts/hooks/pre-push-bindings.sh": {"just gen-check"},
		"scripts/hooks/pre-push-frontend.sh": {"just frontend-build", "just frontend-format-check", "just frontend-lint", "just typecheck", "just frontend-test"},
		"scripts/hooks/pre-push-go.sh":       {"just go-format-check", "just go-lint", "just go-vet", "just go-test", "just trace-check"},
	} {
		assertExactCommands(t, path, shellCommands(readToolchainFile(t, repositoryRoot, path)), want)
	}

	lefthook := readToolchainFile(t, repositoryRoot, "lefthook.yml")
	bindingsIndex := strings.Index(lefthook, "01-bindings")
	frontendIndex := strings.Index(lefthook, "02-frontend")
	goIndex := strings.Index(lefthook, "03-go")
	if bindingsIndex < 0 || frontendIndex < 0 || goIndex < 0 || bindingsIndex >= frontendIndex || frontendIndex >= goIndex {
		t.Error("lefthook must preserve bindings -> frontend -> Go ordering")
	}
}

func readToolchainFile(t *testing.T, repositoryRoot, relativePath string) string {
	t.Helper()

	contents, err := os.ReadFile(filepath.Join(repositoryRoot, relativePath))
	if err != nil {
		t.Fatalf("read %s: %v", relativePath, err)
	}
	return string(contents)
}

func justRecipeCommands(t *testing.T, justfile, recipe string) []string {
	t.Helper()

	lines := strings.Split(justfile, "\n")
	for index, line := range lines {
		if line != recipe+":" {
			continue
		}

		var commands []string
		for _, commandLine := range lines[index+1:] {
			if commandLine == "" || strings.HasPrefix(commandLine, "#") {
				continue
			}
			if !strings.HasPrefix(commandLine, " ") && !strings.HasPrefix(commandLine, "\t") {
				return commands
			}
			commands = append(commands, strings.TrimSpace(commandLine))
		}
		return commands
	}
	t.Fatalf("justfile omits %q recipe", recipe)
	return nil
}

func shellCommands(script string) []string {
	var commands []string
	for _, line := range strings.Split(script, "\n") {
		line = strings.TrimSpace(line)
		if line == "" || strings.HasPrefix(line, "#") || strings.HasPrefix(line, "#!") || strings.HasPrefix(line, "set ") {
			continue
		}
		commands = append(commands, line)
	}
	return commands
}

func assertExactCommands(t *testing.T, subject string, got, want []string) {
	t.Helper()
	if strings.Join(got, "\n") != strings.Join(want, "\n") {
		t.Fatalf("%s commands = %#v, want %#v", subject, got, want)
	}
}
