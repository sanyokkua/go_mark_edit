package application

import (
	"bytes"
	"encoding/json"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
	"testing"
)

// Proves: STORY-010-AC-1
// The committed trace record passes the real repository checker without the checker modifying it.
func TestTraceRecordIsFreshAndCommitted(t *testing.T) {
	repositoryRoot := storyEightRepositoryRoot(t)
	tracePath := filepath.Join(repositoryRoot, "docs", "traceability.yaml")
	before, err := os.ReadFile(tracePath)
	if err != nil {
		t.Fatalf("read committed trace record: %v", err)
	}

	runTraceCLI(t, "scripts/trace-check.mjs", repositoryRoot)

	after, err := os.ReadFile(tracePath)
	if err != nil {
		t.Fatalf("re-read committed trace record: %v", err)
	}
	if !bytes.Equal(before, after) {
		t.Fatal("trace-check modified docs/traceability.yaml")
	}
}

// Proves: STORY-008-AC-3
// The trace CLI maps each story direction and collects only explicit Proves tags or AC-first Jest test names.
func TestTraceGeneratorBuildsExpectedMaps(t *testing.T) {
	fixtureRoot := newTraceFixture(t)
	writeTraceFixture(t, fixtureRoot, "docs/stories/story-101-fixture.md", traceFixtureStory("STORY-101", "done", []string{"STORY-101-AC-1", "STORY-101-AC-2"}, nil))
	writeTraceFixture(t, fixtureRoot, "internal/application/example_test.go", "package application\n\n// Proves: STORY-101-AC-1\nfunc TestExample(t *testing.T) {}\n\n// STORY-101-AC-2 appears in prose and must not be collected.\n")
	writeTraceFixture(t, fixtureRoot, "frontend/src/example.test.ts", "it('STORY-101-AC-2 renders the fixture', () => {});\nit('mentions STORY-101-AC-1 later', () => {});\n")

	runTraceCLI(t, "scripts/trace.mjs", fixtureRoot)
	trace := readTraceRecord(t, fixtureRoot)

	story := trace.Stories["STORY-101"]
	if story.Title == "" {
		t.Fatal("generated trace omits STORY-101")
	}
	assertTraceTests(t, story.AcceptanceCriteria["STORY-101-AC-1"].Tests, "internal/application/example_test.go:3")
	assertTraceTests(t, story.AcceptanceCriteria["STORY-101-AC-2"].Tests, "frontend/src/example.test.ts:1")
	if got := trace.Clauses["fixture.md#valid-clause"].Stories; len(got) != 1 || got[0] != "STORY-101" {
		t.Fatalf("clause map = %#v, want STORY-101", got)
	}
	if got := trace.Modules["internal/application/"].Stories; len(got) != 1 || got[0] != "STORY-101" {
		t.Fatalf("module map = %#v, want STORY-101", got)
	}
}

