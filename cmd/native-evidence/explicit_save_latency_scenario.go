//go:build native_evidence

package main

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"runtime"
	"sort"
	"strings"
	"sync"
	"time"

	"github.com/sanyokkua/go_mark_edit/internal/apperr"
	"github.com/sanyokkua/go_mark_edit/internal/appmodel"
	wailsruntime "github.com/wailsapp/wails/v2/pkg/runtime"
)

const (
	explicitSaveScenarioName = "explicit-save-latency"
	explicitSaveReportName   = "explicit-save-latency-report.json"
	// SC-FT-002 budgets each fixture at under 30 seconds, measured from the
	// moment the application is ready for input to the moment the FR-FT-015
	// explicit-save confirmation is observed.
	explicitSaveBudget = 30 * time.Second
	// Fixture A types one representative line into a new untitled document.
	explicitSaveRepresentativeLine = "# GoMarkEdit explicit save walkthrough line"
	// Fixture B opens a pre-existing 1 KiB text fixture and edits one character.
	explicitSaveFixtureBSize       = 1024
	explicitSaveFixtureBLineLength = 64
	explicitSaveFixtureAName       = "fixture-a.md"
	explicitSaveFixtureBName       = "fixture-b.md"
	// The FR-FT-009 same-directory temporary file is created by
	// internal/file/atomic_replace.go with exactly this prefix.
	explicitSaveTemporaryPrefix = ".gomarkedit-"
)

// explicitSaveDriverModel is the narrow production surface the SC-FT-002
// walkthrough drives. Every method is the same one the Wails-bound handler
// calls; the scenario adds no alternate write path.
type explicitSaveDriverModel interface {
	GetState(context.Context) (apperr.AppState, error)
	NewDocument(context.Context, uint64) apperr.DocumentTransitionOutcome
	OpenPath(context.Context, string, uint64) apperr.OpenOutcome
	UpdateBuffer(context.Context, string, string) error
	Save(context.Context, string, uint64, string) apperr.WriteResult
}

var (
	_ explicitSaveDriverModel      = (*appmodel.AppModelService)(nil)
	_ appmodel.DocumentSaveDialog  = (*explicitSaveLatencyScenario)(nil)
	_ appmodel.WriteCommitObserver = (*explicitSaveLatencyScenario)(nil).recordCommit
)

// explicitSaveDirectoryEntry is one member of a non-recursive listing of the
// target file's immediate parent directory.
type explicitSaveDirectoryEntry struct {
	Name      string `json:"name"`
	Kind      string `json:"kind"`
	SizeBytes int64  `json:"sizeBytes"`
	Mode      string `json:"mode"`
	SHA256    string `json:"sha256,omitempty"`
}

func (entry explicitSaveDirectoryEntry) fingerprint() string {
	return fmt.Sprintf("%s|%d|%s|%s", entry.Kind, entry.SizeBytes, entry.Mode, entry.SHA256)
}

// explicitSaveDirectoryDifference names one entry that is not identical in the
// before and after snapshots.
type explicitSaveDirectoryDifference struct {
	Name   string `json:"name"`
	Change string `json:"change"`
	Before string `json:"before,omitempty"`
	After  string `json:"after,omitempty"`
}

// explicitSaveDirectoryVerdict is SC-FT-002's directory obligation evaluated
// over one non-recursive before/after pair. Failures is empty only when the
// single permitted difference is the target file and nothing else survives.
type explicitSaveDirectoryVerdict struct {
	Differences []explicitSaveDirectoryDifference `json:"differences"`
	Residual    []string                          `json:"residualArtifacts"`
	Failures    []string                          `json:"failures,omitempty"`
}

// explicitSaveConfirmation records the FR-FT-015 payload the confirmation is
// built from: the file, the encoding, and the line-ending outcome.
type explicitSaveConfirmation struct {
	Observed               bool   `json:"observed"`
	WriteStatus            string `json:"writeStatus"`
	FileName               string `json:"fileName,omitempty"`
	Encoding               string `json:"encoding,omitempty"`
	LineEndingOutcome      string `json:"lineEndingOutcome,omitempty"`
	BOMOutcome             string `json:"bomOutcome,omitempty"`
	TargetPathAdopted      bool   `json:"targetPathAdopted"`
	WrittenContentRevision uint64 `json:"writtenContentRevision,omitempty"`
	ResyncRequired         bool   `json:"resyncRequired"`
}

