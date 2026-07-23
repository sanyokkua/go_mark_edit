package application

import (
	"encoding/json"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"runtime"
	"strings"
	"testing"
)

// Proves: STORY-024-AC-2
// Story frontmatter, AC Satisfies markers, and the generated phase-requirement index agree exactly.
func TestTraceabilityValidatesPhaseRequirementMappings(t *testing.T) {
	t.Run("generates the inverse requirement map", func(t *testing.T) {
		root := newPhaseFixture(t)
		writeCompletePhaseStory(t, root, "done")
		writeTraceFixtureBoard(t, root, map[string]string{"STORY-101": "done"})
		writePhaseFixture(t, filepath.Join(root, "internal", "application", "fixture_test.go"), "package application\n\n// Proves: STORY-101-AC-1\n// Evidence: EC-DOCS-1\nfunc TestFixtureEdge(t *testing.T) {}\n")
		runPhaseCLI(t, "scripts/trace.mjs", root)
		runPhaseCLI(t, "scripts/trace-check.mjs", root)

		contents := readPhaseFixture(t, filepath.Join(root, "docs", "traceability.yaml"))
		jsonStart := strings.Index(contents, "{")
		var record struct {
			PhaseRequirements map[string]struct {
				Phase         string   `json:"phase"`
				SourceClauses []string `json:"source_clauses"`
				Stories       map[string]struct {
					AcceptanceCriteria []string `json:"acceptance_criteria"`
				} `json:"stories"`
				Tests []string `json:"tests"`
			} `json:"phase_requirements"`
		}
		if err := json.Unmarshal([]byte(contents[jsonStart:]), &record); err != nil {
			t.Fatalf("parse trace record: %v", err)
		}
		entry, ok := record.PhaseRequirements["PH00-R01"]
		if !ok || entry.Phase != "00" {
			t.Fatalf("phase requirement entry = %#v, present = %v", entry, ok)
		}
		if got := entry.Stories["STORY-101"].AcceptanceCriteria; len(got) != 1 || got[0] != "STORY-101-AC-1" {
			t.Fatalf("acceptance criteria = %#v", got)
		}
		if len(entry.Tests) != 1 {
			t.Fatalf("tests = %#v, want one proving test", entry.Tests)
		}
	})

	for _, testCase := range []struct {
		name    string
		mutate  func(string) string
		wantErr string
	}{
		{
			name: "undefined phase requirement",
			mutate: func(contents string) string {
				return strings.ReplaceAll(contents, "PH00-R01", "PH00-R99")
			},
			wantErr: "undefined phase requirement PH00-R99",
		},
		{
			name: "frontmatter and AC union disagree",
			mutate: func(contents string) string {
				return strings.Replace(contents, "**Satisfies:** PH00-R01", "**Satisfies:** PH00-R02", 1)
			},
			wantErr: "phase_requirements disagree with AC Satisfies union",
		},
		{
			name: "ready L story",
			mutate: func(contents string) string {
				contents = strings.Replace(contents, "status: done", "status: ready", 1)
				return strings.Replace(contents, "estimate: S", "estimate: L", 1)
			},
			wantErr: "L story cannot be ready",
		},
	} {
		t.Run(testCase.name, func(t *testing.T) {
			root := newPhaseFixture(t)
			writeCompletePhaseStory(t, root, "done")
			boardStatus := "done"
			if testCase.name == "ready L story" {
				boardStatus = "ready"
			}
			writeTraceFixtureBoard(t, root, map[string]string{"STORY-101": boardStatus})
			writePhaseFixture(t, filepath.Join(root, "internal", "application", "fixture_test.go"), "package application\n\n// Proves: STORY-101-AC-1\n// Evidence: EC-DOCS-1\nfunc TestFixtureEdge(t *testing.T) {}\n")
			storyPath := filepath.Join(root, "docs", "stories", "story-101-fixture.md")
			writePhaseFixture(t, storyPath, testCase.mutate(readPhaseFixture(t, storyPath)))
			runPhaseCLI(t, "scripts/trace.mjs", root)
			output := runPhaseCLIFailure(t, "scripts/trace-check.mjs", root)
			if !strings.Contains(output, testCase.wantErr) {
				t.Fatalf("trace-check output = %q, want %q", output, testCase.wantErr)
			}
		})
	}
}

// Proves: STORY-024-AC-2
// Every story-authoring surface teaches the same phase-requirement and S/M-ready schema.
func TestStoryAuthoringSurfacesRequirePhaseMappings(t *testing.T) {
	repositoryRoot := storyEightRepositoryRoot(t)
	for _, path := range []string{
		"specification/06_Process_and_Traceability/02_STORY_FORMAT.md",
		"docs/stories/STORY_TEMPLATE.md",
		".agents/skills/story-and-traceability-workflow/SKILL.md",
		".agents/skills/story-and-traceability-workflow/assets/story-template.md",
		".agents/skills/story-and-traceability-workflow/references/front-matter-and-body.md",
		".agents/skills/story-and-traceability-workflow/references/lifecycle-and-sizing.md",
		".claude/rules/traceability-and-stories.md",
	} {
		contents := readToolchainFile(t, repositoryRoot, path)
		for _, marker := range []string{"phase_requirements", "Satisfies:", "L", "S/M"} {
			if !strings.Contains(contents, marker) {
				t.Errorf("%s omits story-schema marker %q", path, marker)
			}
		}
	}
}

