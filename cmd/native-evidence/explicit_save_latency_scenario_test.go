//go:build native_evidence

package main

import (
	"context"
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/sanyokkua/go_mark_edit/internal/apperr"
	"github.com/sanyokkua/go_mark_edit/internal/appmodel"
)

type explicitSaveTestEmitter struct{}

func (explicitSaveTestEmitter) EmitStatePatch(context.Context, apperr.AppStatePatch) error {
	return nil
}

func newExplicitSaveScenarioForTest(t *testing.T) (*explicitSaveLatencyScenario, *appmodel.AppModelService) {
	t.Helper()
	scenario, err := newExplicitSaveLatencyScenario(t.TempDir())
	if err != nil {
		t.Fatalf("new explicit save scenario: %v", err)
	}
	model := appmodel.NewAppModelServiceForHost(
		appmodel.WithEmitter(explicitSaveTestEmitter{}),
		appmodel.WithDialogs(nil, scenario),
		appmodel.WithWriteCommitObserver(scenario.recordCommit),
	)
	scenario.attachModel(model)
	return scenario, model
}

func explicitSaveRowByFixture(t *testing.T, rows []explicitSaveFixtureRow, fixture string) explicitSaveFixtureRow {
	t.Helper()
	for _, row := range rows {
		if row.Fixture == fixture {
			return row
		}
	}
	t.Fatalf("no row for fixture %s in %+v", fixture, rows)
	return explicitSaveFixtureRow{}
}

func TestExplicitSaveFixtureBContentIsExactlyOneKibibyteOfUniformLF(t *testing.T) {
	t.Parallel()
	content := explicitSaveFixtureBContent()
	if len(content) != explicitSaveFixtureBSize {
		t.Fatalf("fixture B = %d bytes, want %d", len(content), explicitSaveFixtureBSize)
	}
	if strings.Contains(content, "\r") {
		t.Fatal("fixture B contains CR; a mixed-ending fixture would put an FR-FT-011 prompt inside the measured interval")
	}
	if !strings.HasSuffix(content, "\n") {
		t.Fatal("fixture B does not end with LF")
	}
}

func TestExplicitSaveEditChangesExactlyOneCharacter(t *testing.T) {
	t.Parallel()
	original := explicitSaveFixtureBContent()
	edited, changed := explicitSaveEditOneCharacter(original)
	if changed != 1 {
		t.Fatalf("changed = %d, want exactly one character", changed)
	}
	if len(edited) != len(original) {
		t.Fatalf("edited length = %d, want %d", len(edited), len(original))
	}
	differing := 0
	for index := range original {
		if original[index] != edited[index] {
			differing++
		}
	}
	if differing != 1 {
		t.Fatalf("byte differences = %d, want exactly one", differing)
	}
}