type explicitSaveFixtureRow struct {
	Fixture                  string                       `json:"fixture"`
	Description              string                       `json:"description"`
	ExpectedOrigin           string                       `json:"expectedOrigin"`
	ObservedOrigin           string                       `json:"observedOrigin,omitempty"`
	DocumentID               string                       `json:"documentId,omitempty"`
	ContentRevision          uint64                       `json:"contentRevision,omitempty"`
	TargetPath               string                       `json:"targetPath,omitempty"`
	TargetDirectory          string                       `json:"targetDirectory,omitempty"`
	ChangedCharacters        int                          `json:"changedCharacters"`
	ReadyAt                  string                       `json:"readyAt,omitempty"`
	FixtureStartedAt         string                       `json:"fixtureStartedAt,omitempty"`
	DispatchedAt             string                       `json:"dispatchedAt,omitempty"`
	CommittedAt              string                       `json:"committedAt,omitempty"`
	ConfirmedAt              string                       `json:"confirmedAt,omitempty"`
	ReadyToConfirmationNs    int64                        `json:"readyToConfirmationNs,omitempty"`
	FixtureToConfirmationNs  int64                        `json:"fixtureToConfirmationNs,omitempty"`
	DispatchToConfirmationNs int64                        `json:"dispatchToConfirmationNs,omitempty"`
	DispatchToCommitNs       int64                        `json:"dispatchToCommitNs,omitempty"`
	BudgetNs                 int64                        `json:"budgetNs"`
	WithinBudget             bool                         `json:"withinBudget"`
	DiskBytes                int                          `json:"diskBytes,omitempty"`
	DiskSHA256               string                       `json:"diskSha256,omitempty"`
	Confirmation             explicitSaveConfirmation     `json:"confirmation"`
	BeforeSnapshot           []explicitSaveDirectoryEntry `json:"beforeSnapshot"`
	AfterSnapshot            []explicitSaveDirectoryEntry `json:"afterSnapshot"`
	Directory                explicitSaveDirectoryVerdict `json:"directory"`
	Status                   string                       `json:"status"`
	Failure                  string                       `json:"failure,omitempty"`
}

type explicitSaveLatencyReport struct {
	Scenario           string                   `json:"scenario"`
	Status             string                   `json:"status"`
	StartedAt          string                   `json:"startedAt"`
	ReadyAt            string                   `json:"readyAt,omitempty"`
	CompletedAt        string                   `json:"completedAt,omitempty"`
	BudgetNs           int64                    `json:"budgetNs"`
	FixtureCount       int                      `json:"fixtureCount"`
	Passed             int                      `json:"passed"`
	Failed             int                      `json:"failed"`
	IgnoredCommits     map[string]int           `json:"ignoredCommits"`
	Rows               []explicitSaveFixtureRow `json:"rows"`
	Metadata           map[string]string        `json:"metadata"`
	ReportPath         string                   `json:"reportPath"`
	WorkspaceDirectory string                   `json:"workspaceDirectory"`
}

// explicitSaveCommitStamp is the write-commit observation for one document.
type explicitSaveCommitStamp struct {
	at              time.Time
	origin          appmodel.SaveOrigin
	contentRevision uint64
	targetPath      string
}

// explicitSavePlan is one SC-FT-002 fixture prepared up to the instant before
// its explicit save is dispatched. Everything in it is settled before t0.
type explicitSavePlan struct {
	fixture           string
	description       string
	expectedOrigin    appmodel.SaveOrigin
	documentID        string
	contentRevision   uint64
	directory         string
	targetName        string
	saveAsTarget      string
	changedCharacters int
	startedAt         time.Time
	before            []explicitSaveDirectoryEntry
}

type explicitSaveLatencyScenario struct {
	mu             sync.Mutex
	context        context.Context
	model          explicitSaveDriverModel
	workspace      string
	reportPath     string
	startedAt      time.Time
	readyAt        time.Time
	saveTarget     string
	beforeSave     func(string)
	chooseCalls    int
	confirmCalls   int
	ignoredCommits map[string]int
	commits        map[string]explicitSaveCommitStamp
	rows           []explicitSaveFixtureRow
	runErr         error
}

func newExplicitSaveLatencyScenario(databaseDir string) (*explicitSaveLatencyScenario, error) {
	workspace := filepath.Join(databaseDir, "explicit-save-fixtures")
	if err := os.RemoveAll(workspace); err != nil {
		return nil, fmt.Errorf("clear explicit save workspace: %w", err)
	}
	if err := os.MkdirAll(workspace, 0o755); err != nil {
		return nil, fmt.Errorf("create explicit save workspace: %w", err)
	}
	return &explicitSaveLatencyScenario{
		workspace:      workspace,
		reportPath:     filepath.Join(databaseDir, explicitSaveReportName),
		startedAt:      time.Now(),
		ignoredCommits: make(map[string]int),
		commits:        make(map[string]explicitSaveCommitStamp),
	}, nil
}

func (scenario *explicitSaveLatencyScenario) attachContext(ctx context.Context) {
	scenario.mu.Lock()
	scenario.context = ctx
	scenario.mu.Unlock()
}