// Proves: STORY-008-AC-3
// The trace checker accepts an empty backlog and rejects invalid, orphaned, cyclic, and stale fixture roots.
func TestTraceCheckRejectsInvalidFixturesAndAcceptsEmptyBacklog(t *testing.T) {
	t.Run("accepts empty backlog", func(t *testing.T) {
		fixtureRoot := newTraceFixture(t)
		runTraceCLI(t, "scripts/trace.mjs", fixtureRoot)
		runTraceCLI(t, "scripts/trace-check.mjs", fixtureRoot)
	})

	for _, testCase := range []struct {
		name      string
		configure func(t *testing.T, root string)
		want      string
	}{
		{
			name: "invalid clause",
			configure: func(t *testing.T, root string) {
				writeTraceFixture(t, root, "docs/stories/story-102-invalid.md", traceFixtureStory("STORY-102", "ready", []string{"STORY-102-AC-1"}, nil)+"\n")
				storyPath := filepath.Join(root, "docs/stories/story-102-invalid.md")
				contents, err := os.ReadFile(storyPath)
				if err != nil {
					t.Fatalf("read invalid fixture story: %v", err)
				}
				if err := os.WriteFile(storyPath, []byte(strings.Replace(string(contents), "fixture.md#valid-clause", "missing.md#unknown", 1)), 0o600); err != nil {
					t.Fatalf("make fixture clause invalid: %v", err)
				}
			},
			want: "missing clause file",
		},
		{
			name: "orphaned proving tag",
			configure: func(t *testing.T, root string) {
				writeTraceFixture(t, root, "internal/application/orphan_test.go", "package application\n\n// Proves: STORY-999-AC-1\nfunc TestOrphan(t *testing.T) {}\n")
			},
			want: "orphan proving test",
		},
		{
			name: "cyclic dependencies",
			configure: func(t *testing.T, root string) {
				writeTraceFixture(t, root, "docs/stories/story-103-first.md", traceFixtureStory("STORY-103", "ready", []string{"STORY-103-AC-1"}, []string{"STORY-104"}))
				writeTraceFixture(t, root, "docs/stories/story-104-second.md", traceFixtureStory("STORY-104", "ready", []string{"STORY-104-AC-1"}, []string{"STORY-103"}))
			},
			want: "cyclic story dependency",
		},
		{
			name: "stale record",
			configure: func(t *testing.T, root string) {
				writeTraceFixture(t, root, "docs/stories/story-105-fresh.md", traceFixtureStory("STORY-105", "ready", []string{"STORY-105-AC-1"}, nil))
			},
			want: "traceability.yaml is stale",
		},
	} {
		t.Run(testCase.name, func(t *testing.T) {
			fixtureRoot := newTraceFixture(t)
			testCase.configure(t, fixtureRoot)
			runTraceCLI(t, "scripts/trace.mjs", fixtureRoot)
			if testCase.name == "stale record" {
				writeTraceFixture(t, fixtureRoot, "docs/traceability.yaml", "stale\n")
			}
			output := runTraceCLIFailure(t, "scripts/trace-check.mjs", fixtureRoot)
			if !strings.Contains(output, testCase.want) {
				t.Fatalf("trace-check output = %q, want %q", output, testCase.want)
			}
		})
	}
}

// Proves: STORY-008-AC-4
// ADR-0001 through ADR-0006 remain accepted frozen-spec records and are not duplicated in docs/adr.
func TestFrozenInitialADRsAreReferencedWithoutDuplication(t *testing.T) {
	t.Parallel()

	repositoryRoot := storyEightRepositoryRoot(t)
	for number := 1; number <= 6; number++ {
		matches, err := filepath.Glob(filepath.Join(repositoryRoot, "specification", "08_Decisions", "000"+string(rune('0'+number))+"-*.md"))
		if err != nil || len(matches) != 1 {
			t.Fatalf("frozen ADR-%04d matches = %v, error = %v", number, matches, err)
		}
		contents, readErr := os.ReadFile(matches[0])
		if readErr != nil {
			t.Fatalf("read frozen ADR-%04d: %v", number, readErr)
		}
		if !strings.Contains(string(contents), "**Status:** accepted") {
			t.Errorf("frozen ADR-%04d is not accepted", number)
		}
	}

	entries, err := os.ReadDir(filepath.Join(repositoryRoot, "docs", "adr"))
	if err != nil {
		t.Fatalf("read mutable ADR directory: %v", err)
	}
	for _, entry := range entries {
		if strings.HasPrefix(entry.Name(), "000") {
			t.Errorf("mutable docs/adr duplicates frozen initial ADR: %s", entry.Name())
		}
	}
}

type traceRecord struct {
	Stories map[string]traceStory `json:"stories"`
	Clauses map[string]traceIndex `json:"clauses"`
	Modules map[string]traceIndex `json:"modules"`
}

type traceStory struct {
	Title              string                          `json:"title"`
	AcceptanceCriteria map[string]traceAcceptanceEntry `json:"acceptance_criteria"`
}

