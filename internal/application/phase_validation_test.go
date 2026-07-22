package application

import (
	"encoding/json"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
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
		expectedBlockers := []string{
			"phase-complete-check: PH01-X01 is an unresolved specification conflict",
			"phase-complete-check: PH01-R15 has no story acceptance-criterion coverage",
			"phase-complete-check: PH01-E06 real-runtime evidence requires an approval owner and existing artifact",
			"phase-complete-check: PH01-E07 human evidence requires an approval owner and existing artifact",
			"phase-complete-check: PH01-E08 real-runtime evidence requires an approval owner and existing artifact",
			"phase-complete-check: PH01-E10 exit evidence lacks done-story AC/test coverage for PH01-R15",
		}
		actualBlockers := strings.Split(strings.TrimSpace(output), "\n")
		if strings.Join(actualBlockers, "\n") != strings.Join(expectedBlockers, "\n") {
			t.Errorf("Phase 01 completion blockers differ:\nactual:\n%s\n\nexpected:\n%s", strings.Join(actualBlockers, "\n"), strings.Join(expectedBlockers, "\n"))
		}
	})
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