// attachModel injects the same AppModelService the Wails handlers are bound to.
func (scenario *explicitSaveLatencyScenario) attachModel(model explicitSaveDriverModel) {
	scenario.mu.Lock()
	scenario.model = model
	scenario.mu.Unlock()
}

// markReady stamps SC-FT-002's start instant: the moment the application became
// ready to accept its first command.
func (scenario *explicitSaveLatencyScenario) markReady() {
	scenario.mu.Lock()
	if scenario.readyAt.IsZero() {
		scenario.readyAt = time.Now()
	}
	scenario.mu.Unlock()
}

// ChooseSaveFile is the composition-root save chooser for Fixture A. The target
// is armed before the dispatch so no native dialog sits inside the interval.
func (scenario *explicitSaveLatencyScenario) ChooseSaveFile(context.Context, appmodel.SaveDialogRequest) (string, error) {
	scenario.mu.Lock()
	defer scenario.mu.Unlock()
	scenario.chooseCalls++
	if scenario.saveTarget == "" {
		return "", errors.New("explicit save target was not armed before Save As")
	}
	target := scenario.saveTarget
	scenario.saveTarget = ""
	return target, nil
}

// ConfirmOverwrite must never be reached: SC-FT-002 saves into a fresh empty
// directory. A prompt means the directory was not empty, so the write is
// cancelled and the row fails with that reason rather than overwriting.
func (scenario *explicitSaveLatencyScenario) ConfirmOverwrite(context.Context, string) (bool, error) {
	scenario.mu.Lock()
	defer scenario.mu.Unlock()
	scenario.confirmCalls++
	return false, nil
}

// recordCommit keeps only the explicit origins. An autosave commit is the very
// thing SC-FT-002 excludes, so it is counted and discarded rather than timed.
func (scenario *explicitSaveLatencyScenario) recordCommit(committed appmodel.CommittedWriteResult, origin appmodel.SaveOrigin) {
	stamped := time.Now()
	documentID := committed.Snapshot.DocumentID
	scenario.mu.Lock()
	defer scenario.mu.Unlock()
	if origin != appmodel.SaveOriginExplicitSave && origin != appmodel.SaveOriginSaveAs {
		scenario.ignoredCommits[string(origin)]++
		return
	}
	scenario.commits[documentID] = explicitSaveCommitStamp{
		at:              stamped,
		origin:          origin,
		contentRevision: committed.Snapshot.ContentRevision,
		targetPath:      committed.Snapshot.TargetPath,
	}
}

// run walks both SC-FT-002 fixtures and writes the report. It returns an error
// when the evidence does not satisfy the criterion, so the driver cannot report
// a green walkthrough over a failed one.
func (scenario *explicitSaveLatencyScenario) run(ctx context.Context) error {
	scenario.markReady()
	scenario.mu.Lock()
	model := scenario.model
	scenario.mu.Unlock()
	if model == nil {
		return scenario.recordRunError(errors.New("explicit save scenario has no attached application model"))
	}

	scenario.appendRow(scenario.runFixtureA(ctx, model), false)
	scenario.appendRow(scenario.runFixtureB(ctx, model), true)

	scenario.mu.Lock()
	failures := make([]string, 0, len(scenario.rows))
	for _, row := range scenario.rows {
		if row.Status != "passed" {
			failures = append(failures, fmt.Sprintf("fixture %s: %s", row.Fixture, row.Failure))
		}
	}
	ctxForLog := scenario.context
	summary := scenario.summaryLocked()
	scenario.mu.Unlock()
	if ctxForLog != nil {
		wailsruntime.LogInfo(ctxForLog, summary)
	}
	if len(failures) > 0 {
		return scenario.recordRunError(errors.New(strings.Join(failures, "; ")))
	}
	return nil
}

// recordRunError retains the walkthrough verdict so the process exit code is
// decided from the evidence rather than from the window closing cleanly.
func (scenario *explicitSaveLatencyScenario) recordRunError(err error) error {
	scenario.mu.Lock()
	scenario.runErr = err
	scenario.mu.Unlock()
	return err
}

// failure reports the recorded walkthrough verdict after the window has closed.
func (scenario *explicitSaveLatencyScenario) failure() error {
	scenario.mu.Lock()
	defer scenario.mu.Unlock()
	return scenario.runErr
}

func (scenario *explicitSaveLatencyScenario) appendRow(row explicitSaveFixtureRow, complete bool) {
	scenario.mu.Lock()
	scenario.rows = append(scenario.rows, row)
	scenario.writeReportLocked(complete)
	scenario.mu.Unlock()
}

// runFixtureA creates a new untitled document, sets one representative line,
// and Save As-es it into a freshly created empty directory.
func (scenario *explicitSaveLatencyScenario) runFixtureA(ctx context.Context, model explicitSaveDriverModel) explicitSaveFixtureRow {
	const description = "new untitled document, one representative line, Save As into a fresh empty directory"
	plan, err := scenario.prepareFixtureA(ctx, model)
	if err != nil {
		return explicitSaveFailedRow("A", description, appmodel.SaveOriginSaveAs, err)
	}
	return scenario.measure(ctx, model, plan)
}