// Proves: STORY-024-AC-1
// The phase checker accepts the normative Markdown schema and rejects every structurally incomplete ledger.
func TestPhaseCheckerValidatesNormativePhaseDocuments(t *testing.T) {
	t.Run("accepts a complete phase", func(t *testing.T) {
		root := newPhaseFixture(t)
		runPhaseCLI(t, "scripts/phase-check.mjs", root)
	})

	t.Run("accepts canonical edge areas containing digits", func(t *testing.T) {
		root := newPhaseFixture(t)
		phasePath := filepath.Join(root, "specification", "07_Phases", "PHASE_00_FIXTURE.md")
		contents := strings.ReplaceAll(readPhaseFixture(t, phasePath), "EC-DOCS-1", "EC-I18N-1")
		writePhaseFixture(t, phasePath, contents)
		runPhaseCLI(t, "scripts/phase-check.mjs", root)
	})

	t.Run("rejects mandatory sections out of order", func(t *testing.T) {
		root := newPhaseFixture(t)
		phasePath := filepath.Join(root, "specification", "07_Phases", "PHASE_00_FIXTURE.md")
		contents := readPhaseFixture(t, phasePath)
		contents = strings.Replace(contents, "## Scope", "## TEMP", 1)
		contents = strings.Replace(contents, "## Out of scope", "## Scope", 1)
		contents = strings.Replace(contents, "## TEMP", "## Out of scope", 1)
		writePhaseFixture(t, phasePath, contents)
		output := runPhaseCLIFailure(t, "scripts/phase-check.mjs", root)
		if !strings.Contains(output, "mandatory sections are out of order") {
			t.Fatalf("phase-check output = %q, want section-order error", output)
		}
	})

	t.Run("rejects an incomplete repository phase set", func(t *testing.T) {
		root := newPhaseFixture(t)
		if err := os.Remove(filepath.Join(root, "specification", "07_Phases", "PHASE_01_FIXTURE.md")); err != nil {
			t.Fatalf("remove fixture phase: %v", err)
		}
		output := runPhaseCLIFailure(t, "scripts/phase-check.mjs", root)
		if !strings.Contains(output, "missing phase documents: PH01") {
			t.Fatalf("phase-check output = %q, want complete phase-set error", output)
		}
	})

	t.Run("requires the roadmap and module inventory", func(t *testing.T) {
		root := newPhaseFixture(t)
		if err := os.Remove(filepath.Join(root, "specification", "07_Phases", "00_ROADMAP.md")); err != nil {
			t.Fatalf("remove roadmap: %v", err)
		}
		if err := os.Remove(filepath.Join(root, "specification", "06_Process_and_Traceability", "01_MODULE_INVENTORY.md")); err != nil {
			t.Fatalf("remove module inventory: %v", err)
		}
		output := runPhaseCLIFailure(t, "scripts/phase-check.mjs", root)
		for _, want := range []string{"missing specification/07_Phases/00_ROADMAP.md", "missing specification/06_Process_and_Traceability/01_MODULE_INVENTORY.md"} {
			if !strings.Contains(output, want) {
				t.Errorf("phase-check output = %q, want %q", output, want)
			}
		}
	})

	t.Run("orders optional conflicts before clarification", func(t *testing.T) {
		root := newPhaseFixture(t)
		phasePath := filepath.Join(root, "specification", "07_Phases", "PHASE_00_FIXTURE.md")
		conflicts := "## Open specification conflicts\n\n| ID | Conflicting or missing sources | Required decision | Blocked requirements |\n|---|---|---|---|\n| PH00-X01 | fixture.md#valid-clause | Decide fixture behavior. | PH00-R01 |\n\n"
		contents := strings.Replace(readPhaseFixture(t, phasePath), "## Cross-phase contracts", conflicts+"## Cross-phase contracts", 1)
		writePhaseFixture(t, phasePath, contents)
		output := runPhaseCLIFailure(t, "scripts/phase-check.mjs", root)
		if !strings.Contains(output, "mandatory sections are out of order") {
			t.Fatalf("phase-check output = %q, want optional conflict-order error", output)
		}
	})

	t.Run("rejects a module absent from the inventory", func(t *testing.T) {
		root := newPhaseFixture(t)
		writePhaseFixture(t, filepath.Join(root, "specification", "06_Process_and_Traceability", "01_MODULE_INVENTORY.md"), "# Module Inventory\n\n| Module path | Purpose |\n|---|---|\n| `internal/application/` | fixture |\n")
		phasePath := filepath.Join(root, "specification", "07_Phases", "PHASE_00_FIXTURE.md")
		contents := strings.Replace(readPhaseFixture(t, phasePath), "| internal/application/ | scripts/ |", "| internal/unknown/ | scripts/ |", 1)
		writePhaseFixture(t, phasePath, contents)
		output := runPhaseCLIFailure(t, "scripts/phase-check.mjs", root)
		if !strings.Contains(output, "module internal/unknown/ is absent from the module inventory") {
			t.Fatalf("phase-check output = %q, want module-inventory error", output)
		}
	})

	t.Run("rejects duplicate primary edge ownership", func(t *testing.T) {
		root := newPhaseFixture(t)
		contents := strings.ReplaceAll(validPhaseFixture(), "PH00", "PH01")
		writePhaseFixture(t, filepath.Join(root, "specification", "07_Phases", "PHASE_01_FIXTURE.md"), contents)
		output := runPhaseCLIFailure(t, "scripts/phase-check.mjs", root)
		if !strings.Contains(output, "EC-DOCS-1 has 2 primary phase owners") {
			t.Fatalf("phase-check output = %q, want duplicate primary-owner error", output)
		}
	})

	t.Run("rejects an edge without a primary owner", func(t *testing.T) {
		root := newPhaseFixture(t)
		phasePath := filepath.Join(root, "specification", "07_Phases", "PHASE_00_FIXTURE.md")
		contents := strings.Replace(readPhaseFixture(t, phasePath), "| EC-DOCS-1 | primary |", "| EC-DOCS-1 | regression |", 1)
		writePhaseFixture(t, phasePath, contents)
		output := runPhaseCLIFailure(t, "scripts/phase-check.mjs", root)
		if !strings.Contains(output, "EC-DOCS-1 has no primary phase owner") {
			t.Fatalf("phase-check output = %q, want missing primary-owner error", output)
		}
	})

	t.Run("rejects phase dependency cycles", func(t *testing.T) {
		root := newPhaseFixture(t)
		phaseZeroPath := filepath.Join(root, "specification", "07_Phases", "PHASE_00_FIXTURE.md")
		phaseZero := strings.Replace(readPhaseFixture(t, phaseZeroPath), "| PH00 | sequential | Stage 1 / M1 | none |", "| PH00 | sequential | Stage 1 / M1 | PH01 |", 1)
		writePhaseFixture(t, phaseZeroPath, phaseZero)
		phaseOne := strings.ReplaceAll(validPhaseFixture(), "PH00", "PH01")
		phaseOne = strings.Replace(phaseOne, "| PH01 | sequential | Stage 1 / M1 | none |", "| PH01 | sequential | Stage 1 / M1 | PH00 |", 1)
		writePhaseFixture(t, filepath.Join(root, "specification", "07_Phases", "PHASE_01_FIXTURE.md"), phaseOne)
		output := runPhaseCLIFailure(t, "scripts/phase-check.mjs", root)
		if !strings.Contains(output, "phase dependency cycle: PH00 -> PH01 -> PH00") {
			t.Fatalf("phase-check output = %q, want dependency-cycle error", output)
		}
	})

	for _, testCase := range []struct {
		name    string
		mutate  func(string) string
		wantErr string
	}{
		{
			name: "missing mandatory section",
			mutate: func(contents string) string {
				return strings.Replace(contents, "## Cross-phase contracts", "## Missing contracts", 1)
			},
			wantErr: "missing section Cross-phase contracts",
		},
		{
			name: "invalid phase dependency",
			mutate: func(contents string) string {
				return strings.Replace(contents, "| PH00 | sequential | Stage 1 / M1 | none | once per implemented revision |", "| PH00 | sequential | Stage 1 / M1 | STORY-999 | once per implemented revision |", 1)
			},
			wantErr: "phase dependencies must use PHNN ids or none",
		},
		{
			name: "unresolved source anchor",
			mutate: func(contents string) string {
				return strings.Replace(contents, "fixture.md#valid-clause", "fixture.md#missing-clause", 1)
			},
			wantErr: "unresolved source clause fixture.md#missing-clause",
		},
		{
			name: "duplicate requirement id",
			mutate: func(contents string) string {
				row := "| PH00-R01 | Provide the fixture capability. | fixture.md#valid-clause | DD-01; F1 | PH00-W01 |"
				return strings.Replace(contents, row, row+"\n"+row, 1)
			},
			wantErr: "duplicate requirement PH00-R01",
		},
		{
			name: "malformed work package id",
			mutate: func(contents string) string {
				return strings.ReplaceAll(contents, "PH00-W01", "PH00-W1")
			},
			wantErr: "malformed work-package id PH00-W1",
		},
		{
			name: "requirement without work package",
			mutate: func(contents string) string {
				return strings.Replace(contents, "| PH00-W01 | Deliver the fixture capability.", "| PH00-W02 | Deliver the fixture capability.", 1)
			},
			wantErr: "PH00-R01 references missing work package PH00-W01",
		},
		{
			name: "requirement without exit evidence",
			mutate: func(contents string) string {
				return strings.Replace(contents, "| PH00-E01 | PH00-R01 |", "| PH00-E01 | PH00-R02 |", 1)
			},
			wantErr: "PH00-R01 has no exit evidence",
		},
		{
			name: "incomplete transition row",
			mutate: func(contents string) string {
				return strings.Replace(contents, "| PH00-T01 | Start fixture | Repository is available |", "| PH00-T01 | Start fixture | — |", 1)
			},
			wantErr: "PH00-T01 has an empty Preconditions cell",
		},
		{
			name: "unparseable transition requirements",
			mutate: func(contents string) string {
				return strings.Replace(contents, "| Preserve prior state on failure | PH00-R01 |", "| Preserve prior state on failure | requirement one |", 1)
			},
			wantErr: "PH00-T01 Requirements must name at least one PHNN-RNN id",
		},
		{
			name: "incomplete contract row",
			mutate: func(contents string) string {
				return strings.Replace(contents, "| PH00-C01 | PH00 | PH01 |", "| PH00-C01 | PH00 | — |", 1)
			},
			wantErr: "PH00-C01 has an empty Consumer cell",
		},
		{
			name: "forbidden global story id",
			mutate: func(contents string) string {
				return strings.Replace(contents, "Deliver the fixture capability.", "Deliver STORY-999 fixture capability.", 1)
			},
			wantErr: "work packages must not reserve global STORY ids",
		},
		{
			name: "artifact path in modules column",
			mutate: func(contents string) string {
				return strings.Replace(contents, "| internal/application/ | scripts/ |", "| scripts/ | none |", 1)
			},
			wantErr: "artifact path scripts/ appears in Modules",
		},
		{
			name: "edge case without exact evidence",
			mutate: func(contents string) string {
				return strings.Replace(contents, "phase_validation_test.go::TestFixtureEdge (EC-DOCS-1)", "phase_validation_test.go::TestFixtureEdge", 1)
			},
			wantErr: "EC-DOCS-1 evidence must name the edge-case id exactly",
		},
	} {
		t.Run(testCase.name, func(t *testing.T) {
			root := newPhaseFixture(t)
			phasePath := filepath.Join(root, "specification", "07_Phases", "PHASE_00_FIXTURE.md")
			contents := readPhaseFixture(t, phasePath)
			writePhaseFixture(t, phasePath, testCase.mutate(contents))
			output := runPhaseCLIFailure(t, "scripts/phase-check.mjs", root)
			if !strings.Contains(output, testCase.wantErr) {
				t.Fatalf("phase-check output = %q, want %q", output, testCase.wantErr)
			}
		})
	}
}

