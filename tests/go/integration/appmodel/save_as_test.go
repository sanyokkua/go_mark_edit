package appmodel_test

import (
	"context"
	"os"
	"path/filepath"
	"sync"
	"testing"
	"time"

	"github.com/sanyokkua/go_mark_edit/internal/apperr"
	"github.com/sanyokkua/go_mark_edit/internal/appmodel"
	"github.com/sanyokkua/go_mark_edit/internal/file"
)

func TestSaveAsDuringAutosaveKeepsBothDiskCopiesAndLeavesTheDocumentClean(t *testing.T) {
	directory := t.TempDir()
	source := filepath.Join(directory, "old.md")
	target := filepath.Join(directory, "new.md")
	resolvedDirectory, err := filepath.EvalSymlinks(directory)
	if err != nil {
		t.Fatalf("resolve temporary directory: %v", err)
	}
	wantTarget := filepath.Join(resolvedDirectory, "new.md")
	if err := os.WriteFile(source, []byte("old\n"), 0o644); err != nil {
		t.Fatalf("write source: %v", err)
	}
	clock := &manualAutosaveFactory{}
	started := make(chan struct{})
	release := make(chan struct{})
	firstSnapshot := make(chan string, 1)
	var writesMu sync.Mutex
	writes := 0
	service := appmodel.NewAppModelServiceForHost(
		appmodel.WithEmitter(&statePatchRecorder{}),
		appmodel.WithAutosaveTimer(clock),
		appmodel.WithDialogs(nil, saveDialog{path: target}),
		appmodel.WithWriteExecutor(func(snapshot appmodel.WriteSnapshot) (file.DiskVersion, error) {
			writesMu.Lock()
			writes++
			first := writes == 1
			writesMu.Unlock()
			if first {
				firstSnapshot <- snapshot.CanonicalContent
				close(started)
				<-release
			}
			if err := os.WriteFile(snapshot.TargetPath, []byte(snapshot.CanonicalContent), 0o644); err != nil {
				return file.DiskVersion{}, err
			}
			return file.CurrentDiskVersion(snapshot.TargetPath)
		}),
	)
	opened := service.OpenPath(context.Background(), source, 0)
	if opened.Status != appmodel.OpenStatusOpened {
		t.Fatalf("open status = %q, error = %+v", opened.Status, opened.Error)
	}
	if err := service.UpdateBuffer(context.Background(), opened.DocumentID, "autosave\n"); err != nil {
		t.Fatalf("first UpdateBuffer: %v", err)
	}

	go clock.fireNext()
	select {
	case <-started:
	case <-time.After(2 * time.Second):
		t.Fatal("autosave did not reach the write executor")
	}
	select {
	case got := <-firstSnapshot:
		if got != "autosave\n" {
			t.Fatalf("autosave snapshot = %q, want the first revision", got)
		}
	case <-time.After(2 * time.Second):
		t.Fatal("autosave snapshot was not captured")
	}
	if err := service.UpdateBuffer(context.Background(), opened.DocumentID, "newest after autosave\n"); err != nil {
		t.Fatalf("second UpdateBuffer: %v", err)
	}

	saveAsDone := make(chan apperr.WriteResult, 1)
	go func() {
		saveAsDone <- service.SaveAs(context.Background(), opened.DocumentID, 2, "")
	}()
	time.Sleep(20 * time.Millisecond)
	close(release)

	select {
	case result := <-saveAsDone:
		if result.Status != apperr.WriteStatusCommitted {
			t.Fatalf("SaveAs status = %q, error = %+v", result.Status, result.Error)
		}
	case <-time.After(2 * time.Second):
		t.Fatal("SaveAs did not finish after autosave released")
	}
	if got, err := os.ReadFile(source); err != nil || string(got) != "autosave\n" {
		t.Fatalf("old path content = %q, error = %v; want autosave snapshot", got, err)
	}
	if got, err := os.ReadFile(target); err != nil || string(got) != "newest after autosave\n" {
		t.Fatalf("new path content = %q, error = %v; want Save As snapshot", got, err)
	}
	service.SetAutosaveEnabled(false)
	state, err := service.GetState(context.Background())
	if err != nil {
		t.Fatalf("GetState: %v", err)
	}
	metadata := state.Snapshot.Documents[opened.DocumentID]
	if metadata.Path != wantTarget {
		t.Fatalf("document path after SaveAs = %q, want %q", metadata.Path, wantTarget)
	}
	if metadata.Dirty {
		t.Fatalf("document remained dirty after SaveAs: %+v", metadata)
	}
}
