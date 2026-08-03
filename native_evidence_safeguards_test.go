package main

import (
	"bytes"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
	"testing"
)

func TestNativeEvidenceDriverIsBuildTaggedAndReleaseExcluded(t *testing.T) {
	t.Parallel()

	repositoryRoot := repositoryRootForNativeEvidenceTest(t)
	tagged := runNativeEvidenceCommand(t, repositoryRoot, "go", "list", "-tags", "native_evidence", "-f", "{{.GoFiles}}", "./cmd/native-evidence")
	if !strings.Contains(tagged, "main_native_evidence.go") {
		t.Fatalf("tagged driver files = %q, want main_native_evidence.go", tagged)
	}
	taggedBinary := filepath.Join(t.TempDir(), "gomarkedit-native-evidence")
	runNativeEvidenceCommand(t, repositoryRoot, "go", "build", "-tags", "native_evidence,desktop,production", "-o", taggedBinary, "./cmd/native-evidence")

	releasePackages := runNativeEvidenceCommand(t, repositoryRoot, "go", "list", "-tags", "desktop,production", "-f", "{{.ImportPath}} {{.GoFiles}}", "./...")
	if strings.Contains(releasePackages, "cmd/native-evidence") || strings.Contains(releasePackages, "main_native_evidence.go") {
		t.Fatalf("release package graph contains native evidence driver:\n%s", releasePackages)
	}

	releaseBinary := filepath.Join(t.TempDir(), "gomarkedit-release")
	runNativeEvidenceCommand(t, repositoryRoot, "go", "build", "-tags", "desktop,production", "-o", releaseBinary, ".")
	symbols := runNativeEvidenceCommand(t, repositoryRoot, "go", "tool", "nm", releaseBinary)
	if strings.Contains(symbols, "nativeEvidence") || strings.Contains(symbols, "native_evidence") {
		t.Fatalf("release binary exposes native evidence symbols")
	}
	releaseBytes, err := os.ReadFile(releaseBinary)
	if err != nil {
		t.Fatalf("read release binary: %v", err)
	}
	for _, marker := range [][]byte{
		[]byte("native-evidence:"),
		[]byte("Start notification evidence"),
		[]byte("evidence-success"),
	} {
		if bytes.Contains(releaseBytes, marker) {
			t.Fatalf("release binary contains evidence-only marker %q", marker)
		}
	}
}

func TestNativeEvidenceScenariosUseOnlyApprovedDependencyBoundaries(t *testing.T) {
	t.Parallel()

	repositoryRoot := repositoryRootForNativeEvidenceTest(t)
	output := runNativeEvidenceCommand(t, repositoryRoot, "node", "frontend/evidence/check-boundaries.mjs")
	for _, scenario := range []string{
		"pending-close",
		"stale-close-old",
		"stale-close-new",
		"startup-retry",
		"divider-acknowledgement",
		"notifications",
	} {
		if !strings.Contains(output, scenario+": PASS") {
			t.Fatalf("boundary safeguard did not pass %q:\n%s", scenario, output)
		}
	}
}

func TestNativeEvidenceFrontendWailsImportsStayInApprovedBoundaries(t *testing.T) {
	t.Parallel()

	repositoryRoot := repositoryRootForNativeEvidenceTest(t)
	output := runNativeEvidenceCommand(t, repositoryRoot, "node", "frontend/evidence/check-boundaries.mjs")
	for _, result := range []string{
		"frontend Wails import boundaries: PASS",
		"native evidence runtime release exclusion: PASS",
	} {
		if !strings.Contains(output, result) {
			t.Fatalf("frontend Wails import safeguard did not pass %q:\n%s", result, output)
		}
	}
}

func repositoryRootForNativeEvidenceTest(t *testing.T) string {
	t.Helper()
	_, filename, _, ok := runtime.Caller(0)
	if !ok {
		t.Fatal("resolve native evidence safeguard path")
	}
	return filepath.Dir(filename)
}

func runNativeEvidenceCommand(t *testing.T, directory, name string, arguments ...string) string {
	t.Helper()
	command := exec.Command(name, arguments...)
	command.Dir = directory
	command.Env = os.Environ()
	if runtime.GOOS == "darwin" && name == "go" {
		command.Env = append(command.Env,
			"CGO_CFLAGS=-mmacosx-version-min=10.13",
			"CGO_CXXFLAGS=-mmacosx-version-min=10.13",
			"CGO_LDFLAGS=-framework UniformTypeIdentifiers -mmacosx-version-min=10.13",
		)
	}
	var output bytes.Buffer
	command.Stdout = &output
	command.Stderr = &output
	if err := command.Run(); err != nil {
		t.Fatalf("%s %s failed: %v\n%s", name, strings.Join(arguments, " "), err, output.String())
	}
	return output.String()
}