// Proves: STORY-024-AC-3
// Completion requires done story/AC/test coverage and durable ownership for human or runtime evidence.
func TestPhaseCompleteCheckerRequiresCoverageAndDurableEvidence(t *testing.T) {
	t.Run("accepts complete coverage", func(t *testing.T) {
		root := newPhaseFixture(t)
		writeCompletePhaseStory(t, root, "done")
		writePhaseFixture(t, filepath.Join(root, "internal", "application", "fixture_test.go"), "package application\n\n// Proves: STORY-101-AC-1\n// Evidence: EC-DOCS-1\nfunc TestFixtureEdge(t *testing.T) {}\n")
		runPhaseCLI(t, "scripts/trace.mjs", root)
		runPhaseCLIWithArguments(t, "scripts/phase-complete-check.mjs", root, "00")
	})

	t.Run("accepts approved human evidence", func(t *testing.T) {
		root := newPhaseFixture(t)
		writeCompletePhaseStory(t, root, "done")
		writePhaseFixture(t, filepath.Join(root, "internal", "application", "fixture_test.go"), "package application\n\n// Proves: STORY-101-AC-1\n// Evidence: EC-DOCS-1\nfunc TestFixtureEdge(t *testing.T) {}\n")
		phasePath := filepath.Join(root, "specification", "07_Phases", "PHASE_00_FIXTURE.md")
		contents := strings.Replace(readPhaseFixture(t, phasePath), "| automated | `go test ./...` | all | tester | current HEAD | yes |", "| human | `docs/phase-evidence/PH00-window.md` | macOS | product owner | current HEAD | yes |", 1)
		writePhaseFixture(t, phasePath, contents)
		writePhaseFixture(t, filepath.Join(root, "docs", "phase-evidence", "PH00-window.md"), "**Status:** approved\n**Owner:** product owner\n**Revision:** fixture\n**Date:** 2026-07-21\n")
		runPhaseCLI(t, "scripts/trace.mjs", root)
		runPhaseCLIWithArguments(t, "scripts/phase-complete-check.mjs", root, "00")
	})

	t.Run("rejects vague automated evidence", func(t *testing.T) {
		root := newPhaseFixture(t)
		writeCompletePhaseStory(t, root, "done")
		writePhaseFixture(t, filepath.Join(root, "internal", "application", "fixture_test.go"), "package application\n\n// Proves: STORY-101-AC-1\n// Evidence: EC-DOCS-1\nfunc TestFixtureEdge(t *testing.T) {}\n")
		phasePath := filepath.Join(root, "specification", "07_Phases", "PHASE_00_FIXTURE.md")
		contents := strings.Replace(readPhaseFixture(t, phasePath), "`go test ./...`", "the relevant tests", 1)
		writePhaseFixture(t, phasePath, contents)
		runPhaseCLI(t, "scripts/trace.mjs", root)
		output := runPhaseCLIWithArgumentsFailure(t, "scripts/phase-complete-check.mjs", root, "00")
		if !strings.Contains(output, "PH00-E01 automated evidence must name an exact command or test") {
			t.Fatalf("phase-complete-check output = %q, want exact automated-evidence error", output)
		}
	})

	for _, testCase := range []struct {
		name    string
		proof   string
		wantErr string
	}{
		{name: "missing just recipe", proof: "`just missing-recipe`", wantErr: "PH00-E01 references missing just recipe missing-recipe"},
		{name: "missing test reference", proof: "`internal/application/missing_test.go::TestMissing`", wantErr: "PH00-E01 references missing test file internal/application/missing_test.go"},
	} {
		t.Run(testCase.name, func(t *testing.T) {
			root := newPhaseFixture(t)
			writeCompletePhaseStory(t, root, "done")
			writePhaseFixture(t, filepath.Join(root, "internal", "application", "fixture_test.go"), "package application\n\n// Proves: STORY-101-AC-1\n// Evidence: EC-DOCS-1\nfunc TestFixtureEdge(t *testing.T) {}\n")
			phasePath := filepath.Join(root, "specification", "07_Phases", "PHASE_00_FIXTURE.md")
			contents := strings.Replace(readPhaseFixture(t, phasePath), "`go test ./...`", testCase.proof, 1)
			writePhaseFixture(t, phasePath, contents)
			runPhaseCLI(t, "scripts/trace.mjs", root)
			output := runPhaseCLIWithArgumentsFailure(t, "scripts/phase-complete-check.mjs", root, "00")
			if !strings.Contains(output, testCase.wantErr) {
				t.Fatalf("phase-complete-check output = %q, want %q", output, testCase.wantErr)
			}
		})
	}

	t.Run("reports uncovered transitions contracts and exit rows", func(t *testing.T) {
		root := newPhaseFixture(t)
		writeCompletePhaseStory(t, root, "done")
		storyPath := filepath.Join(root, "docs", "stories", "story-101-fixture.md")
		contents := strings.Replace(readPhaseFixture(t, storyPath), "phase_requirements:\n  - PH00-R01\n", "phase_requirements: []\n", 1)
		contents = strings.Replace(contents, "**Satisfies:** PH00-R01", "**Satisfies:** none", 1)
		writePhaseFixture(t, storyPath, contents)
		runPhaseCLI(t, "scripts/trace.mjs", root)
		output := runPhaseCLIWithArgumentsFailure(t, "scripts/phase-complete-check.mjs", root, "00")
		for _, want := range []string{
			"PH00-T01 transition lacks done-story AC/test evidence",
			"PH00-C01 contract lacks done-story AC/test evidence",
			"PH00-E01 exit evidence lacks done-story AC/test coverage",
		} {
			if !strings.Contains(output, want) {
				t.Errorf("phase-complete-check output = %q, want %q", output, want)
			}
		}
	})

	for _, testCase := range []struct {
		name      string
		configure func(*testing.T, string)
		wantErr   string
	}{
		{
			name: "uncovered requirement",
			configure: func(t *testing.T, root string) {
				writeCompletePhaseStory(t, root, "done")
				storyPath := filepath.Join(root, "docs", "stories", "story-101-fixture.md")
				contents := strings.Replace(readPhaseFixture(t, storyPath), "phase_requirements:\n  - PH00-R01\n", "phase_requirements: []\n", 1)
				contents = strings.Replace(contents, "**Satisfies:** PH00-R01", "**Satisfies:** none", 1)
				writePhaseFixture(t, storyPath, contents)
			},
			wantErr: "PH00-R01 has no story acceptance-criterion coverage",
		},
		{
			name: "story not done",
			configure: func(t *testing.T, root string) {
				writeCompletePhaseStory(t, root, "ready")
			},
			wantErr: "PH00-R01 is owned only by incomplete stories",
		},
		{
			name: "acceptance criterion without test",
			configure: func(t *testing.T, root string) {
				writeCompletePhaseStory(t, root, "done")
			},
			wantErr: "STORY-101-AC-1 has no proving test",
		},
		{
			name: "manual evidence without artifact",
			configure: func(t *testing.T, root string) {
				writeCompletePhaseStory(t, root, "done")
				writePhaseFixture(t, filepath.Join(root, "internal", "application", "fixture_test.go"), "package application\n\n// Proves: STORY-101-AC-1\n// Evidence: EC-DOCS-1\nfunc TestFixtureEdge(t *testing.T) {}\n")
				phasePath := filepath.Join(root, "specification", "07_Phases", "PHASE_00_FIXTURE.md")
				contents := strings.Replace(readPhaseFixture(t, phasePath), "| automated | `go test ./...` | all | tester | current HEAD | yes |", "| human | pending | macOS | — | current HEAD | yes |", 1)
				writePhaseFixture(t, phasePath, contents)
			},
			wantErr: "PH00-E01 human evidence requires an approval owner and existing artifact",
		},
		{
			name: "pending manual evidence artifact",
			configure: func(t *testing.T, root string) {
				writeCompletePhaseStory(t, root, "done")
				writePhaseFixture(t, filepath.Join(root, "internal", "application", "fixture_test.go"), "package application\n\n// Proves: STORY-101-AC-1\n// Evidence: EC-DOCS-1\nfunc TestFixtureEdge(t *testing.T) {}\n")
				phasePath := filepath.Join(root, "specification", "07_Phases", "PHASE_00_FIXTURE.md")
				contents := strings.Replace(readPhaseFixture(t, phasePath), "| automated | `go test ./...` | all | tester | current HEAD | yes |", "| human | `docs/phase-evidence/PH00-window.md` | macOS | product owner | current HEAD | yes |", 1)
				writePhaseFixture(t, phasePath, contents)
				writePhaseFixture(t, filepath.Join(root, "docs", "phase-evidence", "PH00-window.md"), "**Status:** pending\n**Owner:** product owner\n**Revision:** fixture\n**Date:** 2026-07-21\n")
			},
			wantErr: "PH00-E01 evidence artifact is not verified or approved",
		},
	} {
		t.Run(testCase.name, func(t *testing.T) {
			root := newPhaseFixture(t)
			testCase.configure(t, root)
			runPhaseCLI(t, "scripts/trace.mjs", root)
			output := runPhaseCLIWithArgumentsFailure(t, "scripts/phase-complete-check.mjs", root, "00")
			if !strings.Contains(output, testCase.wantErr) {
				t.Fatalf("phase-complete-check output = %q, want %q", output, testCase.wantErr)
			}
		})
	}
}

// Proves: STORY-024-AC-5
// Both planning commands contain the inverse-coverage, hazard, low-context, test-strength, and skeptical-review gates.
func TestPlanningCommandsRequirePhaseAndStoryCompletenessGates(t *testing.T) {
	repositoryRoot := storyEightRepositoryRoot(t)
	for path, required := range map[string][]string{
		".claude/commands/plan-phase-stories-creation.md": {
			"inverse coverage matrix", "temporal/adversarial hazard", "low-context implementation packet",
			"external consumer", "passing-but-incomplete", "Reject L stories",
		},
		".claude/commands/plan-user-story-implementation.md": {
			"phase_requirements", "Satisfies:", "reader", "writer", "lifecycle boundary",
			"mutate-before-transition", "deferred completion ordering", "sibling consumption",
			"final user-visible postcondition", "exceeds M",
		},
		".agents/skills/plan-phase-stories-creation/SKILL.md": {
			"canonical workflow", "phase requirement", "inverse coverage", "temporal/adversarial",
			"low-context", "Satisfies:", "reject L",
		},
		".agents/skills/plan-user-story-implementation/SKILL.md": {
			"canonical workflow", "phase_requirements", "Satisfies:", "reader", "writer",
			"lifecycle boundary", "sibling consumer", "S/M",
		},
	} {
		contents := readToolchainFile(t, repositoryRoot, path)
		for _, marker := range required {
			if !strings.Contains(contents, marker) {
				t.Errorf("%s omits planning-quality gate %q", path, marker)
			}
		}
	}
}

// Proves: STORY-024-AC-6
// The repository migration is structurally complete, Phase 00 is proven, and Phase 01 reports its real remaining blockers.
func TestRepositoryPhaseMigrationIsCompleteAndTruthful(t *testing.T) {
	repositoryRoot := storyEightRepositoryRoot(t)
	runPhaseCLI(t, "scripts/phase-check.mjs", repositoryRoot)
	t.Run("Phase 00 is complete", func(t *testing.T) {
		runPhaseCLIWithArguments(t, "scripts/phase-complete-check.mjs", repositoryRoot, "00")
	})

	t.Run("Phase 01 reports the exact current blocker set", func(t *testing.T) {
		output := runPhaseCLIWithArgumentsFailure(t, "scripts/phase-complete-check.mjs", repositoryRoot, "01")
		for _, blocker := range []string{
			"PH01-E06 current-host exception revision is stale",
			"PH01-E07 visual approval must be explicitly approved",
			"PH01-E08 network trace must be verified",
			"acceptance criterion is not proven by a done story",
		} {
			if !strings.Contains(output, blocker) {
				t.Errorf("Phase 01 completion output = %q, want blocker %q", output, blocker)
			}
		}
	})
}