type traceAcceptanceEntry struct {
	Tests []string `json:"tests"`
}

type traceIndex struct {
	Stories []string `json:"stories"`
}

func storyEightRepositoryRoot(t *testing.T) string {
	t.Helper()

	_, sourceFile, _, ok := runtime.Caller(0)
	if !ok {
		t.Fatal("locate Story-008 test source")
	}
	return filepath.Clean(filepath.Join(filepath.Dir(sourceFile), "..", ".."))
}

func newTraceFixture(t *testing.T) string {
	t.Helper()

	root := t.TempDir()
	writeTraceFixture(t, root, "docs/stories/.keep", "")
	writeTraceFixture(t, root, "specification/fixture.md", "# Valid clause\n")
	writeTraceFixture(t, root, "specification/06_Process_and_Traceability/01_MODULE_INVENTORY.md", "| Module | Description |\n| --- | --- |\n| `internal/application/` | fixture |\n")
	return root
}

func traceFixtureStory(id, status string, acceptanceCriteria, dependencies []string) string {
	criteria := ""
	for _, criterion := range acceptanceCriteria {
		criteria += "  - " + criterion + "\n"
	}
	dependsOn := "depends_on: []"
	if len(dependencies) > 0 {
		dependsOn = "depends_on:\n"
		for _, dependency := range dependencies {
			dependsOn += "  - " + dependency + "\n"
		}
	}
	return "---\n" +
		"id: " + id + "\n" +
		"title: Fixture story\n" +
		"status: " + status + "\n" +
		"spec_clauses:\n  - fixture.md#valid-clause\n" +
		"modules:\n  - internal/application/\n" +
		"acceptance_criteria:\n" + criteria +
		"edge_cases: []\n" +
		dependsOn +
		"adrs: []\nphase: 00\nowner: coder\nestimate: S\n---\n"
}

func writeTraceFixture(t *testing.T, root, relativePath, contents string) {
	t.Helper()

	path := filepath.Join(root, relativePath)
	if err := os.MkdirAll(filepath.Dir(path), 0o700); err != nil {
		t.Fatalf("create fixture directory for %s: %v", relativePath, err)
	}
	if err := os.WriteFile(path, []byte(contents), 0o600); err != nil {
		t.Fatalf("write fixture %s: %v", relativePath, err)
	}
}

func runTraceCLI(t *testing.T, script, root string) {
	t.Helper()

	command := exec.Command("node", filepath.Join(storyEightRepositoryRoot(t), script), "--root", root)
	command.Dir = storyEightRepositoryRoot(t)
	output, err := command.CombinedOutput()
	if err != nil {
		t.Fatalf("run %s: %v\n%s", script, err, output)
	}
}

func runTraceCLIFailure(t *testing.T, script, root string) string {
	t.Helper()

	command := exec.Command("node", filepath.Join(storyEightRepositoryRoot(t), script), "--root", root)
	command.Dir = storyEightRepositoryRoot(t)
	output, err := command.CombinedOutput()
	if err == nil {
		t.Fatalf("%s unexpectedly succeeded", script)
	}
	return string(output)
}

func readTraceRecord(t *testing.T, root string) traceRecord {
	t.Helper()

	contents, err := os.ReadFile(filepath.Join(root, "docs", "traceability.yaml"))
	if err != nil {
		t.Fatalf("read generated trace record: %v", err)
	}
	jsonStart := strings.Index(string(contents), "{")
	if jsonStart < 0 {
		t.Fatal("generated trace record has no JSON payload")
	}
	var record traceRecord
	if err := json.Unmarshal(contents[jsonStart:], &record); err != nil {
		t.Fatalf("parse generated trace record: %v", err)
	}
	return record
}

func assertTraceTests(t *testing.T, tests []string, want string) {
	t.Helper()
	if len(tests) != 1 || tests[0] != want {
		t.Fatalf("proving tests = %#v, want [%q]", tests, want)
	}
}