func TestExplicitSaveWalkthroughTimesBothSCFT002Fixtures(t *testing.T) {
	t.Parallel()
	scenario, _ := newExplicitSaveScenarioForTest(t)

	if err := scenario.run(context.Background()); err != nil {
		t.Fatalf("explicit save walkthrough: %v", err)
	}

	scenario.mu.Lock()
	rows := append([]explicitSaveFixtureRow(nil), scenario.rows...)
	scenario.mu.Unlock()
	if len(rows) != 2 {
		t.Fatalf("rows = %d, want one per SC-FT-002 fixture", len(rows))
	}

	fixtureA := explicitSaveRowByFixture(t, rows, "A")
	if fixtureA.Status != "passed" {
		t.Fatalf("fixture A = %s: %s", fixtureA.Status, fixtureA.Failure)
	}
	if fixtureA.ObservedOrigin != string(appmodel.SaveOriginSaveAs) {
		t.Fatalf("fixture A origin = %q, want save-as", fixtureA.ObservedOrigin)
	}
	if fixtureA.DiskBytes != len(explicitSaveRepresentativeLine) {
		t.Fatalf("fixture A disk bytes = %d, want %d", fixtureA.DiskBytes, len(explicitSaveRepresentativeLine))
	}
	if fixtureA.DiskSHA256 == "" || fixtureA.Confirmation.FileName != explicitSaveFixtureAName {
		t.Fatalf("fixture A confirmation = %+v, digest %q", fixtureA.Confirmation, fixtureA.DiskSHA256)
	}
	if fixtureA.Confirmation.Encoding == "" || fixtureA.Confirmation.LineEndingOutcome == "" {
		t.Fatalf("fixture A FR-FT-015 payload = %+v, want file, encoding and line-ending outcome", fixtureA.Confirmation)
	}
	if !fixtureA.Confirmation.TargetPathAdopted {
		t.Fatalf("fixture A did not adopt the Save As target: %+v", fixtureA.Confirmation)
	}

	fixtureB := explicitSaveRowByFixture(t, rows, "B")
	if fixtureB.Status != "passed" {
		t.Fatalf("fixture B = %s: %s", fixtureB.Status, fixtureB.Failure)
	}
	if fixtureB.ObservedOrigin != string(appmodel.SaveOriginExplicitSave) {
		t.Fatalf("fixture B origin = %q, want explicit-save", fixtureB.ObservedOrigin)
	}
	if fixtureB.DiskBytes != explicitSaveFixtureBSize || fixtureB.ChangedCharacters != 1 {
		t.Fatalf("fixture B disk bytes = %d, changed characters = %d", fixtureB.DiskBytes, fixtureB.ChangedCharacters)
	}
	if fixtureB.Confirmation.TargetPathAdopted {
		t.Fatalf("fixture B adopted a new target: an explicit Save must not become a Save As (%+v)", fixtureB.Confirmation)
	}
	if fixtureB.Confirmation.LineEndingOutcome != string(apperr.LineEndingPreservedLF) {
		t.Fatalf("fixture B line-ending outcome = %q, want the existing LF convention preserved", fixtureB.Confirmation.LineEndingOutcome)
	}
	saved, err := os.ReadFile(fixtureB.TargetPath)
	if err != nil {
		t.Fatalf("read fixture B target: %v", err)
	}
	original := explicitSaveFixtureBContent()
	if len(saved) != len(original) {
		t.Fatalf("fixture B on disk = %d bytes, want %d", len(saved), len(original))
	}
	differing := 0
	for index := range original {
		if original[index] != saved[index] {
			differing++
		}
	}
	if differing != 1 {
		t.Fatalf("fixture B differs from its baseline in %d bytes, want exactly one", differing)
	}

	for _, row := range rows {
		if row.DispatchToCommitNs <= 0 || row.DispatchToConfirmationNs < row.DispatchToCommitNs {
			t.Fatalf("fixture %s spans commit=%d confirmation=%d, want the commit inside the dispatch-to-confirmation interval",
				row.Fixture, row.DispatchToCommitNs, row.DispatchToConfirmationNs)
		}
		if row.ReadyToConfirmationNs <= 0 || row.ReadyToConfirmationNs >= int64(30*time.Second) {
			t.Fatalf("fixture %s ready-to-confirmation = %d ns, want a positive span inside the 30 s budget", row.Fixture, row.ReadyToConfirmationNs)
		}
		if row.FixtureToConfirmationNs <= 0 || row.FixtureToConfirmationNs > row.ReadyToConfirmationNs {
			t.Fatalf("fixture %s fixture-to-confirmation = %d ns, want a positive span no larger than the %d ns measured from ready",
				row.Fixture, row.FixtureToConfirmationNs, row.ReadyToConfirmationNs)
		}
		if row.FixtureToConfirmationNs < row.DispatchToConfirmationNs {
			t.Fatalf("fixture %s fixture-to-confirmation = %d ns is shorter than its own dispatch-to-confirmation %d ns",
				row.Fixture, row.FixtureToConfirmationNs, row.DispatchToConfirmationNs)
		}
		if !row.WithinBudget {
			t.Fatalf("fixture %s was not marked within budget: %+v", row.Fixture, row)
		}
		if len(row.Directory.Failures) != 0 || len(row.Directory.Residual) != 0 {
			t.Fatalf("fixture %s directory verdict = %+v, want no leftover and no unexpected difference", row.Fixture, row.Directory)
		}
		if len(row.Directory.Differences) != 1 || row.Directory.Differences[0].Name != filepath.Base(row.TargetPath) {
			t.Fatalf("fixture %s differences = %+v, want only the target file", row.Fixture, row.Directory.Differences)
		}
	}

	data, err := os.ReadFile(scenario.reportPath)
	if err != nil {
		t.Fatalf("read explicit save report: %v", err)
	}
	var report explicitSaveLatencyReport
	if err := json.Unmarshal(data, &report); err != nil {
		t.Fatalf("decode explicit save report: %v", err)
	}
	if report.Scenario != explicitSaveScenarioName || report.Status != "complete" || report.Passed != 2 || report.Failed != 0 {
		t.Fatalf("report = %+v, want a complete two-fixture pass", report)
	}
	if report.BudgetNs != int64(30*time.Second) || report.CompletedAt == "" || report.ReadyAt == "" {
		t.Fatalf("report budget/stamps = %d/%q/%q", report.BudgetNs, report.ReadyAt, report.CompletedAt)
	}
	if report.Metadata["limitation"] == "" || report.Metadata["measurementScope"] == "" || report.Metadata["fixtureSequencing"] == "" {
		t.Fatalf("report metadata does not state what the harness measures: %+v", report.Metadata)
	}

	/*
	 * Emitted, not just asserted. SC-FT-002 asks for a timing, and a test that
	 * measures one and then discards it proves only that the arithmetic ran.
	 * `go test -v` is where the figure this task exists to produce becomes
	 * readable, so it can be copied into evidence without re-deriving it.
	 */
	for _, row := range report.Rows {
		t.Logf(
			"SC-FT-002 %s: dispatch->commit %s, dispatch->confirmation %s, fixture span %s, ready->confirmation %s, %d bytes, origin %s, within 30s budget: %t",
			row.Fixture,
			time.Duration(row.DispatchToCommitNs),
			time.Duration(row.DispatchToConfirmationNs),
			time.Duration(row.FixtureToConfirmationNs),
			time.Duration(row.ReadyToConfirmationNs),
			row.DiskBytes,
			row.ObservedOrigin,
			row.WithinBudget,
		)
	}
}