// Proves: STORY-025-AC-1
// The checked-in mutable record has the versioned PH01-X01 resolution and exact preview checkpoint.
func TestRepositoryPhase01ResolutionHasVersionedConflictAndPreviewCheckpoint(t *testing.T) {
	runPhaseCLI(t, "scripts/phase-resolution.mjs", storyEightRepositoryRoot(t))

	for _, testCase := range []struct {
		name    string
		mutate  func(string) string
		wantErr string
	}{
		{
			name: "invalid schema",
			mutate: func(contents string) string {
				return strings.Replace(contents, "schema: gomarkedit.phase-resolution", "schema: other-resolution", 1)
			},
			wantErr: "schema must be \"gomarkedit.phase-resolution\"",
		},
		{
			name: "invalid version",
			mutate: func(contents string) string {
				return strings.Replace(contents, "version: 1", "version: 2", 1)
			},
			wantErr: "version must be \"1\"",
		},
		{
			name: "invalid phase",
			mutate: func(contents string) string {
				return strings.Replace(contents, "phase: \"01\"", "phase: \"02\"", 1)
			},
			wantErr: "phase must be \"01\"",
		},
	} {
		t.Run(testCase.name, func(t *testing.T) {
			output := runPhaseCLIFailure(t, "scripts/phase-resolution.mjs", phase01ResolutionFixture(t, testCase.mutate))
			if !strings.Contains(output, testCase.wantErr) {
				t.Fatalf("phase-resolution output = %q, want %q", output, testCase.wantErr)
			}
		})
	}
}

// Proves: STORY-025-AC-2
// The checked-in mutable record has the exact editing checkpoint and requires preview first.
func TestRepositoryPhase01ResolutionHasExactEditingCheckpointAndPrerequisite(t *testing.T) {
	runPhaseCLI(t, "scripts/phase-resolution.mjs", storyEightRepositoryRoot(t))
}

// Proves: STORY-025-AC-3
// The checked-in mutable record enumerates every shared requirement, transition, contract, edge, and evidence ID.
func TestRepositoryPhase01ResolutionEnumeratesFullCompletionIDs(t *testing.T) {
	runPhaseCLI(t, "scripts/phase-resolution.mjs", storyEightRepositoryRoot(t))

	for _, testCase := range []struct {
		name    string
		mutate  func(string) string
		wantErr string
	}{
		{
			name: "wrong shared requirement",
			mutate: func(contents string) string {
				return strings.Replace(contents, "shared_requirements: [PH01-R15]", "shared_requirements: [PH01-R14]", 1)
			},
			wantErr: "full_completion.shared_requirements has unsupported values: PH01-R14",
		},
		{
			name: "missing shared requirement",
			mutate: func(contents string) string {
				return strings.Replace(contents, "shared_requirements: [PH01-R15]", "shared_requirements: []", 1)
			},
			wantErr: "full_completion.shared_requirements is missing values: PH01-R15",
		},
		{
			name: "wrong transition set",
			mutate: func(contents string) string {
				return strings.Replace(contents, "PH01-T07]", "PH01-T99]", 1)
			},
			wantErr: "full_completion.required_ids.transitions has unsupported values: PH01-T99",
		},
		{
			name: "missing transition set member",
			mutate: func(contents string) string {
				return strings.Replace(contents, ", PH01-T07]", "]", 1)
			},
			wantErr: "full_completion.required_ids.transitions is missing values: PH01-T07",
		},
		{
			name: "wrong contract set",
			mutate: func(contents string) string {
				return strings.Replace(contents, "PH01-C06]", "PH01-C99]", 1)
			},
			wantErr: "full_completion.required_ids.contracts has unsupported values: PH01-C99",
		},
		{
			name: "missing contract set member",
			mutate: func(contents string) string {
				return strings.Replace(contents, ", PH01-C06]", "]", 1)
			},
			wantErr: "full_completion.required_ids.contracts is missing values: PH01-C06",
		},
		{
			name: "wrong edge-case set",
			mutate: func(contents string) string {
				return strings.Replace(contents, "EC-DOCS-12", "EC-DOCS-99", 1)
			},
			wantErr: "full_completion.required_ids.edge_cases has unsupported values: EC-DOCS-99",
		},
		{
			name: "missing edge-case set member",
			mutate: func(contents string) string {
				return strings.Replace(contents, "EC-DOCS-12, ", "", 1)
			},
			wantErr: "full_completion.required_ids.edge_cases is missing values: EC-DOCS-12",
		},
		{
			name: "wrong evidence set",
			mutate: func(contents string) string {
				return strings.Replace(contents, "PH01-E11]", "PH01-E99]", 1)
			},
			wantErr: "full_completion.required_ids.evidence has unsupported values: PH01-E99",
		},
		{
			name: "missing evidence set member",
			mutate: func(contents string) string {
				return strings.Replace(contents, ", PH01-E11]", "]", 1)
			},
			wantErr: "full_completion.required_ids.evidence is missing values: PH01-E11",
		},
	} {
		t.Run(testCase.name, func(t *testing.T) {
			output := runPhaseCLIFailure(t, "scripts/phase-resolution.mjs", phase01ResolutionFixture(t, testCase.mutate))
			if !strings.Contains(output, testCase.wantErr) {
				t.Fatalf("phase-resolution output = %q, want %q", output, testCase.wantErr)
			}
		})
	}
}

// Proves: STORY-025-AC-4
// Invalid membership, partitioning, and ordering fixtures are rejected by the policy validator.
func TestPhase01ResolutionRejectsInvalidRequirementPartitions(t *testing.T) {
	for _, testCase := range []struct {
		name    string
		mutate  func(string) string
		wantErr string
	}{
		{
			name: "unknown requirement",
			mutate: func(contents string) string {
				return strings.Replace(contents, "PH01-R16]", "PH01-R16, PH01-R99]", 1)
			},
			wantErr: "checkpoints.preview.requirements has unsupported values: PH01-R99",
		},
		{
			name: "duplicate membership",
			mutate: func(contents string) string {
				return strings.Replace(contents, "PH01-R02,", "PH01-R02, PH01-R02,", 1)
			},
			wantErr: "checkpoints.preview.requirements has duplicate values: PH01-R02",
		},
		{
			name: "overlap between checkpoints",
			mutate: func(contents string) string {
				return strings.Replace(contents, "[PH01-R03, PH01-R04", "[PH01-R01, PH01-R04", 1)
			},
			wantErr: "checkpoints.editing.requirements has unsupported values: PH01-R01",
		},
		{
			name: "omission from checkpoint partition",
			mutate: func(contents string) string {
				return strings.Replace(contents, ", PH01-R16]", "]", 1)
			},
			wantErr: "checkpoints.preview.requirements is missing values: PH01-R16",
		},
		{
			name: "shared requirement placed in checkpoint",
			mutate: func(contents string) string {
				return strings.Replace(contents, "PH01-R16]", "PH01-R15]", 1)
			},
			wantErr: "checkpoints.preview.requirements has unsupported values: PH01-R15",
		},
		{
			name: "editing without preview prerequisite",
			mutate: func(contents string) string {
				return strings.Replace(contents, "prerequisites: [preview]", "prerequisites: []", 1)
			},
			wantErr: "checkpoints.editing.prerequisites is missing values: preview",
		},
	} {
		t.Run(testCase.name, func(t *testing.T) {
			root := phase01ResolutionFixture(t, testCase.mutate)
			output := runPhaseCLIFailure(t, "scripts/phase-resolution.mjs", root)
			if !strings.Contains(output, testCase.wantErr) {
				t.Fatalf("phase-resolution output = %q, want %q", output, testCase.wantErr)
			}
		})
	}
}