// runFixtureB opens a pre-existing 1 KiB text fixture, edits exactly one
// character, and saves it explicitly.
func (scenario *explicitSaveLatencyScenario) runFixtureB(ctx context.Context, model explicitSaveDriverModel) explicitSaveFixtureRow {
	const description = "pre-existing 1 KiB fixture, exactly one character changed, explicit Save"
	plan, err := scenario.prepareFixtureB(ctx, model)
	if err != nil {
		return explicitSaveFailedRow("B", description, appmodel.SaveOriginExplicitSave, err)
	}
	return scenario.measure(ctx, model, plan)
}

func (scenario *explicitSaveLatencyScenario) prepareFixtureA(ctx context.Context, model explicitSaveDriverModel) (explicitSavePlan, error) {
	startedAt := time.Now()
	directory := filepath.Join(scenario.workspace, "fixture-a")
	if err := explicitSaveFreshDirectory(directory); err != nil {
		return explicitSavePlan{}, err
	}
	before, err := explicitSaveSnapshotDirectory(directory)
	if err != nil {
		return explicitSavePlan{}, err
	}
	if len(before) != 0 {
		return explicitSavePlan{}, fmt.Errorf("the Save As directory %s was not empty before the walkthrough: %d entries", directory, len(before))
	}

	state, err := model.GetState(ctx)
	if err != nil {
		return explicitSavePlan{}, fmt.Errorf("read state before New: %w", err)
	}
	created := model.NewDocument(ctx, state.Snapshot.TabSetRevision)
	if created.Data == nil {
		return explicitSavePlan{}, fmt.Errorf("the New command was refused: %s", explicitSaveClassifiedText(created.Error))
	}
	documentID := created.Data.DocumentID
	if err := model.UpdateBuffer(ctx, documentID, explicitSaveRepresentativeLine); err != nil {
		return explicitSavePlan{}, fmt.Errorf("set the representative line: %w", err)
	}
	revision, err := explicitSaveContentRevision(ctx, model, documentID)
	if err != nil {
		return explicitSavePlan{}, err
	}
	return explicitSavePlan{
		fixture:           "A",
		description:       "new untitled document, one representative line, Save As into a fresh empty directory",
		expectedOrigin:    appmodel.SaveOriginSaveAs,
		documentID:        documentID,
		contentRevision:   revision,
		directory:         directory,
		targetName:        explicitSaveFixtureAName,
		saveAsTarget:      filepath.Join(directory, explicitSaveFixtureAName),
		changedCharacters: len(explicitSaveRepresentativeLine),
		startedAt:         startedAt,
		before:            before,
	}, nil
}

func (scenario *explicitSaveLatencyScenario) prepareFixtureB(ctx context.Context, model explicitSaveDriverModel) (explicitSavePlan, error) {
	startedAt := time.Now()
	directory := filepath.Join(scenario.workspace, "fixture-b")
	if err := explicitSaveFreshDirectory(directory); err != nil {
		return explicitSavePlan{}, err
	}
	path := filepath.Join(directory, explicitSaveFixtureBName)
	if err := os.WriteFile(path, []byte(explicitSaveFixtureBContent()), 0o600); err != nil {
		return explicitSavePlan{}, fmt.Errorf("write the 1 KiB fixture: %w", err)
	}
	before, err := explicitSaveSnapshotDirectory(directory)
	if err != nil {
		return explicitSavePlan{}, err
	}

	state, err := model.GetState(ctx)
	if err != nil {
		return explicitSavePlan{}, fmt.Errorf("read state before Open: %w", err)
	}
	opened := model.OpenPath(ctx, path, state.Snapshot.TabSetRevision)
	if opened.ActiveBuffer == nil {
		return explicitSavePlan{}, fmt.Errorf("the Open command was refused: %s", explicitSaveClassifiedText(opened.Error))
	}
	documentID := opened.ActiveBuffer.DocumentID
	edited, changed := explicitSaveEditOneCharacter(opened.ActiveBuffer.Content)
	if changed != 1 {
		return explicitSavePlan{}, fmt.Errorf("edit changed %d characters, want exactly one", changed)
	}
	if err := model.UpdateBuffer(ctx, documentID, edited); err != nil {
		return explicitSavePlan{}, fmt.Errorf("apply the one-character edit: %w", err)
	}
	revision, err := explicitSaveContentRevision(ctx, model, documentID)
	if err != nil {
		return explicitSavePlan{}, err
	}
	return explicitSavePlan{
		fixture:           "B",
		description:       "pre-existing 1 KiB fixture, exactly one character changed, explicit Save",
		expectedOrigin:    appmodel.SaveOriginExplicitSave,
		documentID:        documentID,
		contentRevision:   revision,
		directory:         directory,
		targetName:        explicitSaveFixtureBName,
		changedCharacters: changed,
		startedAt:         startedAt,
		before:            before,
	}, nil
}

