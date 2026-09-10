package appmodel

import (
	"context"
	"fmt"
	"os"
	"path/filepath"
	"testing"
	"time"

	"github.com/sanyokkua/go_mark_edit/internal/apperr"
	"github.com/sanyokkua/go_mark_edit/internal/file"
)

type retentionTimer struct{}

func (retentionTimer) Stop() bool { return true }

type retentionEmitter struct{}

func (retentionEmitter) EmitStatePatch(context.Context, apperr.AppStatePatch) error { return nil }

func (retentionEmitter) EmitAsyncError(context.Context, apperr.WireError) error { return nil }

func TestDisposeReleasesDocumentOwnedResources(t *testing.T) {
	service := NewAppModelServiceForHost(WithEmitter(&retentionEmitter{}))
	documentID := service.state.activeDocumentID
	service.mu.Lock()
	document := service.state.documents[documentID]
	document.writeQueue = NewDocumentWriteCoordinator(func(WriteSnapshot) (file.DiskVersion, error) {
		return file.DiskVersion{}, nil
	})
	document.autosave = &autosaveTimerEntry{timer: retentionTimer{}}
	document.activationToken = "activation"
	document.saveReservation = &saveReservation{id: "save", identity: file.Identity{Device: 1, Inode: 2}}
	document.normalization = &normalizationAuthorization{token: "normalization", documentID: documentID}
	document.conflict = &documentConflict{}
	document.keepMine = map[string]*keepMineAuthorization{"keep": {token: "keep", documentID: documentID}}
	service.mu.Unlock()

	closed := service.CloseDocument(context.Background(), documentID, 0)
	if closed.Error != nil {
		t.Fatalf("CloseDocument: %v", closed.Error)
	}

	service.mu.RLock()
	_, stillOpen := service.state.documents[documentID]
	service.mu.RUnlock()
	if stillOpen {
		t.Fatal("disposed document remains in the lifecycle index")
	}
	if document.writeQueue != nil || document.autosave != nil || document.autosaveInFlight != nil || document.activationToken != "" || document.saveReservation != nil || document.normalization != nil || document.conflict != nil || document.keepMine != nil {
		t.Fatalf("disposed document retained resources: %+v", document)
	}
}

func TestManyDocumentsCanBeSavedAndClosedWithoutRetainedRecords(t *testing.T) {
	service := NewAppModelServiceForHost(WithEmitter(&retentionEmitter{}))
	ctx := context.Background()
	const documentsToExercise = 40
	ids := make([]string, 0, documentsToExercise)
	records := make([]*openDocument, 0, documentsToExercise)

	for index := 0; index < documentsToExercise; index++ {
		path := filepath.Join(t.TempDir(), fmt.Sprintf("document-%02d.md", index))
		if err := os.WriteFile(path, []byte("disk\n"), 0o644); err != nil {
			t.Fatalf("write document %d: %v", index, err)
		}
		state, err := service.GetState(ctx)
		if err != nil {
			t.Fatalf("GetState before open %d: %v", index, err)
		}
		opened := service.OpenPath(ctx, path, state.Snapshot.TabSetRevision)
		if opened.Status != OpenStatusOpened {
			t.Fatalf("open document %d status = %q, error = %+v", index, opened.Status, opened.Error)
		}
		if err := service.UpdateBuffer(ctx, opened.DocumentID, fmt.Sprintf("edited %d\n", index)); err != nil {
			t.Fatalf("edit document %d: %v", index, err)
		}
		state, err = service.GetState(ctx)
		if err != nil {
			t.Fatalf("GetState after edit %d: %v", index, err)
		}
		metadata := state.Snapshot.Documents[opened.DocumentID]
		if result := service.Save(ctx, opened.DocumentID, metadata.ContentRevision, ""); result.Status != apperr.WriteStatusCommitted {
			t.Fatalf("save document %d = %+v", index, result)
		}
		service.mu.RLock()
		record := service.state.documents[opened.DocumentID]
		service.mu.RUnlock()
		ids = append(ids, opened.DocumentID)
		records = append(records, record)
	}

	for index, documentID := range ids {
		state, err := service.GetState(ctx)
		if err != nil {
			t.Fatalf("GetState before close %d: %v", index, err)
		}
		closed := service.CloseDocument(ctx, documentID, state.Snapshot.TabSetRevision)
		if closed.Status != apperr.TabTransitionClosed || closed.Error != nil {
			t.Fatalf("close document %d = %+v", index, closed)
		}
	}

	service.mu.RLock()
	remaining := len(service.state.documents)
	service.mu.RUnlock()
	if remaining != 0 {
		t.Fatalf("documents remaining after disposal = %d, want no exercised documents", remaining)
	}
	for index, record := range records {
		if record.content != "" || record.baseline != "" || record.writeQueue != nil || record.autosave != nil || record.autosaveInFlight != nil || record.activationToken != "" || record.saveReservation != nil || record.normalization != nil || record.conflict != nil || record.keepMine != nil {
			t.Fatalf("document %d retained lifecycle state after disposal: %+v", index, record)
		}
	}
}