// Proves: STORY-025-AC-5
// The checked-in record has the exact PH01-E06 policy, rejecting generic waivers and policies for other evidence rows.
func TestRepositoryPhase01ResolutionDefinesExactE06ExceptionPolicySchema(t *testing.T) {
	runPhaseCLI(t, "scripts/phase-resolution.mjs", storyEightRepositoryRoot(t))

	for _, field := range []string{
		"host", "revision", "freshness", "procedure", "result", "limitations", "deferred_platforms", "accepted_adr", "expires_before",
	} {
		t.Run("missing required policy field "+field, func(t *testing.T) {
			output := runPhaseCLIFailure(t, "scripts/phase-resolution.mjs", phase01ResolutionFixture(t, func(contents string) string {
				return removePhaseResolutionListItem(contents, field)
			}))
			wantErr := "exception_policies.PH01-E06.required_record_fields is missing values: " + field
			if !strings.Contains(output, wantErr) {
				t.Fatalf("phase-resolution output = %q, want %q", output, wantErr)
			}
		})
	}

	for _, testCase := range []struct {
		name    string
		mutate  func(string) string
		wantErr string
	}{
		{
			name: "generic waiver kind",
			mutate: func(contents string) string {
				return strings.Replace(contents, "kind: current-host-native", "kind: generic-waiver", 1)
			},
			wantErr: "exception_policies.PH01-E06.kind must be \"current-host-native\"",
		},
		{
			name: "policy assigned to another evidence row",
			mutate: func(contents string) string {
				return strings.Replace(contents, "  PH01-E06:\n", "  PH01-E07:\n", 1)
			},
			wantErr: "exception_policies has unsupported keys: PH01-E07",
		},
		{
			name: "wrong accepted ADR",
			mutate: func(contents string) string {
				return strings.Replace(contents, "    accepted_adr: ADR-0016\n    required_record_fields", "    accepted_adr: ADR-9999\n    required_record_fields", 1)
			},
			wantErr: "exception_policies.PH01-E06.accepted_adr must be \"ADR-0016\"",
		},
		{
			name: "wrong deferred platform set",
			mutate: func(contents string) string {
				return strings.Replace(contents, "allowed_deferred_platforms: [windows, linux]", "allowed_deferred_platforms: [windows, macos]", 1)
			},
			wantErr: "exception_policies.PH01-E06.allowed_deferred_platforms has unsupported values: macos",
		},
		{
			name: "wrong expiry boundary",
			mutate: func(contents string) string {
				return strings.Replace(contents, "expiry_boundary: before-phase15-release-or-platform-claim", "expiry_boundary: never", 1)
			},
			wantErr: "exception_policies.PH01-E06.expiry_boundary must be \"before-phase15-release-or-platform-claim\"",
		},
		{
			name: "stage certification field",
			mutate: func(contents string) string {
				return strings.Replace(contents, "    expiry_boundary: before-phase15-release-or-platform-claim\n", "    expiry_boundary: before-phase15-release-or-platform-claim\n    certifies_stage: stage\n", 1)
			},
			wantErr: "exception_policies.PH01-E06 has unsupported keys: certifies_stage",
		},
		{
			name: "release certification field",
			mutate: func(contents string) string {
				return strings.Replace(contents, "    expiry_boundary: before-phase15-release-or-platform-claim\n", "    expiry_boundary: before-phase15-release-or-platform-claim\n    certifies_release: release\n", 1)
			},
			wantErr: "exception_policies.PH01-E06 has unsupported keys: certifies_release",
		},
		{
			name: "platform certification field",
			mutate: func(contents string) string {
				return strings.Replace(contents, "    expiry_boundary: before-phase15-release-or-platform-claim\n", "    expiry_boundary: before-phase15-release-or-platform-claim\n    certifies_platform: platform\n", 1)
			},
			wantErr: "exception_policies.PH01-E06 has unsupported keys: certifies_platform",
		},
	} {
		t.Run(testCase.name, func(t *testing.T) {
			root := phase01ResolutionFixture(t, testCase.mutate)
			output := runPhaseCLIFailure(t, "scripts/phase-resolution.mjs", root)
			if !strings.Contains(output, testCase.wantErr) {
				t.Fatalf("phase-resolution output = %q, want %q", output, testCase.wantErr)
			}
		})
	}
}

// Proves: STORY-025-AC-6
// Policy records must resolve PH01-X01 without replacing frozen sources; missing and malformed records are rejected.
func TestPhase01ResolutionRejectsUnresolvedOrSourceReplacingPolicyRecords(t *testing.T) {
	runPhaseCLI(t, "scripts/phase-resolution.mjs", storyEightRepositoryRoot(t))

	for _, testCase := range []struct {
		name    string
		root    func(*testing.T) string
		wantErr string
	}{
		{
			name: "unresolved conflict",
			root: func(t *testing.T) string {
				return phase01ResolutionFixture(t, func(contents string) string {
					return strings.Replace(contents, "status: resolved", "status: unresolved", 1)
				})
			},
			wantErr: "conflicts.PH01-X01.status must be \"resolved\"",
		},
		{
			name: "claims to replace frozen source",
			root: func(t *testing.T) string {
				return phase01ResolutionFixture(t, func(contents string) string {
					return strings.Replace(contents, "phase: \"01\"\n", "phase: \"01\"\nsource_authority: replaces-frozen\n", 1)
				})
			},
			wantErr: "resolution has unsupported keys: source_authority",
		},
		{
			name: "missing record",
			root: func(t *testing.T) string {
				return t.TempDir()
			},
			wantErr: "unable to read docs/phase-resolutions/PH01.yaml",
		},
		{
			name: "malformed record",
			root: func(t *testing.T) string {
				return phase01ResolutionFixture(t, func(string) string {
					return "schema: gomarkedit.phase-resolution\n\tversion: 1\n"
				})
			},
			wantErr: "tabs are not supported",
		},
	} {
		t.Run(testCase.name, func(t *testing.T) {
			output := runPhaseCLIFailure(t, "scripts/phase-resolution.mjs", testCase.root(t))
			if !strings.Contains(output, testCase.wantErr) {
				t.Fatalf("phase-resolution output = %q, want %q", output, testCase.wantErr)
			}
		})
	}

	for _, testCase := range []struct {
		name       string
		resolution string
		wantErr    string
	}{
		{
			name:       "completion checker retains unresolved conflict when record is missing",
			resolution: "",
			wantErr:    "PH01 resolution: unable to read docs/phase-resolutions/PH01.yaml",
		},
		{
			name:       "completion checker retains unresolved conflict when record is malformed",
			resolution: "schema: gomarkedit.phase-resolution\n\tversion: 1\n",
			wantErr:    "PH01 resolution: line 2: tabs are not supported",
		},
	} {
		t.Run(testCase.name, func(t *testing.T) {
			output := runPhaseCLIWithArgumentsFailure(t, "scripts/phase-complete-check.mjs", phase01CompletionFixture(t, testCase.resolution), "01")
			for _, wantErr := range []string{testCase.wantErr, "PH01-X01 is an unresolved specification conflict"} {
				if !strings.Contains(output, wantErr) {
					t.Fatalf("phase-complete-check output = %q, want %q", output, wantErr)
				}
			}
		})
	}
}

// Proves: STORY-026-AC-1
// The repository resolution drives distinct preview and editing checkpoint commands, with editing dependent on preview.
func TestRepositoryPhase01ResolutionDrivesCheckpointValidation(t *testing.T) {
	root := storyEightRepositoryRoot(t)
	runPhaseCLIWithArguments(t, "scripts/phase-complete-check.mjs", root, "01", "--checkpoint", "preview")
	runPhaseCLIWithArguments(t, "scripts/phase-complete-check.mjs", root, "01", "--checkpoint", "editing")
}

// Proves: STORY-026-AC-2
// Full Phase 01 completion remains stricter than either implementation checkpoint.
func TestPhase01FullCompletionRemainsStrongerThanCheckpoints(t *testing.T) {
	root := storyEightRepositoryRoot(t)
	output := runPhaseCLIWithArgumentsFailure(t, "scripts/phase-complete-check.mjs", root, "01")
	if !strings.Contains(output, "PH01-E06") {
		t.Fatalf("full completion output = %q, want durable-evidence failure", output)
	}
}

// Proves: STORY-026-AC-3
// Every transition and contract has its decision-complete explicit acceptance-criterion mapping.
func TestRepositoryPhase01ResolutionHasExactTransitionAndContractACCoverage(t *testing.T) {
	runPhaseCLI(t, "scripts/phase-resolution.mjs", storyEightRepositoryRoot(t))
	for _, testCase := range []struct {
		name, old, new string
	}{
		{"missing transition", "    PH01-T07:\n", ""},
		{"duplicate mapped AC", "STORY-011-AC-1, STORY-012-AC-2", "STORY-011-AC-1, STORY-011-AC-1"},
	} {
		t.Run(testCase.name, func(t *testing.T) {
			root := phase01ResolutionFixture(t, func(contents string) string { return strings.Replace(contents, testCase.old, testCase.new, 1) })
			output := runPhaseCLIFailure(t, "scripts/phase-resolution.mjs", root)
			if output == "" {
				t.Fatalf("phase-resolution output = %q, want coverage validation", output)
			}
		})
	}
}

// Proves: STORY-026-AC-4
// Edge nodes and exit evidence rows use exact collected identities and supplemental evidence metadata.
func TestRepositoryPhase01ResolutionResolvesExactEdgeNodesAndEvidenceScope(t *testing.T) {
	runPhaseCLI(t, "scripts/phase-resolution.mjs", storyEightRepositoryRoot(t))
	root := phase01ResolutionFixture(t, func(contents string) string {
		return strings.Replace(contents, "frontend/e2e/core-editor.test.ts::", "frontend/e2e/core-editor.test.ts:", 1)
	})
	output := runPhaseCLIFailure(t, "scripts/phase-resolution.mjs", root)
	if !strings.Contains(output, "path::full test name") {
		t.Fatalf("phase-resolution output = %q, want edge identity validation", output)
	}
}

