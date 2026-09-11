package archlint_test

import (
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"
)

func TestArchlintPassesInShallowCheckoutWithoutMigrationBaselineRef(t *testing.T) {
	root := testRepositoryRoot(t)
	source := filepath.Join(t.TempDir(), "source")
	if err := copyArchlintSources(root, source); err != nil {
		t.Fatalf("copy archlint source: %v", err)
	}
	writeTestFile(t, filepath.Join(source, "go.mod"), "module github.com/sanyokkua/go_mark_edit\n\ngo 1.25.7\n")

	runGit(t, source, "init", "--quiet")
	runGit(t, source, "config", "user.email", "archlint-test@example.invalid")
	runGit(t, source, "config", "user.name", "archlint test")
	runGit(t, source, "add", ".")
	runGit(t, source, "commit", "--quiet", "-m", "snapshot")

	checkout := filepath.Join(t.TempDir(), "checkout")
	runGit(t, "", "clone", "--quiet", "--depth", "1", "--no-local", "file://"+source, checkout)
	if result := exec.Command("git", "-C", checkout, "show-ref", "--verify", "--quiet", "refs/heads/app_version_1_codebase").Run(); result == nil {
		t.Fatal("shallow checkout unexpectedly contains app_version_1_codebase")
	}

	output, err := runArchlint(checkout)
	if err != nil {
		t.Fatalf("archlint failed without a migration baseline ref: %v\n%s", err, output)
	}
	if !strings.Contains(string(output), "archlint: ok") {
		t.Fatalf("archlint output = %q, want success", output)
	}
}

func TestArchlintStillReportsHandlerAndCallerlessExportViolations(t *testing.T) {
	root := t.TempDir()
	writeTestFile(t, filepath.Join(root, "go.mod"), "module example.com/archlint-fixture\n\ngo 1.25.7\n")
	writeTestFile(t, filepath.Join(root, "main.go"), `package main

type Application struct {
	Handler *Handler
}

var application = struct {
	Bind []any
}{Bind: []any{application.Handler}}
`)
	writeTestFile(t, filepath.Join(root, "internal/fixture/fixture.go"), `package fixture

type ApplicationContextHolder struct {
	Handler *Handler
}

type Handler struct{}

func (handler *Handler) Invalid() string {
	return "invalid"
}

func UnusedExport() {}
`)
	if err := copyFile(
		filepath.Join(testRepositoryRoot(t), "tools/archlint/main.go"),
		filepath.Join(root, "tools/archlint/main.go"),
	); err != nil {
		t.Fatalf("copy archlint command: %v", err)
	}

	output, err := runArchlint(root)
	if err == nil {
		t.Fatalf("archlint unexpectedly passed; output = %s", output)
	}
	if !strings.Contains(string(output), "archlint L4") {
		t.Fatalf("archlint output = %q, want an L4 handler violation", output)
	}
	if !strings.Contains(string(output), "archlint L6") {
		t.Fatalf("archlint output = %q, want an L6 callerless-export violation", output)
	}
}

func testRepositoryRoot(t *testing.T) string {
	t.Helper()
	output, err := exec.Command("git", "rev-parse", "--show-toplevel").Output()
	if err != nil {
		t.Fatalf("resolve repository root: %v", err)
	}
	return strings.TrimSpace(string(output))
}

func copyArchlintSources(root, destination string) error {
	for _, relative := range []string{"main.go", "internal", "tools"} {
		source := filepath.Join(root, relative)
		err := filepath.WalkDir(source, func(path string, entry os.DirEntry, err error) error {
			if err != nil {
				return err
			}
			if entry.IsDir() {
				return nil
			}
			if filepath.Ext(path) != ".go" && path != filepath.Join(root, "main.go") {
				return nil
			}
			relativePath, err := filepath.Rel(root, path)
			if err != nil {
				return err
			}
			data, err := os.ReadFile(path)
			if err != nil {
				return err
			}
			return writeTestFileResult(filepath.Join(destination, relativePath), data)
		})
		if err != nil {
			return err
		}
	}
	return nil
}

func copyFile(source, destination string) error {
	data, err := os.ReadFile(source)
	if err != nil {
		return err
	}
	return writeTestFileResult(destination, data)
}

func runArchlint(directory string) ([]byte, error) {
	command := exec.Command("go", "run", "./tools/archlint")
	command.Dir = directory
	command.Env = append(os.Environ(), "GOTOOLCHAIN=local")
	return command.CombinedOutput()
}

func writeTestFile(t *testing.T, path, content string) {
	t.Helper()
	if err := writeTestFileResult(path, []byte(content)); err != nil {
		t.Fatalf("write %s: %v", path, err)
	}
}

func writeTestFileResult(path string, content []byte) error {
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		return err
	}
	return os.WriteFile(path, content, 0o644)
}

func runGit(t *testing.T, directory string, arguments ...string) {
	t.Helper()
	command := exec.Command("git", arguments...)
	if directory != "" {
		command.Dir = directory
	}
	if output, err := command.CombinedOutput(); err != nil {
		t.Fatalf("git %s: %v\n%s", strings.Join(arguments, " "), err, output)
	}
}