func TestExplicitSaveObserverKeepsOnlyExplicitOrigins(t *testing.T) {
	t.Parallel()
	scenario, err := newExplicitSaveLatencyScenario(t.TempDir())
	if err != nil {
		t.Fatalf("new explicit save scenario: %v", err)
	}
	for _, origin := range []appmodel.SaveOrigin{
		appmodel.SaveOriginAutosave,
		appmodel.SaveOriginOpen,
		appmodel.SaveOriginReload,
	} {
		scenario.recordCommit(appmodel.CommittedWriteResult{
			Snapshot: appmodel.WriteSnapshot{DocumentID: "doc-1", ContentRevision: 3},
		}, origin)
	}
	scenario.mu.Lock()
	if len(scenario.commits) != 0 {
		scenario.mu.Unlock()
		t.Fatalf("non-explicit commits were timed: %+v", scenario.commits)
	}
	if scenario.ignoredCommits[string(appmodel.SaveOriginAutosave)] != 1 {
		scenario.mu.Unlock()
		t.Fatalf("ignored commit counts = %+v, want the autosave commit counted", scenario.ignoredCommits)
	}
	scenario.mu.Unlock()

	scenario.recordCommit(appmodel.CommittedWriteResult{
		Snapshot: appmodel.WriteSnapshot{DocumentID: "doc-1", ContentRevision: 4},
	}, appmodel.SaveOriginExplicitSave)
	scenario.mu.Lock()
	defer scenario.mu.Unlock()
	stamp, ok := scenario.commits["doc-1"]
	if !ok || stamp.origin != appmodel.SaveOriginExplicitSave || stamp.contentRevision != 4 || stamp.at.IsZero() {
		t.Fatalf("explicit commit stamp = %+v (present=%v), want the explicit-save observation retained", stamp, ok)
	}
}

func TestExplicitSaveDirectorySnapshotIsNonRecursive(t *testing.T) {
	t.Parallel()
	root := t.TempDir()
	if err := os.WriteFile(filepath.Join(root, "target.md"), []byte("one"), 0o600); err != nil {
		t.Fatal(err)
	}
	nested := filepath.Join(root, "nested")
	if err := os.MkdirAll(nested, 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(nested, "buried.md"), []byte("two"), 0o600); err != nil {
		t.Fatal(err)
	}
	snapshot, err := explicitSaveSnapshotDirectory(root)
	if err != nil {
		t.Fatalf("snapshot: %v", err)
	}
	if len(snapshot) != 2 {
		t.Fatalf("snapshot = %+v, want the two immediate members only", snapshot)
	}
	for _, entry := range snapshot {
		if entry.Name == "buried.md" {
			t.Fatalf("snapshot descended into a subdirectory: %+v", snapshot)
		}
		if entry.Name == "nested" && entry.Kind != "directory" {
			t.Fatalf("nested entry = %+v, want a directory record", entry)
		}
	}
}

func TestExplicitSaveDirectoryVerdictRejectsALeftoverTemporaryFile(t *testing.T) {
	t.Parallel()
	before := []explicitSaveDirectoryEntry{}
	after := []explicitSaveDirectoryEntry{
		{Name: ".gomarkedit-901234", Kind: "file", SizeBytes: 12, Mode: "-rw-------", SHA256: "aa"},
		{Name: explicitSaveFixtureAName, Kind: "file", SizeBytes: 43, Mode: "-rw-------", SHA256: "bb"},
	}
	verdict := explicitSaveEvaluateDirectory(before, after, explicitSaveFixtureAName)
	if len(verdict.Failures) != 2 {
		t.Fatalf("failures = %+v, want the unexpected difference and the surviving artifact", verdict.Failures)
	}
	if len(verdict.Residual) != 1 || !strings.Contains(verdict.Residual[0], ".gomarkedit-901234") {
		t.Fatalf("residual = %+v, want the atomic-replace temporary file named", verdict.Residual)
	}
	if !strings.Contains(verdict.Residual[0], "FR-FT-009") {
		t.Fatalf("residual reason = %q, want the FR-FT-009 temporary file named as such", verdict.Residual[0])
	}

	clean := explicitSaveEvaluateDirectory(before, after[1:], explicitSaveFixtureAName)
	if len(clean.Failures) != 0 || len(clean.Residual) != 0 {
		t.Fatalf("clean verdict = %+v, want a pass when only the target appeared", clean)
	}
	if len(clean.Differences) != 1 || clean.Differences[0].Change != "added" {
		t.Fatalf("clean differences = %+v, want the target recorded as added", clean.Differences)
	}
}

