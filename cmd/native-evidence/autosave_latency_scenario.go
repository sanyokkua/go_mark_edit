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
	"os/exec"
	"path/filepath"
	"runtime"
	"sort"
	"strings"
	"sync"
	"time"

	"github.com/sanyokkua/go_mark_edit/internal/appmodel"
	wailsruntime "github.com/wailsapp/wails/v2/pkg/runtime"
)

const (
	autosaveInputEvent  = "native-evidence-autosave-input"
	autosaveCommitEvent = "native-evidence-autosave-commit"
	autosaveMissEvent   = "native-evidence-autosave-miss"
	autosaveReportName  = "autosave-latency-report.json"
)

var autosaveLatencySizes = []int{1024, 262144, 1048576, 2097152}

type autosaveLatencyInput struct {
	Trial      int    `json:"trial"`
	Warmup     bool   `json:"warmup"`
	SizeBytes  int    `json:"sizeBytes"`
	DocumentID string `json:"documentId"`
}

type autosaveLatencyRow struct {
	Trial             int    `json:"trial"`
	Warmup            bool   `json:"warmup"`
	SizeBytes         int    `json:"sizeBytes"`
	DocumentID        string `json:"documentId"`
	ContentRevision   uint64 `json:"contentRevision"`
	CommitIdentity    string `json:"commitIdentity"`
	Status            string `json:"status"`
	T0                string `json:"t0,omitempty"`
	T1                string `json:"t1,omitempty"`
	DurationNs        int64  `json:"durationNs,omitempty"`
	DiskBytes         int    `json:"diskBytes,omitempty"`
	DiskSHA256        string `json:"diskSha256,omitempty"`
	ExpectedDiskBytes int    `json:"expectedDiskBytes"`
	ChangedCharacters int    `json:"changedCharacters"`
	Failure           string `json:"failure,omitempty"`
}

type autosaveLatencyReport struct {
	Scenario         string               `json:"scenario"`
	Status           string               `json:"status"`
	StartedAt        string               `json:"startedAt"`
	CompletedAt      string               `json:"completedAt,omitempty"`
	WarmupCount      int                  `json:"warmupCount"`
	MeasuredCount    int                  `json:"measuredCount"`
	WarmupSuccessful int                  `json:"warmupSuccessful"`
	WarmupMisses     int                  `json:"warmupMisses"`
	Successful       int                  `json:"successful"`
	Misses           int                  `json:"misses"`
	AtOrBelow5s      int                  `json:"atOrBelow5s"`
	Percentiles      autosavePercentiles  `json:"percentiles"`
	Rows             []autosaveLatencyRow `json:"rows"`
	Metadata         map[string]string    `json:"metadata"`
	ReportPath       string               `json:"reportPath"`
}

type autosavePercentiles struct {
	P50DurationNs int64 `json:"p50DurationNs"`
	P95DurationNs int64 `json:"p95DurationNs"`
	MaxDurationNs int64 `json:"maxDurationNs"`
}

type autosavePendingInput struct {
	input autosaveLatencyInput
	t0    time.Time
}

type autosaveLatencyScenario struct {
	mu           sync.Mutex
	context      context.Context
	fixturePaths []string
	openIndex    int
	pending      map[string]autosavePendingInput
	rows         []autosaveLatencyRow
	startedAt    time.Time
	reportPath   string
	completed    bool
}

var _ appmodel.DocumentOpenDialog = (*autosaveLatencyScenario)(nil)

func newAutosaveLatencyScenario(databaseDir string) (*autosaveLatencyScenario, error) {
	fixtureDir := filepath.Join(databaseDir, "autosave-fixtures")
	if err := os.MkdirAll(fixtureDir, 0o755); err != nil {
		return nil, fmt.Errorf("create autosave fixtures: %w", err)
	}
	paths := make([]string, 0, len(autosaveLatencySizes))
	for _, size := range autosaveLatencySizes {
		path := filepath.Join(fixtureDir, fmt.Sprintf("autosave-%d.bin.md", size))
		data := []byte(strings.Repeat("a", size))
		if err := os.WriteFile(path, data, 0o600); err != nil {
			return nil, fmt.Errorf("write autosave fixture %d: %w", size, err)
		}
		paths = append(paths, path)
	}
	return &autosaveLatencyScenario{
		fixturePaths: paths,
		pending:      make(map[string]autosavePendingInput),
		startedAt:    time.Now(),
		reportPath:   filepath.Join(databaseDir, autosaveReportName),
	}, nil
}

