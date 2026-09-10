//go:build native_evidence

package main

import (
	"context"
	"os"
	"path/filepath"
	"testing"
	"time"

	"github.com/sanyokkua/go_mark_edit/internal/apperr"
	"github.com/sanyokkua/go_mark_edit/internal/appmodel"
)

type autosaveLatencyTestEmitter struct{}

func (autosaveLatencyTestEmitter) EmitStatePatch(context.Context, apperr.AppStatePatch) error {
	return nil
}

func TestAutosaveLatencyScenarioUsesSystemTimer(t *testing.T) {
	t.Parallel()
	path := filepath.Join(t.TempDir(), "system-timer.md")
	if err := os.WriteFile(path, []byte("before"), 0o600); err != nil {
		t.Fatal(err)
	}
	service := appmodel.NewAppModelServiceForHost(appmodel.WithEmitter(autosaveLatencyTestEmitter{}))
	opened := service.OpenPath(context.Background(), path, 0)
	if opened.ActiveBuffer == nil {
		t.Fatalf("OpenPath returned no active buffer: %+v", opened)
	}
	if err := service.UpdateBuffer(context.Background(), opened.DocumentID, "after"); err != nil {
		t.Fatal(err)
	}
	deadline := time.Now().Add(3 * time.Second)
	for time.Now().Before(deadline) {
		data, err := os.ReadFile(path)
		if err == nil && string(data) == "after" {
			return
		}
		time.Sleep(25 * time.Millisecond)
	}
	data, _ := os.ReadFile(path)
	t.Fatalf("production autosave timer did not commit within 3s; disk=%q", string(data))
}

func TestAutosaveLatencyStampsSpanSynchronizationAndDebounce(t *testing.T) {
	t.Parallel()
	scenario, err := newAutosaveLatencyScenario(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	input := map[string]interface{}{
		"trial": 1, "warmup": false, "sizeBytes": 1024, "documentId": "doc-1",
	}
	scenario.recordInput(input)
	time.Sleep(2 * time.Millisecond)
	path := scenario.fixturePaths[0]
	scenario.recordCommit(appmodel.CommittedWriteResult{
		Snapshot: appmodel.WriteSnapshot{
			DocumentID: "doc-1", ContentRevision: 7, CanonicalContent: "after", TargetPath: path,
		},
	}, appmodel.SaveOriginAutosave)

	scenario.mu.Lock()
	defer scenario.mu.Unlock()
	if len(scenario.rows) != 1 {
		t.Fatalf("rows = %d, want one retained measurement", len(scenario.rows))
	}
	row := scenario.rows[0]
	if row.Status != "committed" || row.ContentRevision != 7 || row.DurationNs <= 0 {
		t.Fatalf("row = %+v, want monotonic t0-to-t1 committed span", row)
	}
	if row.ExpectedDiskBytes != 1024 || row.DiskBytes != 1024 {
		t.Fatalf("row disk bytes = %d/%d, want 1024", row.DiskBytes, row.ExpectedDiskBytes)
	}
}