func TestClosingDocumentRejectsAWriteThatHasNotStarted(t *testing.T) {
	var executor WriteExecutor
	service := NewAppModelServiceForHost(WithEmitter(&retentionEmitter{}), WithWriteExecutor(func(snapshot WriteSnapshot) (file.DiskVersion, error) {
		return executor(snapshot)
	}))
	path := filepath.Join(t.TempDir(), "closing.md")
	if err := os.WriteFile(path, []byte("disk\n"), 0o644); err != nil {
		t.Fatalf("write document: %v", err)
	}
	opened := service.OpenPath(context.Background(), path, 0)
	if opened.Status != OpenStatusOpened {
		t.Fatalf("OpenPath = %+v", opened)
	}

	var executorCalls int
	executor = func(snapshot WriteSnapshot) (file.DiskVersion, error) {
		executorCalls++
		return file.DiskVersion{Exists: true, Size: int64(len(snapshot.EncodedData))}, nil
	}

	service.mu.Lock()
	document := service.state.documents[opened.DocumentID]
	document.closing = true
	snapshot := writeSnapshot{
		documentID:      opened.DocumentID,
		contentRevision: document.metadata.ContentRevision,
		content:         document.content,
		path:            document.metadata.Path,
		identity:        document.identity,
		metadata:        document.metadata,
		expectedVersion: document.baselineVersion,
	}
	service.mu.Unlock()

	result := service.executeWrite(context.Background(), snapshot, SaveOriginExplicitSave)
	if result.Status != apperr.WriteStatusRefused || result.Error == nil || result.Error.Category != apperr.ClassifiedConflict {
		t.Fatalf("write during close = %+v, want a classified conflict refusal", result)
	}
	if executorCalls != 0 {
		t.Fatalf("write executor calls during close = %d, want 0", executorCalls)
	}
}

func TestCloseDocumentsSealsTheRecordBeforeWaitingForWrites(t *testing.T) {
	service := NewAppModelServiceForHost(WithEmitter(&retentionEmitter{}))
	documentID := service.state.activeDocumentID
	service.mu.Lock()
	service.state.documents[documentID].writeInFlight = true
	service.mu.Unlock()

	closed := make(chan apperr.TabTransitionResult, 1)
	go func() {
		closed <- service.closeDocuments(context.Background(), []string{documentID}, nil)
	}()

	deadline := time.NewTimer(time.Second)
	defer deadline.Stop()
	for {
		service.mu.RLock()
		document := service.state.documents[documentID]
		sealed := document != nil && document.closing
		service.mu.RUnlock()
		if sealed {
			break
		}
		select {
		case result := <-closed:
			t.Fatalf("closeDocuments completed before sealing the record: %+v", result)
		case <-deadline.C:
			t.Fatal("closeDocuments did not establish its write barrier")
		default:
			time.Sleep(time.Millisecond)
		}
	}

	if accepted := service.setWriteInFlight(context.Background(), documentID, true); accepted {
		t.Fatal("a new write was accepted after the close barrier")
	}

	service.mu.Lock()
	service.state.documents[documentID].writeInFlight = false
	service.mu.Unlock()

	select {
	case result := <-closed:
		if result.Error != nil || result.Status != apperr.TabTransitionClosed {
			t.Fatalf("closeDocuments = %+v", result)
		}
	case <-time.After(time.Second):
		t.Fatal("closeDocuments did not finish after the accepted write drained")
	}
}