// Proves: STORY-026-AC-5
// Only the ADR-0016 current-host PH01-E06 exception record is accepted.
func TestPhase01CompletionValidatesNarrowE06CurrentHostException(t *testing.T) {
	fixture := completePhase01Fixture(t)
	runPhaseCLIWithArguments(t, "scripts/phase-complete-check.mjs", fixture, "01")
	artifact := filepath.Join(fixture, "docs", "phase-evidence", "PH01-wails-runtime.md")
	writePhaseFixture(t, artifact, strings.Replace(readPhaseFixture(t, artifact), "Freshness:** exact-revision", "Freshness:** stale", 1))
	output := runPhaseCLIWithArgumentsFailure(t, "scripts/phase-complete-check.mjs", fixture, "01")
	if !strings.Contains(output, "freshness must be exact-revision") {
		t.Fatalf("full checker output = %q", output)
	}
	fixture = completePhase01Fixture(t)
	artifact = filepath.Join(fixture, "docs", "phase-evidence", "PH01-wails-runtime.md")
	writePhaseFixture(t, artifact, strings.Replace(readPhaseFixture(t, artifact), "Revision:** ", "Revision:** stale-", 1))
	output = runPhaseCLIWithArgumentsFailure(t, "scripts/phase-complete-check.mjs", fixture, "01")
	if !strings.Contains(output, "revision is stale") {
		t.Fatalf("full checker output = %q", output)
	}

	root := storyEightRepositoryRoot(t)
	output = runPhaseCLIWithArgumentsFailure(t, "scripts/phase-complete-check.mjs", root, "01")
	if !strings.Contains(output, "PH01-E06") {
		t.Fatalf("full completion output = %q, want PH01-E06 validation", output)
	}
	root = phase01ResolutionFixture(t, func(contents string) string {
		return strings.Replace(contents, "accepted_adr: ADR-0016", "accepted_adr: ADR-9999", 1)
	})
	output = runPhaseCLIFailure(t, "scripts/phase-resolution.mjs", root)
	if !strings.Contains(output, "accepted_adr") {
		t.Fatalf("phase-resolution output = %q, want invalid E06 policy", output)
	}
}

// Proves: STORY-026-AC-6
// Adversarial coverage, partition, exception, revision, and conflict fixtures reject borrowed or stale proof.
func TestPhase01CompletionRejectsAdversarialCoverageFixtures(t *testing.T) {
	for _, testCase := range []struct{ name, old, new string }{
		{"missing row", "    PH01-T07:\n", ""},
		{"incomplete checkpoint partition", "PH01-R16]", "]"},
		{"invalid E06 ADR", "accepted_adr: ADR-0016", "accepted_adr: ADR-9999"},
		{"unresolved conflict", "status: resolved", "status: unresolved"},
		{"unresolved edge identity", "frontend/e2e/core-editor.test.ts::", "frontend/e2e/core-editor.test.ts:"},
	} {
		t.Run(testCase.name, func(t *testing.T) {
			root := phase01ResolutionFixture(t, func(contents string) string { return strings.Replace(contents, testCase.old, testCase.new, 1) })
			if output := runPhaseCLIFailure(t, "scripts/phase-resolution.mjs", root); output == "" {
				t.Fatal("expected adversarial fixture to fail")
			}
		})
	}
	for _, testCase := range []struct {
		name    string
		mutate  func(string, string) (string, string)
		wantErr string
	}{
		{
			name: "borrowed requirement coverage",
			mutate: func(resolution, artifact string) (string, string) {
				return strings.Replace(resolution, "requirements: [PH01-R01, PH01-R02]", "requirements: [PH01-R01]", 1), artifact
			},
			wantErr: "PH01 coverage acceptance-criterion mapping differs",
		},
		{
			name: "unrelated acceptance criterion",
			mutate: func(resolution, artifact string) (string, string) {
				return strings.Replace(resolution, "STORY-011-AC-1, STORY-012-AC-2", "STORY-016-AC-6, STORY-012-AC-2", 1), artifact
			},
			wantErr: "PH01 coverage acceptance-criterion mapping differs",
		},
		{
			name: "stale E06 revision",
			mutate: func(resolution, artifact string) (string, string) {
				return resolution, strings.Replace(artifact, "Revision:** ", "Revision:** stale-", 1)
			},
			wantErr: "PH01-E06 current-host exception revision is stale",
		},
	} {
		t.Run(testCase.name, func(t *testing.T) {
			root := completePhase01Fixture(t)
			resolutionPath := filepath.Join(root, "docs", "phase-resolutions", "PH01.yaml")
			artifactPath := filepath.Join(root, "docs", "phase-evidence", "PH01-wails-runtime.md")
			resolution, artifact := testCase.mutate(readPhaseFixture(t, resolutionPath), readPhaseFixture(t, artifactPath))
			writePhaseFixture(t, resolutionPath, resolution)
			writePhaseFixture(t, artifactPath, artifact)
			output := runPhaseCLIWithArgumentsFailure(t, "scripts/phase-complete-check.mjs", root, "01")
			if !strings.Contains(output, testCase.wantErr) {
				t.Fatalf("full checker output = %q, want %q", output, testCase.wantErr)
			}
		})
	}
}

// Proves: STORY-026-AC-3
// A complete isolated PH01 fixture proves row AC unions and rejects borrowed or unrelated row coverage.
func TestPhase01CompleteFixtureValidatesExactCoverage(t *testing.T) {
	root := completePhase01Fixture(t)
	runPhaseCLIWithArguments(t, "scripts/phase-complete-check.mjs", root, "01")
	for _, mutation := range []func(string) string{
		func(s string) string {
			return strings.Replace(s, "requirements: [PH01-R01, PH01-R02]", "requirements: [PH01-R01]", 1)
		},
		func(s string) string {
			return strings.Replace(s, "STORY-011-AC-1, STORY-012-AC-2", "STORY-016-AC-6, STORY-012-AC-2", 1)
		},
	} {
		fixture := completePhase01Fixture(t)
		path := filepath.Join(fixture, "docs", "phase-resolutions", "PH01.yaml")
		writePhaseFixture(t, path, mutation(readPhaseFixture(t, path)))
		output := runPhaseCLIWithArgumentsFailure(t, "scripts/phase-complete-check.mjs", fixture, "01")
		if !strings.Contains(output, "PH01-T01") {
			t.Fatalf("full checker output = %q", output)
		}
	}
}

// Proves: STORY-026-AC-4
// A complete isolated PH01 fixture resolves exact edge test identities and rejects an unresolved identity.
func TestPhase01CompleteFixtureValidatesEdgeIdentities(t *testing.T) {
	root := completePhase01Fixture(t)
	runPhaseCLIWithArguments(t, "scripts/phase-complete-check.mjs", root, "01")
	path := filepath.Join(root, "docs", "phase-resolutions", "PH01.yaml")
	writePhaseFixture(t, path, strings.Replace(readPhaseFixture(t, path), "frontend/e2e/core-editor.test.ts::", "frontend/e2e/missing.test.ts::", 1))
	output := runPhaseCLIWithArgumentsFailure(t, "scripts/phase-complete-check.mjs", root, "01")
	if !strings.Contains(output, "unresolved edge evidence") {
		t.Fatalf("full checker output = %q", output)
	}
}

// Proves: STORY-032-AC-1
// PH01-E06 accepts only an exact current-host native record under the ADR-0016 exception.
func TestPhase01E06ArtifactProvesCurrentHostRuntimeUnderAcceptedException(t *testing.T) {
	fixture := completePhase01Fixture(t)
	runPhaseCLIWithArguments(t, "scripts/phase-complete-check.mjs", fixture, "01")

	artifact := filepath.Join(fixture, "docs", "phase-evidence", "PH01-wails-runtime.md")
	writePhaseFixture(t, artifact, strings.Replace(readPhaseFixture(t, artifact), "Accepted ADR:** ADR-0016", "Accepted ADR:** ADR-9999", 1))
	output := runPhaseCLIWithArgumentsFailure(t, "scripts/phase-complete-check.mjs", fixture, "01")
	if !strings.Contains(output, "accepted ADR must be ADR-0016") {
		t.Fatalf("full checker output = %q, want ADR-0016 rejection", output)
	}
}

// Proves: STORY-032-AC-2
// PH01-E08 requires a revision-bound dedicated-host capture with zero attempted and observed outbound activity.
func TestPhase01E08ArtifactProvesZeroStage1AndStage2OutboundActivity(t *testing.T) {
	fixture := completePhase01Fixture(t)
	artifact := filepath.Join(fixture, "docs", "phase-evidence", "PH01-network-trace.md")
	writePhaseFixture(t, artifact, "**Status:** verified\n**Owner:** security reviewer\n**Revision:** fixture\n**Date:** 2026-07-22\n")
	output := runPhaseCLIWithArgumentsFailure(t, "scripts/phase-complete-check.mjs", fixture, "01")
	if !strings.Contains(output, "PH01-E08 network trace is missing capture window") {
		t.Fatalf("full checker output = %q, want detailed network-record rejection", output)
	}
}

// Proves: STORY-032-AC-4
// Full completion consumes the authoritative version-1 coverage rows for transitions, contracts, edges, and E01–E11.
func TestPhase01AutomatedExitEvidenceConsumesAuthoritativeRowMap(t *testing.T) {
	fixture := completePhase01Fixture(t)
	runPhaseCLIWithArguments(t, "scripts/phase-complete-check.mjs", fixture, "01")

	resolution := filepath.Join(fixture, "docs", "phase-resolutions", "PH01.yaml")
	writePhaseFixture(t, resolution, strings.Replace(readPhaseFixture(t, resolution), "    PH01-E11:\n", "    PH01-E12:\n", 1))
	output := runPhaseCLIWithArgumentsFailure(t, "scripts/phase-complete-check.mjs", fixture, "01")
	if !strings.Contains(output, "PH01 coverage acceptance-criterion mapping differs") {
		t.Fatalf("full checker output = %q, want authoritative-row-map rejection", output)
	}
}