func TestExplicitSaveDirectoryVerdictRejectsAnUnrelatedModification(t *testing.T) {
	t.Parallel()
	before := []explicitSaveDirectoryEntry{
		{Name: "notes.md", Kind: "file", SizeBytes: 10, Mode: "-rw-------", SHA256: "aa"},
		{Name: explicitSaveFixtureBName, Kind: "file", SizeBytes: 1024, Mode: "-rw-------", SHA256: "bb"},
	}
	after := []explicitSaveDirectoryEntry{
		{Name: "notes.md", Kind: "file", SizeBytes: 11, Mode: "-rw-------", SHA256: "cc"},
		{Name: explicitSaveFixtureBName, Kind: "file", SizeBytes: 1024, Mode: "-rw-------", SHA256: "dd"},
	}
	verdict := explicitSaveEvaluateDirectory(before, after, explicitSaveFixtureBName)
	if len(verdict.Failures) == 0 {
		t.Fatalf("verdict = %+v, want a failure for the neighbouring file that changed", verdict)
	}
	if !strings.Contains(strings.Join(verdict.Failures, " "), "notes.md") {
		t.Fatalf("failures = %+v, want notes.md named", verdict.Failures)
	}
}

func TestExplicitSaveWalkthroughFailsWhenAnArtifactSurvivesTheConfirmation(t *testing.T) {
	t.Parallel()
	scenario, _ := newExplicitSaveScenarioForTest(t)
	// A leftover dropped into the target directory during the Save As reaches
	// the after-snapshot exactly as an uncleaned FR-FT-009 temporary file would.
	scenario.beforeSave = func(candidate string) {
		leftover := filepath.Join(filepath.Dir(candidate), ".gomarkedit-leftover")
		if err := os.WriteFile(leftover, []byte("stranded"), 0o600); err != nil {
			t.Errorf("plant leftover: %v", err)
		}
	}

	err := scenario.run(context.Background())
	if err == nil {
		t.Fatal("walkthrough reported success while an artifact survived the confirmation")
	}
	if !strings.Contains(err.Error(), ".gomarkedit-leftover") {
		t.Fatalf("walkthrough error = %v, want the surviving artifact named", err)
	}
	if recorded := scenario.failure(); recorded == nil || recorded.Error() != err.Error() {
		t.Fatalf("recorded failure = %v, want the same verdict available to the exit code", recorded)
	}

	scenario.mu.Lock()
	rows := append([]explicitSaveFixtureRow(nil), scenario.rows...)
	scenario.mu.Unlock()
	fixtureA := explicitSaveRowByFixture(t, rows, "A")
	if fixtureA.Status != "failed" {
		t.Fatalf("fixture A = %s, want failed while the directory held a leftover", fixtureA.Status)
	}
	// The save itself must still be recorded as committed: SC-FT-002 fails on
	// the directory obligation here, not on the write.
	if !fixtureA.Confirmation.Observed || fixtureA.DiskBytes != len(explicitSaveRepresentativeLine) {
		t.Fatalf("fixture A confirmation = %+v, disk bytes = %d; the write itself should have committed", fixtureA.Confirmation, fixtureA.DiskBytes)
	}

	data, err := os.ReadFile(scenario.reportPath)
	if err != nil {
		t.Fatalf("read explicit save report: %v", err)
	}
	var report explicitSaveLatencyReport
	if err := json.Unmarshal(data, &report); err != nil {
		t.Fatalf("decode explicit save report: %v", err)
	}
	if report.Status != "failed" || report.Failed == 0 {
		t.Fatalf("report = %+v, want a failed walkthrough recorded", report)
	}
}

func TestExplicitSaveRefusesToRunWithoutAnAttachedModel(t *testing.T) {
	t.Parallel()
	scenario, err := newExplicitSaveLatencyScenario(t.TempDir())
	if err != nil {
		t.Fatalf("new explicit save scenario: %v", err)
	}
	if runErr := scenario.run(context.Background()); runErr == nil {
		t.Fatal("run reported success without an attached application model")
	}
}
