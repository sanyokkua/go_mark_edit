package main

import (
	"os"
	"path/filepath"
	"regexp"
	"strconv"
	"strings"
	"testing"
)

/*
 * The clarified-clause count has been wrong four times. `plan.md` said 14, T044 mandated
 * 18 when the specification held 26, the 2026-08-15 ledger measured 42, and T131 found 44
 * because two `- Q:` clauses sit in Success Criteria rather than under a Clarifications
 * session header. Every one of those was a number carried by hand while both artifacts
 * instructed the reader to re-measure instead.
 *
 * Nothing could see the disagreement, so this test re-measures it. `plan.md` and the
 * coverage ledger each state the count in one fixed, greppable form — `44 ` + "`- Q:`" +
 * ` entries` — and every occurrence must equal what `spec.md` actually holds. Dated
 * historical rows use different wording on purpose and are left alone: Constitution I
 * requires a superseded record to be marked, not rewritten.
 */

// clarifiedClauseDeclaration matches the one phrasing both artifacts use to state the
// count. Kept deliberately narrow so a dated historical figure cannot satisfy it.
var clarifiedClauseDeclaration = regexp.MustCompile("(\\d+) `- Q:` entries")

// clauseCountDeclaringArtifacts are the files that state the count and are therefore
// required to agree with the specification.
var clauseCountDeclaringArtifacts = []string{
	filepath.Join("specs", "003-real-files-and-tabs", "plan.md"),
	filepath.Join("specs", "003-real-files-and-tabs", "evidence", "ft-ev-09", "coverage-ledger.md"),
}

// Proves: Constitution I (no unmarked contradiction between artifacts) for the clarified
// clause count specifically. It does not prove anything about the clauses' content.
func TestDeclaredClarifiedClauseCountMatchesTheSpecification(t *testing.T) {
	t.Parallel()

	root := repositoryRoot(t)
	specification := readRepositoryFile(t, filepath.Join(root, "specs", "003-real-files-and-tabs", "spec.md"))

	measured := 0
	for _, line := range strings.Split(specification, "\n") {
		if strings.HasPrefix(line, "- Q:") {
			measured++
		}
	}
	if measured == 0 {
		t.Fatal("no `- Q:` clause found in spec.md — the measurement itself is broken")
	}

	for _, artifact := range clauseCountDeclaringArtifacts {
		content := readRepositoryFile(t, filepath.Join(root, artifact))
		matches := clarifiedClauseDeclaration.FindAllStringSubmatch(content, -1)
		if len(matches) == 0 {
			t.Errorf("%s states no clarified clause count in the re-measurable form %q", artifact, "N `- Q:` entries")
			continue
		}
		for _, match := range matches {
			declared, err := strconv.Atoi(match[1])
			if err != nil {
				t.Fatalf("%s: parse declared clause count %q: %v", artifact, match[1], err)
			}
			if declared != measured {
				t.Errorf("%s declares %d clarified clauses; spec.md holds %d — re-measure with `grep -c '^- Q:' spec.md` rather than incrementing by hand", artifact, declared, measured)
			}
		}
	}
}

func readRepositoryFile(t *testing.T, path string) string {
	t.Helper()
	content, err := os.ReadFile(path) //nolint:gosec // repository-relative path built from constants
	if err != nil {
		t.Fatalf("read %s: %v", path, err)
	}
	return string(content)
}