// measure spans exactly one dispatch: t0 immediately before the explicit save
// command, the commit stamp from the write coordinator, and the confirmation
// stamp when the successful FR-FT-015 result returns to the caller.
func (scenario *explicitSaveLatencyScenario) measure(ctx context.Context, model explicitSaveDriverModel, plan explicitSavePlan) explicitSaveFixtureRow {
	scenario.mu.Lock()
	scenario.saveTarget = plan.saveAsTarget
	beforeSave := scenario.beforeSave
	delete(scenario.commits, plan.documentID)
	readyAt := scenario.readyAt
	chooseCallsBefore := scenario.chooseCalls
	confirmCallsBefore := scenario.confirmCalls
	scenario.mu.Unlock()

	if beforeSave != nil && plan.saveAsTarget != "" {
		beforeSave(plan.saveAsTarget)
	}
	dispatchedAt := time.Now()
	result := model.Save(ctx, plan.documentID, plan.contentRevision, "")
	confirmedAt := time.Now()

	scenario.mu.Lock()
	commit, committed := scenario.commits[plan.documentID]
	scenario.saveTarget = ""
	saveChoices := scenario.chooseCalls - chooseCallsBefore
	overwritePrompts := scenario.confirmCalls - confirmCallsBefore
	scenario.mu.Unlock()

	row := explicitSaveFixtureRow{
		Fixture:           plan.fixture,
		Description:       plan.description,
		ExpectedOrigin:    string(plan.expectedOrigin),
		DocumentID:        plan.documentID,
		ContentRevision:   plan.contentRevision,
		TargetDirectory:   plan.directory,
		ChangedCharacters: plan.changedCharacters,
		ReadyAt:           explicitSaveStamp(readyAt),
		FixtureStartedAt:  explicitSaveStamp(plan.startedAt),
		DispatchedAt:      explicitSaveStamp(dispatchedAt),
		ConfirmedAt:       explicitSaveStamp(confirmedAt),
		BudgetNs:          int64(explicitSaveBudget),
		BeforeSnapshot:    plan.before,
		Confirmation: explicitSaveConfirmation{
			WriteStatus: string(result.Status),
		},
		Status: "failed",
	}
	if !readyAt.IsZero() {
		row.ReadyToConfirmationNs = confirmedAt.Sub(readyAt).Nanoseconds()
	}
	if !plan.startedAt.IsZero() {
		row.FixtureToConfirmationNs = confirmedAt.Sub(plan.startedAt).Nanoseconds()
	}
	row.DispatchToConfirmationNs = confirmedAt.Sub(dispatchedAt).Nanoseconds()
	if committed {
		row.ObservedOrigin = string(commit.origin)
		row.CommittedAt = explicitSaveStamp(commit.at)
		row.DispatchToCommitNs = commit.at.Sub(dispatchedAt).Nanoseconds()
	}

	failures := make([]string, 0, 4)
	if result.Status != apperr.WriteStatusCommitted || result.Data == nil {
		failures = append(failures, fmt.Sprintf("explicit save returned %q: %s", result.Status, explicitSaveClassifiedText(result.Error)))
	} else {
		row.TargetPath = result.Data.TargetPath
		row.Confirmation = explicitSaveConfirmation{
			Observed:               true,
			WriteStatus:            string(result.Status),
			FileName:               filepath.Base(result.Data.TargetPath),
			LineEndingOutcome:      string(result.Data.LineEndingOutcome),
			BOMOutcome:             string(result.Data.BOMOutcome),
			TargetPathAdopted:      result.Data.TargetPathAdopted,
			WrittenContentRevision: result.Data.WrittenContentRevision,
			ResyncRequired:         result.Data.ResyncRequired,
		}
		row.Confirmation.Encoding = explicitSaveEncoding(ctx, model, plan.documentID)
		if row.Confirmation.FileName == "" || row.Confirmation.LineEndingOutcome == "" {
			failures = append(failures, "the FR-FT-015 confirmation payload is missing the file name or the line-ending outcome")
		}
	}
	if !committed {
		failures = append(failures, "no explicit write-commit observation was recorded for the dispatched save")
	} else if commit.origin != plan.expectedOrigin {
		failures = append(failures, fmt.Sprintf("commit origin %q, want %q", commit.origin, plan.expectedOrigin))
	}
	if overwritePrompts != 0 {
		failures = append(failures, fmt.Sprintf("%d native overwrite prompts were raised; the target directory was not empty", overwritePrompts))
	}
	// Fixture A must route through Save As exactly once; Fixture B must not
	// reach the chooser at all, because a path-backed document that lost its
	// path would silently turn an explicit Save into a Save As.
	expectedSaveChoices := 0
	if plan.saveAsTarget != "" {
		expectedSaveChoices = 1
	}
	if saveChoices != expectedSaveChoices {
		failures = append(failures, fmt.Sprintf("the save chooser was consulted %d times, want %d", saveChoices, expectedSaveChoices))
	}

	targetPath := row.TargetPath
	if targetPath == "" {
		targetPath = filepath.Join(plan.directory, plan.targetName)
	}
	if data, err := os.ReadFile(targetPath); err == nil {
		row.DiskBytes = len(data)
		digest := sha256.Sum256(data)
		row.DiskSHA256 = hex.EncodeToString(digest[:])
	} else {
		failures = append(failures, fmt.Sprintf("the saved target could not be read: %v", err))
	}

	after, snapshotErr := explicitSaveSnapshotDirectory(plan.directory)
	if snapshotErr != nil {
		failures = append(failures, snapshotErr.Error())
	}
	row.AfterSnapshot = after
	row.Directory = explicitSaveEvaluateDirectory(plan.before, after, filepath.Base(targetPath))
	failures = append(failures, row.Directory.Failures...)

	row.WithinBudget = row.ReadyToConfirmationNs > 0 && row.ReadyToConfirmationNs < int64(explicitSaveBudget)
	if !row.WithinBudget {
		failures = append(failures, fmt.Sprintf("ready-to-confirmation %d ns is not inside the %d ns budget", row.ReadyToConfirmationNs, int64(explicitSaveBudget)))
	}

	if len(failures) == 0 {
		row.Status = "passed"
		return row
	}
	row.Failure = strings.Join(failures, "; ")
	return row
}