// Proves: STORY-032-AC-5
// Preview then editing are implementation checkpoints only; full completion cannot replace their ordered obligations.
func TestPhase01CheckpointAndFullGateEvidenceOrder(t *testing.T) {
	fixture := completePhase01Fixture(t)
	runPhaseCLIWithArguments(t, "scripts/phase-complete-check.mjs", fixture, "01", "--checkpoint", "preview")
	runPhaseCLIWithArguments(t, "scripts/phase-complete-check.mjs", fixture, "01", "--checkpoint", "editing")

	artifact := filepath.Join(fixture, "docs", "phase-evidence", "PH01-visual-approval.md")
	writePhaseFixture(t, artifact, strings.Replace(readPhaseFixture(t, artifact), "Status:** approved", "Status:** pending", 1))
	output := runPhaseCLIWithArgumentsFailure(t, "scripts/phase-complete-check.mjs", fixture, "01")
	if !strings.Contains(output, "PH01-E07 visual approval must be explicitly approved") {
		t.Fatalf("full checker output = %q, want full gate to reject pending human evidence", output)
	}

	fixture = completePhase01Fixture(t)
	entries, err := os.ReadDir(filepath.Join(fixture, "docs", "stories"))
	if err != nil {
		t.Fatal(err)
	}
	for _, entry := range entries {
		if !strings.HasSuffix(entry.Name(), ".md") || entry.Name() == "README.md" {
			continue
		}
		path := filepath.Join(fixture, "docs", "stories", entry.Name())
		contents := readPhaseFixture(t, path)
		writePhaseFixture(t, path, regexp.MustCompile(`(?m)^status: .*`).ReplaceAllString(contents, "status: draft"))
	}
	output = runPhaseCLIWithArgumentsFailure(t, "scripts/phase-complete-check.mjs", fixture, "01")
	if !strings.Contains(output, "full gate requires logical preview checkpoint evaluation before editing") {
		t.Fatalf("full checker output = %q, want preview-before-editing failure", output)
	}
}

// Proves: STORY-032-AC-6
// Evidence audit rejects stale/incomplete records, absent approval, non-zero network activity, and overbroad claims.
func TestPhase01EvidenceAuditRejectsStaleIncompleteOrOverbroadClaims(t *testing.T) {
	for _, testCase := range []struct {
		name     string
		artifact string
		old, new string
		wantErr  string
	}{
		{"stale visual revision", "PH01-visual-approval.md", "Revision:** ", "Revision:** stale-", "PH01-E07 visual approval revision is stale"},
		{"missing visual owner", "PH01-visual-approval.md", "Owner:** product owner", "Owner:** ", "PH01-E07 visual approval is missing owner"},
		{"missing visual candidate", "PH01-visual-approval.md", "Candidate screenshot:** frontend/e2e/core-editor-snapshots/core-editor-split-1280.png", "Candidate screenshot:** test-results/missing.png", "PH01-E07 visual approval candidate screenshot does not exist"},
		{"non-zero attempted network", "PH01-network-trace.md", "Attempted outbound activity:** 0", "Attempted outbound activity:** 1", "PH01-E08 network trace attempted outbound activity must be 0"},
		{"non-zero observed network", "PH01-network-trace.md", "Observed outbound activity:** 0", "Observed outbound activity:** 1", "PH01-E08 network trace observed outbound activity must be 0"},
		{"capture digest mismatch", "PH01-network-trace.md", "Capture artifact digest:** e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855", "Capture artifact digest:** 0000000000000000000000000000000000000000000000000000000000000000", "PH01-E08 network trace capture artifact digest does not match"},
		{"overbroad native claim", "PH01-wails-runtime.md", "Limitations:** current host only", "Limitations:** certifies release platform matrix", "PH01-E06 current-host exception limitations make an overbroad claim"},
	} {
		t.Run(testCase.name, func(t *testing.T) {
			fixture := completePhase01Fixture(t)
			artifact := filepath.Join(fixture, "docs", "phase-evidence", testCase.artifact)
			writePhaseFixture(t, artifact, strings.Replace(readPhaseFixture(t, artifact), testCase.old, testCase.new, 1))
			output := runPhaseCLIWithArgumentsFailure(t, "scripts/phase-complete-check.mjs", fixture, "01")
			if !strings.Contains(output, testCase.wantErr) {
				t.Fatalf("full checker output = %q, want %q", output, testCase.wantErr)
			}
		})
	}
}

func completePhase01Fixture(t *testing.T) string {
	t.Helper()
	source := storyEightRepositoryRoot(t)
	root := t.TempDir()
	if err := os.MkdirAll(filepath.Join(root, "docs"), 0o700); err != nil {
		t.Fatal(err)
	}
	for _, item := range []string{"specification", "docs/stories", "docs/phase-resolutions"} {
		if output, err := exec.Command("cp", "-R", filepath.Join(source, item), filepath.Join(root, filepath.Dir(item))).CombinedOutput(); err != nil {
			t.Fatalf("copy %s: %v: %s", item, err, output)
		}
	}
	writePhaseFixture(t, filepath.Join(root, "justfile"), readPhaseFixture(t, filepath.Join(source, "justfile")))
	coverage := readPhaseFixture(t, filepath.Join(root, "docs", "phase-resolutions", "PH01.yaml"))
	ids := map[string]bool{}
	for _, id := range regexp.MustCompile(`STORY-\d{3}-AC-\d+`).FindAllString(coverage, -1) {
		ids[id[:9]] = true
	}
	entries, err := os.ReadDir(filepath.Join(root, "docs", "stories"))
	if err != nil {
		t.Fatal(err)
	}
	board := map[string]string{}
	var proving strings.Builder
	seen := map[string]bool{}
	for _, entry := range entries {
		if !strings.HasSuffix(entry.Name(), ".md") || entry.Name() == "README.md" {
			continue
		}
		path := filepath.Join(root, "docs", "stories", entry.Name())
		contents := readPhaseFixture(t, path)
		match := regexp.MustCompile(`(?m)^id: (STORY-\d{3})$`).FindStringSubmatch(contents)
		if len(match) == 0 {
			continue
		}
		status := "draft"
		if ids[match[1]] {
			status = "done"
			for _, ac := range regexp.MustCompile(`STORY-\d{3}-AC-\d+`).FindAllString(contents, -1) {
				if !seen[ac] {
					seen[ac] = true
					fmt.Fprintf(&proving, "// Proves: %s\nfunc Test%s(t *testing.T) {}\n\n", ac, strings.ReplaceAll(ac, "-", ""))
				}
			}
		}
		contents = regexp.MustCompile(`(?m)^status: .*`).ReplaceAllString(contents, "status: "+status)
		writePhaseFixture(t, path, contents)
		board[match[1]] = status
	}
	writeTraceFixtureBoard(t, root, board)
	writePhaseFixture(t, filepath.Join(root, "internal", "application", "proof_test.go"), "package application\n\nimport \"testing\"\n\n"+proving.String())
	for _, match := range regexp.MustCompile(`"([^\"]+::[^\"]+)"`).FindAllStringSubmatch(coverage, -1) {
		parts := strings.SplitN(match[1], "::", 2)
		path := filepath.Join(root, parts[0])
		contents := ""
		if _, err := os.Stat(path); err == nil {
			contents = readPhaseFixture(t, path)
		}
		writePhaseFixture(t, path, contents+"test('"+parts[1]+"', () => {});\n")
	}
	writePhaseFixture(t, filepath.Join(root, "docs", "phase-evidence", "PH01-wails-runtime.md"), "**Status:** verified\n**Owner:** tester\n**Date:** 2026-07-22\n**Host:** "+runtime.GOOS+"\n**Revision:** fixture\n**Freshness:** exact-revision\n**Procedure:** native run\n**Result:** passed\n**Limitations:** current host only\n**Deferred platforms:** windows, linux\n**Accepted ADR:** ADR-0016\n**Expires before:** before-phase15-release-or-platform-claim\n")
	writePhaseFixture(t, filepath.Join(root, "docs", "phase-evidence", "PH01-visual-approval.md"), "**Status:** approved\n**Owner:** product owner\n**Revision:** fixture\n**Date:** 2026-07-22\n**Candidate screenshot:** frontend/e2e/core-editor-snapshots/core-editor-split-1280.png\n**Viewport crop:** 1280x720\n**Responsive results:** 375, 768, and 1280 widths passed\n**Approval:** explicit approval by product owner for revision fixture and crop 1280x720\n")
	writePhaseFixture(t, filepath.Join(root, "frontend", "e2e", "core-editor-snapshots", "core-editor-split-1280.png"), "fixture candidate")
	writePhaseFixture(t, filepath.Join(root, "docs", "phase-evidence", "fixture.pcap"), "")
	writePhaseFixture(t, filepath.Join(root, "docs", "phase-evidence", "PH01-network-trace.md"), "**Status:** verified\n**Owner:** security reviewer\n**Revision:** fixture\n**Date:** 2026-07-22\n**Host:** fixture-host\n**Procedure:** packet capture during scripted native use\n**Capture window:** 2026-07-22T10:00:00Z to 2026-07-22T10:05:00Z\n**Capture PID:** 12345\n**Capture scope:** stage1-stage2-native-runtime\n**Rerun instructions:** repeat the documented clean-host packet capture procedure\n**Capture artifact location:** docs/phase-evidence/fixture.pcap\n**Capture artifact digest:** e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855\n**Attempted outbound activity:** 0\n**Observed outbound activity:** 0\n")
	for _, arguments := range [][]string{{"init"}, {"config", "user.email", "fixture@example.test"}, {"config", "user.name", "Fixture"}, {"add", "."}, {"commit", "-m", "fixture"}} {
		command := exec.Command("git", arguments...)
		command.Dir = root
		if output, err := command.CombinedOutput(); err != nil {
			t.Fatalf("git %v: %v: %s", arguments, err, output)
		}
	}
	command := exec.Command("git", "rev-parse", "HEAD")
	command.Dir = root
	revisionBytes, err := command.Output()
	if err != nil {
		t.Fatalf("fixture revision: %v", err)
	}
	artifact := filepath.Join(root, "docs", "phase-evidence", "PH01-wails-runtime.md")
	writePhaseFixture(t, artifact, strings.Replace(readPhaseFixture(t, artifact), "Revision:** fixture", "Revision:** "+strings.TrimSpace(string(revisionBytes)), 1))
	revision := strings.TrimSpace(string(revisionBytes))
	visualArtifact := filepath.Join(root, "docs", "phase-evidence", "PH01-visual-approval.md")
	visualContents := strings.Replace(readPhaseFixture(t, visualArtifact), "Revision:** fixture", "Revision:** "+revision, 1)
	visualContents = strings.Replace(visualContents, "revision fixture and crop", "revision "+revision+" and crop", 1)
	writePhaseFixture(t, visualArtifact, visualContents)
	networkArtifact := filepath.Join(root, "docs", "phase-evidence", "PH01-network-trace.md")
	networkContents := strings.Replace(readPhaseFixture(t, networkArtifact), "Revision:** fixture", "Revision:** "+revision, 1)
	writePhaseFixture(t, networkArtifact, networkContents)
	return root
}