func (scenario *autosaveLatencyScenario) ChooseOpenFile(context.Context) (string, error) {
	scenario.mu.Lock()
	defer scenario.mu.Unlock()
	if scenario.openIndex >= len(scenario.fixturePaths) {
		return "", errors.New("autosave latency fixture sequence exhausted")
	}
	path := scenario.fixturePaths[scenario.openIndex]
	scenario.openIndex++
	return path, nil
}

func (scenario *autosaveLatencyScenario) attachContext(ctx context.Context) {
	scenario.mu.Lock()
	scenario.context = ctx
	scenario.mu.Unlock()
}

func (scenario *autosaveLatencyScenario) recordInput(data ...interface{}) {
	input, err := decodeAutosaveInput(data...)
	if err != nil || input.DocumentID == "" || input.SizeBytes <= 0 {
		return
	}
	scenario.mu.Lock()
	scenario.pending[input.DocumentID] = autosavePendingInput{input: input, t0: time.Now()}
	scenario.mu.Unlock()
}

func (scenario *autosaveLatencyScenario) recordMiss(data ...interface{}) {
	input, err := decodeAutosaveInput(data...)
	if err != nil || input.DocumentID == "" {
		return
	}
	now := time.Now()
	scenario.mu.Lock()
	pending, ok := scenario.pending[input.DocumentID]
	if ok {
		delete(scenario.pending, input.DocumentID)
	}
	if !ok {
		pending = autosavePendingInput{input: input, t0: now}
	}
	row := autosaveLatencyRow{
		Trial: input.Trial, Warmup: input.Warmup, SizeBytes: input.SizeBytes,
		DocumentID: input.DocumentID, Status: "missed", T0: pending.t0.Format(time.RFC3339Nano),
		ExpectedDiskBytes: input.SizeBytes, ChangedCharacters: 1, Failure: "no atomic commit acknowledgement before timeout",
	}
	scenario.rows = append(scenario.rows, row)
	scenario.writeReportLocked(false)
	ctx := scenario.context
	scenario.mu.Unlock()
	if ctx != nil {
		wailsruntime.EventsEmit(ctx, autosaveCommitEvent, row)
	}
}

func (scenario *autosaveLatencyScenario) recordCommit(committed appmodel.CommittedWriteResult, origin appmodel.SaveOrigin) {
	if origin != appmodel.SaveOriginAutosave {
		return
	}
	t1 := time.Now()
	documentID := committed.Snapshot.DocumentID
	scenario.mu.Lock()
	pending, ok := scenario.pending[documentID]
	if ok {
		delete(scenario.pending, documentID)
	}
	if !ok {
		// A commit without a harness acknowledgement is still retained as a
		// failed observation; it must never be silently discarded.
		pending = autosavePendingInput{input: autosaveLatencyInput{DocumentID: documentID, SizeBytes: len(committed.Snapshot.CanonicalContent)}, t0: t1}
	}
	row := autosaveLatencyRow{
		Trial: pending.input.Trial, Warmup: pending.input.Warmup, SizeBytes: pending.input.SizeBytes,
		DocumentID: documentID, ContentRevision: committed.Snapshot.ContentRevision,
		CommitIdentity: fmt.Sprintf("%s@revision-%d", documentID, committed.Snapshot.ContentRevision),
		Status:         "committed", T0: pending.t0.Format(time.RFC3339Nano), T1: t1.Format(time.RFC3339Nano),
		DurationNs: t1.Sub(pending.t0).Nanoseconds(), ExpectedDiskBytes: pending.input.SizeBytes,
		ChangedCharacters: 1,
	}
	if data, err := os.ReadFile(committed.Snapshot.TargetPath); err == nil {
		row.DiskBytes = len(data)
		digest := sha256.Sum256(data)
		row.DiskSHA256 = hex.EncodeToString(digest[:])
	} else {
		row.Status = "missed"
		row.Failure = fmt.Sprintf("committed path could not be read: %v", err)
	}
	scenario.rows = append(scenario.rows, row)
	complete := scenario.measuredCountLocked() == 100 && scenario.warmupCountLocked() == 20
	if complete {
		scenario.completed = true
	}
	scenario.writeReportLocked(complete)
	ctx := scenario.context
	scenario.mu.Unlock()
	if ctx != nil {
		wailsruntime.EventsEmit(ctx, autosaveCommitEvent, row)
	}
}

func (scenario *autosaveLatencyScenario) measuredCountLocked() int {
	count := 0
	for _, row := range scenario.rows {
		if !row.Warmup {
			count++
		}
	}
	return count
}

func (scenario *autosaveLatencyScenario) warmupCountLocked() int {
	count := 0
	for _, row := range scenario.rows {
		if row.Warmup {
			count++
		}
	}
	return count
}