func explicitSaveFailedRow(fixture, description string, origin appmodel.SaveOrigin, err error) explicitSaveFixtureRow {
	return explicitSaveFixtureRow{
		Fixture:        fixture,
		Description:    description,
		ExpectedOrigin: string(origin),
		BudgetNs:       int64(explicitSaveBudget),
		BeforeSnapshot: []explicitSaveDirectoryEntry{},
		AfterSnapshot:  []explicitSaveDirectoryEntry{},
		Directory: explicitSaveDirectoryVerdict{
			Differences: []explicitSaveDirectoryDifference{},
			Residual:    []string{},
		},
		Status:  "failed",
		Failure: err.Error(),
	}
}

func explicitSaveContentRevision(ctx context.Context, model explicitSaveDriverModel, documentID string) (uint64, error) {
	state, err := model.GetState(ctx)
	if err != nil {
		return 0, fmt.Errorf("read state before Save: %w", err)
	}
	document, ok := state.Snapshot.Documents[documentID]
	if !ok {
		return 0, fmt.Errorf("document %s is not open before Save", documentID)
	}
	return document.ContentRevision, nil
}

func explicitSaveEncoding(ctx context.Context, model explicitSaveDriverModel, documentID string) string {
	state, err := model.GetState(ctx)
	if err != nil {
		return ""
	}
	return state.Snapshot.Documents[documentID].Encoding
}

func explicitSaveClassifiedText(classified *apperr.ClassifiedError) string {
	if classified == nil {
		return "no classified error was returned"
	}
	return fmt.Sprintf("%s: %s", classified.Category, classified.Message)
}

// explicitSaveFixtureBContent builds exactly 1,024 bytes of uniformly
// LF-terminated text so no FR-FT-011 normalization sits inside the interval.
func explicitSaveFixtureBContent() string {
	line := strings.Repeat("a", explicitSaveFixtureBLineLength-1) + "\n"
	return strings.Repeat(line, explicitSaveFixtureBSize/explicitSaveFixtureBLineLength)
}

// explicitSaveEditOneCharacter replaces exactly one character and reports how
// many positions actually differ, so "exactly one" is measured, not assumed.
func explicitSaveEditOneCharacter(content string) (string, int) {
	runes := []rune(content)
	if len(runes) == 0 {
		return content, 0
	}
	original := runes[0]
	replacement := 'b'
	if original == replacement {
		replacement = 'a'
	}
	runes[0] = replacement
	edited := string(runes)
	return edited, explicitSaveChangedRunes(content, edited)
}

func explicitSaveChangedRunes(before, after string) int {
	beforeRunes := []rune(before)
	afterRunes := []rune(after)
	changed := len(beforeRunes) - len(afterRunes)
	if changed < 0 {
		changed = -changed
	}
	shortest := len(beforeRunes)
	if len(afterRunes) < shortest {
		shortest = len(afterRunes)
	}
	for index := 0; index < shortest; index++ {
		if beforeRunes[index] != afterRunes[index] {
			changed++
		}
	}
	return changed
}