func newPhaseFixture(t *testing.T) string {
	t.Helper()
	root := newTraceFixture(t)
	writePhaseFixture(t, filepath.Join(root, "specification", "07_Phases", "00_ROADMAP.md"), "# Roadmap\n")
	writePhaseFixture(t, filepath.Join(root, "specification", "06_Process_and_Traceability", "01_MODULE_INVENTORY.md"), "# Module Inventory\n\n| Module path | Purpose |\n|---|---|\n| `internal/application/` | fixture |\n")
	for phase := 0; phase <= 15; phase++ {
		phaseNumber := fmt.Sprintf("%02d", phase)
		contents := strings.ReplaceAll(validPhaseFixture(), "PH00", "PH"+phaseNumber)
		if phase > 0 {
			contents = strings.ReplaceAll(contents, "EC-DOCS-1", fmt.Sprintf("EC-FIXTURE-%d", phase+1))
		}
		writePhaseFixture(t, filepath.Join(root, "specification", "07_Phases", "PHASE_"+phaseNumber+"_FIXTURE.md"), contents)
	}
	return root
}

func validPhaseFixture() string {
	return "**Status:** Accepted\n" +
		"**Last Updated:** 2026-07-21\n\n" +
		"# Phase 00 — Fixture\n\n" +
		"## Goal\nFixture.\n\n" +
		"## Phase metadata\n\n" +
		"| Phase | Kind | Stage / milestone | Depends on | Completion scope |\n|---|---|---|---|---|\n" +
		"| PH00 | sequential | Stage 1 / M1 | none | once per implemented revision |\n\n" +
		"## Scope\nFixture capability.\n\n" +
		"## Out of scope\nOther capabilities.\n\n" +
		"## Requirement ledger\n\n" +
		"| ID | Required outcome | Source clauses | Constraints | Work package |\n|---|---|---|---|---|\n" +
		"| PH00-R01 | Provide the fixture capability. | fixture.md#valid-clause | DD-01; F1 | PH00-W01 |\n\n" +
		"## State and transition model\n\n" +
		"| ID | Trigger | Preconditions | Ordered behavior | Result | Failure / preservation | Requirements |\n|---|---|---|---|---|---|---|\n" +
		"| PH00-T01 | Start fixture | Repository is available | Validate; execute; acknowledge | Fixture is active | Preserve prior state on failure | PH00-R01 |\n\n" +
		"## Cross-phase contracts\n\n" +
		"| ID | Producer | Consumer | Interface / invariant | Availability / lifetime | Ordering / concurrency | Source | Requirements |\n|---|---|---|---|---|---|---|---|\n" +
		"| PH00-C01 | PH00 | PH01 | Stable fixture seam | Process lifetime | Serialized by intent | fixture.md#valid-clause | PH00-R01 |\n\n" +
		"## Edge and failure cases\n\n" +
		"| Edge case | Role | Source clause | Requirements | Expected behavior | Evidence |\n|---|---|---|---|---|---|\n" +
		"| EC-DOCS-1 | primary | fixture.md#valid-clause | PH00-R01 | Preserve the fixture state. | phase_validation_test.go::TestFixtureEdge (EC-DOCS-1) |\n\n" +
		"## Non-normative work packages\n\n" +
		"| ID | Capability | Size | Modules | Artifacts | Requirements | Depends on |\n|---|---|---|---|---|---|---|\n" +
		"| PH00-W01 | Deliver the fixture capability. | M | internal/application/ | scripts/ | PH00-R01 | none |\n\n" +
		"## Phase exit evidence\n\n" +
		"| ID | Requirements | Tier | Proof / artifact | Platform / scope | Owner | Freshness | Blocking |\n|---|---|---|---|---|---|---|---|\n" +
		"| PH00-E01 | PH00-R01 | automated | `go test ./...` | all | tester | current HEAD | yes |\n\n" +
		"## Clarification revision\nAdded durable planning context without changing product behavior.\n"
}

func writeCompletePhaseStory(t *testing.T, root, status string) {
	t.Helper()
	story := "---\n" +
		"id: STORY-101\n" +
		"title: Deliver fixture capability\n" +
		"status: " + status + "\n" +
		"spec_clauses:\n  - fixture.md#valid-clause\n" +
		"phase_requirements:\n  - PH00-R01\n" +
		"modules:\n  - internal/application/\n" +
		"acceptance_criteria:\n  - STORY-101-AC-1\n" +
		"edge_cases:\n  - EC-DOCS-1\n" +
		"depends_on: []\nadrs: []\nphase: 00\nowner: coder\nestimate: S\n---\n\n" +
		"# STORY-101 — Deliver fixture capability\n\n" +
		"## Acceptance criteria\n\n" +
		"### STORY-101-AC-1\n**Satisfies:** PH00-R01\n\nThe fixture capability is delivered.\n"
	writePhaseFixture(t, filepath.Join(root, "docs", "stories", "story-101-fixture.md"), story)
	writeTraceFixtureBoard(t, root, map[string]string{"STORY-101": status})
}

func readPhaseFixture(t *testing.T, path string) string {
	t.Helper()
	contents, err := os.ReadFile(path)
	if err != nil {
		t.Fatalf("read fixture %s: %v", path, err)
	}
	return string(contents)
}

func phase01ResolutionFixture(t *testing.T, mutate func(string) string) string {
	t.Helper()

	repositoryRoot := storyEightRepositoryRoot(t)
	contents := readPhaseFixture(t, filepath.Join(repositoryRoot, "docs", "phase-resolutions", "PH01.yaml"))
	root := t.TempDir()
	writePhaseFixture(t, filepath.Join(root, "docs", "phase-resolutions", "PH01.yaml"), mutate(contents))
	return root
}

func phase01CompletionFixture(t *testing.T, resolution string) string {
	t.Helper()

	root := newPhaseFixture(t)
	phasePath := filepath.Join(root, "specification", "07_Phases", "PHASE_01_FIXTURE.md")
	conflicts := "## Open specification conflicts\n\n" +
		"| ID | Conflicting or missing sources | Required decision | Blocked requirements |\n" +
		"|---|---|---|---|\n" +
		"| PH01-X01 | fixture.md#valid-clause | Resolve fixture behavior. | PH01-R01 |\n\n"
	contents := strings.Replace(readPhaseFixture(t, phasePath), "## Cross-phase contracts", conflicts+"## Cross-phase contracts", 1)
	writePhaseFixture(t, phasePath, contents)
	if resolution != "" {
		writePhaseFixture(t, filepath.Join(root, "docs", "phase-resolutions", "PH01.yaml"), resolution)
	}
	return root
}

func removePhaseResolutionListItem(contents, item string) string {
	if strings.Contains(contents, "["+item+", ") {
		return strings.Replace(contents, "["+item+", ", "[", 1)
	}
	if strings.Contains(contents, ", "+item+"]") {
		return strings.Replace(contents, ", "+item+"]", "]", 1)
	}
	return strings.Replace(contents, item+", ", "", 1)
}

func writePhaseFixture(t *testing.T, path, contents string) {
	t.Helper()
	if err := os.MkdirAll(filepath.Dir(path), 0o700); err != nil {
		t.Fatalf("create fixture directory: %v", err)
	}
	if err := os.WriteFile(path, []byte(contents), 0o600); err != nil {
		t.Fatalf("write fixture %s: %v", path, err)
	}
}

func runPhaseCLI(t *testing.T, script, root string) {
	t.Helper()
	runPhaseCLIWithArguments(t, script, root)
}

func runPhaseCLIWithArguments(t *testing.T, script, root string, arguments ...string) {
	t.Helper()
	commandArguments := []string{filepath.Join(storyEightRepositoryRoot(t), script), "--root", root}
	commandArguments = append(commandArguments, arguments...)
	command := exec.Command("node", commandArguments...)
	command.Dir = storyEightRepositoryRoot(t)
	output, err := command.CombinedOutput()
	if err != nil {
		t.Fatalf("run %s: %v\n%s", script, err, output)
	}
}

func runPhaseCLIFailure(t *testing.T, script, root string) string {
	t.Helper()
	return runPhaseCLIWithArgumentsFailure(t, script, root)
}

func runPhaseCLIWithArgumentsFailure(t *testing.T, script, root string, arguments ...string) string {
	t.Helper()
	commandArguments := []string{filepath.Join(storyEightRepositoryRoot(t), script), "--root", root}
	commandArguments = append(commandArguments, arguments...)
	command := exec.Command("node", commandArguments...)
	command.Dir = storyEightRepositoryRoot(t)
	output, err := command.CombinedOutput()
	if err == nil {
		t.Fatalf("%s unexpectedly succeeded", script)
	}
	return string(output)
}