func (scenario *autosaveLatencyScenario) writeReportLocked(complete bool) {
	status := "running"
	if complete {
		status = "complete"
	}
	report := autosaveLatencyReport{
		Scenario: "autosave-latency", Status: status, StartedAt: scenario.startedAt.Format(time.RFC3339Nano),
		WarmupCount: scenario.warmupCountLocked(), MeasuredCount: scenario.measuredCountLocked(),
		Rows: append([]autosaveLatencyRow(nil), scenario.rows...), ReportPath: scenario.reportPath,
		Metadata: autosaveLatencyMetadata(scenario.fixturePaths),
	}
	for _, row := range report.Rows {
		if row.Warmup {
			if row.Status == "committed" {
				report.WarmupSuccessful++
			} else {
				report.WarmupMisses++
			}
			continue
		}
		if row.Status == "committed" {
			report.Successful++
			if row.DurationNs <= int64(5*time.Second) {
				report.AtOrBelow5s++
			}
		} else {
			report.Misses++
		}
	}
	durations := make([]int64, 0, report.Successful)
	for _, row := range report.Rows {
		if !row.Warmup && row.Status == "committed" {
			durations = append(durations, row.DurationNs)
		}
	}
	sort.Slice(durations, func(i, j int) bool { return durations[i] < durations[j] })
	if len(durations) > 0 {
		report.Percentiles = autosavePercentiles{
			P50DurationNs: durations[(len(durations)-1)*50/100],
			P95DurationNs: durations[(len(durations)-1)*95/100],
			MaxDurationNs: durations[len(durations)-1],
		}
	}
	if complete {
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

func autosaveLatencyMetadata(fixturePaths []string) map[string]string {
	fixtureDir := ""
	if len(fixturePaths) > 0 {
		fixtureDir = filepath.Dir(fixturePaths[0])
	}
	return map[string]string{
		"go":                 runtime.Version(),
		"os":                 runtime.GOOS,
		"arch":               runtime.GOARCH,
		"hostname":           nativeEvidenceHostname(),
		"filesystem":         nativeEvidenceFilesystem(fixtureDir),
		"fixtureDirectory":   fixtureDir,
		"buildTag":           "native_evidence",
		"releaseBuildParity": "internal/appmodel and internal/file compile to identical Go package build IDs under the release tag set (desktop,wv2runtime.download,production, -ldflags '-w -s') and under 'native_evidence production'; neither package has a cgo file and neither has a native_evidence build constraint, so the measured write path is the same object code the release binary links",
		"limitation":         "This is not the just build artifact. The release binary has no write-commit observer (SetWriteCommitObserver has no production caller) and its embedded frontend has no scripted input driver, so this protocol cannot be run against it without changing it. T121 reconciled the build mechanically instead; T181 owns the interactive host spot-check.",
	}
}

func decodeAutosaveInput(data ...interface{}) (autosaveLatencyInput, error) {
	if len(data) == 0 {
		return autosaveLatencyInput{}, errors.New("autosave input event has no payload")
	}
	encoded, err := json.Marshal(data[0])
	if err != nil {
		return autosaveLatencyInput{}, err
	}
	var input autosaveLatencyInput
	if err := json.Unmarshal(encoded, &input); err != nil {
		return autosaveLatencyInput{}, err
	}
	return input, nil
}

func nativeEvidenceHostname() string {
	hostname, err := os.Hostname()
	if err != nil {
		return "unknown"
	}
	return hostname
}

func nativeEvidenceFilesystem(path string) string {
	if path == "" {
		return "unknown"
	}
	if runtime.GOOS == "darwin" {
		output, err := exec.Command("df", "-P", path).Output()
		if err == nil {
			lines := strings.Split(strings.TrimSpace(string(output)), "\n")
			if len(lines) > 1 {
				fields := strings.Fields(lines[len(lines)-1])
				if len(fields) >= 6 {
					filesystemType := "unknown"
					if info, infoErr := exec.Command("diskutil", "info", fields[0]).Output(); infoErr == nil {
						for _, line := range strings.Split(string(info), "\n") {
							const label = "Type (Bundle):"
							if strings.HasPrefix(strings.TrimSpace(line), label) {
								filesystemType = strings.TrimSpace(strings.TrimPrefix(strings.TrimSpace(line), label))
								break
							}
						}
					}
					return fmt.Sprintf("type=%s device=%s mount=%s", filesystemType, fields[0], strings.Join(fields[5:], " "))
				}
			}
		}
	}
	if runtime.GOOS == "linux" {
		output, err := exec.Command("stat", "-f", "-c", "%T", path).Output()
		if err == nil {
			return strings.TrimSpace(string(output))
		}
	}
	return "unknown"
}