func explicitSaveFreshDirectory(directory string) error {
	if err := os.RemoveAll(directory); err != nil {
		return fmt.Errorf("clear %s: %w", directory, err)
	}
	if err := os.MkdirAll(directory, 0o755); err != nil {
		return fmt.Errorf("create %s: %w", directory, err)
	}
	return nil
}

// explicitSaveSnapshotDirectory lists only the immediate members of one
// directory. It never descends: SC-FT-002 asks for a non-recursive snapshot.
func explicitSaveSnapshotDirectory(directory string) ([]explicitSaveDirectoryEntry, error) {
	entries, err := os.ReadDir(directory)
	if err != nil {
		return nil, fmt.Errorf("snapshot %s: %w", directory, err)
	}
	snapshot := make([]explicitSaveDirectoryEntry, 0, len(entries))
	for _, entry := range entries {
		info, infoErr := entry.Info()
		if infoErr != nil {
			return nil, fmt.Errorf("stat %s: %w", filepath.Join(directory, entry.Name()), infoErr)
		}
		record := explicitSaveDirectoryEntry{
			Name:      entry.Name(),
			Kind:      "file",
			SizeBytes: info.Size(),
			Mode:      info.Mode().Perm().String(),
		}
		switch {
		case entry.IsDir():
			record.Kind = "directory"
			record.SizeBytes = 0
		case !info.Mode().IsRegular():
			record.Kind = "other"
		default:
			data, readErr := os.ReadFile(filepath.Join(directory, entry.Name()))
			if readErr != nil {
				return nil, fmt.Errorf("read %s: %w", filepath.Join(directory, entry.Name()), readErr)
			}
			digest := sha256.Sum256(data)
			record.SHA256 = hex.EncodeToString(digest[:])
		}
		snapshot = append(snapshot, record)
	}
	sort.Slice(snapshot, func(i, j int) bool { return snapshot[i].Name < snapshot[j].Name })
	return snapshot, nil
}

// explicitSaveEvaluateDirectory enforces SC-FT-002's two directory clauses: the
// only permitted difference between the snapshots is the target file, and
// nothing but the target may survive in the directory afterwards.
func explicitSaveEvaluateDirectory(before, after []explicitSaveDirectoryEntry, targetName string) explicitSaveDirectoryVerdict {
	beforeByName := explicitSaveIndex(before)
	afterByName := explicitSaveIndex(after)
	names := make([]string, 0, len(beforeByName)+len(afterByName))
	seen := make(map[string]bool, len(beforeByName)+len(afterByName))
	for name := range beforeByName {
		if !seen[name] {
			seen[name] = true
			names = append(names, name)
		}
	}
	for name := range afterByName {
		if !seen[name] {
			seen[name] = true
			names = append(names, name)
		}
	}
	sort.Strings(names)

	verdict := explicitSaveDirectoryVerdict{
		Differences: make([]explicitSaveDirectoryDifference, 0, len(names)),
		Residual:    make([]string, 0, len(names)),
		Failures:    make([]string, 0, 2),
	}
	unexpected := make([]string, 0, len(names))
	for _, name := range names {
		beforeEntry, inBefore := beforeByName[name]
		afterEntry, inAfter := afterByName[name]
		switch {
		case inBefore && inAfter && beforeEntry.fingerprint() == afterEntry.fingerprint():
			continue
		case !inBefore:
			verdict.Differences = append(verdict.Differences, explicitSaveDirectoryDifference{Name: name, Change: "added", After: afterEntry.fingerprint()})
		case !inAfter:
			verdict.Differences = append(verdict.Differences, explicitSaveDirectoryDifference{Name: name, Change: "removed", Before: beforeEntry.fingerprint()})
		default:
			verdict.Differences = append(verdict.Differences, explicitSaveDirectoryDifference{Name: name, Change: "modified", Before: beforeEntry.fingerprint(), After: afterEntry.fingerprint()})
		}
		if name != targetName {
			unexpected = append(unexpected, name)
		}
	}
	for _, entry := range after {
		if entry.Name == targetName {
			continue
		}
		verdict.Residual = append(verdict.Residual, fmt.Sprintf("%s (%s)", entry.Name, explicitSaveLeftoverReason(entry.Name)))
	}
	if len(unexpected) > 0 {
		verdict.Failures = append(verdict.Failures, fmt.Sprintf("the snapshots differ outside the target file: %s", strings.Join(unexpected, ", ")))
	}
	if len(verdict.Residual) > 0 {
		verdict.Failures = append(verdict.Failures, fmt.Sprintf("the target directory still contains %s", strings.Join(verdict.Residual, ", ")))
	}
	return verdict
}

func explicitSaveIndex(entries []explicitSaveDirectoryEntry) map[string]explicitSaveDirectoryEntry {
	index := make(map[string]explicitSaveDirectoryEntry, len(entries))
	for _, entry := range entries {
		index[entry.Name] = entry
	}
	return index
}

// explicitSaveLeftoverReason names why a surviving entry fails SC-FT-002. Every
// entry other than the target fails; the reason only says which kind it is.
func explicitSaveLeftoverReason(name string) string {
	switch {
	case strings.HasPrefix(name, explicitSaveTemporaryPrefix):
		return "FR-FT-009 same-directory atomic-replace temporary file"
	case strings.HasPrefix(name, "."):
		return "dotfile"
	case strings.HasSuffix(name, ".tmp"), strings.HasSuffix(name, ".temp"):
		return "temporary file"
	case strings.HasSuffix(name, ".swp"), strings.HasSuffix(name, ".swo"), strings.HasSuffix(name, ".swx"):
		return "swap file"
	case strings.HasSuffix(name, ".bak"), strings.HasSuffix(name, ".orig"), strings.HasSuffix(name, "~"):
		return "backup file"
	}
	return "additional file"
}

func explicitSaveStamp(at time.Time) string {
	if at.IsZero() {
		return ""
	}
	return at.Format(time.RFC3339Nano)
}

func (scenario *explicitSaveLatencyScenario) summaryLocked() string {
	passed, failed := 0, 0
	for _, row := range scenario.rows {
		if row.Status == "passed" {
			passed++
			continue
		}
		failed++
	}
	summary := map[string]interface{}{
		"scenario":   explicitSaveScenarioName,
		"passed":     passed,
		"failed":     failed,
		"reportPath": scenario.reportPath,
	}
	encoded, err := json.Marshal(summary)
	if err != nil {
		return fmt.Sprintf(`{"scenario":%q,"passed":%d,"failed":%d}`, explicitSaveScenarioName, passed, failed)
	}
	return string(encoded)
}

func (scenario *explicitSaveLatencyScenario) writeReportLocked(complete bool) {
	report := explicitSaveLatencyReport{
		Scenario:           explicitSaveScenarioName,
		Status:             "running",
		StartedAt:          scenario.startedAt.Format(time.RFC3339Nano),
		ReadyAt:            explicitSaveStamp(scenario.readyAt),
		BudgetNs:           int64(explicitSaveBudget),
		FixtureCount:       len(scenario.rows),
		IgnoredCommits:     explicitSaveCloneCounts(scenario.ignoredCommits),
		Rows:               append([]explicitSaveFixtureRow(nil), scenario.rows...),
		Metadata:           explicitSaveMetadata(scenario.workspace),
		ReportPath:         scenario.reportPath,
		WorkspaceDirectory: scenario.workspace,
	}
	for _, row := range report.Rows {
		if row.Status == "passed" {
			report.Passed++
			continue
		}
		report.Failed++
	}
	if complete {
		report.Status = "complete"
		if report.Failed > 0 {
			report.Status = "failed"
		}
		report.CompletedAt = time.Now().Format(time.RFC3339Nano)
	}
	data, err := json.MarshalIndent(report, "", "  ")
	if err != nil {
		return
	}
	temporary := scenario.reportPath + ".tmp"
	if err := os.WriteFile(temporary, data, 0o600); err != nil {
		return
	}
	_ = os.Rename(temporary, scenario.reportPath)
}

func explicitSaveCloneCounts(counts map[string]int) map[string]int {
	clone := make(map[string]int, len(counts))
	for key, value := range counts {
		clone[key] = value
	}
	return clone
}

func explicitSaveMetadata(workspace string) map[string]string {
	return map[string]string{
		"go":                 runtime.Version(),
		"os":                 runtime.GOOS,
		"arch":               runtime.GOARCH,
		"hostname":           nativeEvidenceHostname(),
		"filesystem":         nativeEvidenceFilesystem(workspace),
		"fixtureDirectory":   workspace,
		"buildTag":           "native_evidence",
		"releaseBuildParity": "internal/appmodel and internal/file use the production constructors and write path; only the build-tagged driver is added",
		"readyDefinition":    "readyAt is stamped in Go once Wails startup finished and the application accepted its first command.",
		"measurementScope":   "t0 is stamped in Go immediately before the explicit Save/Save As dispatch; the confirmation stamp is taken when the successful FR-FT-015 WriteResult returns to the caller, and the commit stamp comes from the write-commit observer in between.",
		"fixtureSequencing":  "Both fixtures run in one process, so readyToConfirmationNs for Fixture B also contains Fixture A's walkthrough. That over-counts against the 30 s budget and is the number the budget is checked with; fixtureToConfirmationNs isolates one fixture.",
		"limitation":         "This is not the just build artifact, and no human typing, window-server input latency, or packaged .app launch is inside any interval. It measures the application's own ready-to-confirmation contribution only.",
	}
}
