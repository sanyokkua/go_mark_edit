package appmodel

import (
	"context"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"sync/atomic"
	"testing"
	"time"

	"github.com/sanyokkua/go_mark_edit/internal/apperr"
	"github.com/sanyokkua/go_mark_edit/internal/file"
)

type retentionTimer struct{}

func (retentionTimer) Stop() bool { return true }

type retentionClock struct{ callbacks []func() }

type immediateAutosaveClock struct{}

type observedAutosaveTimer struct{ stopped atomic.Bool }

func (timer *observedAutosaveTimer) Stop() bool { timer.stopped.Store(true); return true }

type delayedAutosaveClock struct {
	firstStarted chan struct{}
	releaseFirst chan struct{}
	first        *observedAutosaveTimer
	calls        atomic.Int32
}

func (clock *delayedAutosaveClock) AfterFunc(_ time.Duration, _ func()) AutosaveTimer {
	timer := &observedAutosaveTimer{}
	if clock.calls.Add(1) == 1 {
		clock.first = timer
		close(clock.firstStarted)
		<-clock.releaseFirst
	}
	return timer
}

func (immediateAutosaveClock) AfterFunc(_ time.Duration, callback func()) AutosaveTimer {
	callback()
	return retentionTimer{}
}

func (clock *retentionClock) AfterFunc(_ time.Duration, callback func()) AutosaveTimer {
	clock.callbacks = append(clock.callbacks, callback)
	return retentionTimer{}
}

func TestDiscardFenceRetainsLatestAutosaveUntilCancel(t *testing.T) {
	service := NewAppModelServiceForHost(WithEmitter(&retentionEmitter{}))
	id := newRetentionDocument(t, service)
	clock := &retentionClock{}
	service.mu.Lock()
	doc := service.state.documents[id]
	doc.metadata.Path = filepath.Join(t.TempDir(), "file.md")
	doc.metadata.Capability = string(file.CapabilityWritable)
	doc.metadata.ContentRevision = 1
	service.autosaveTimer = clock
	service.mu.Unlock()
	service.scheduleAutosave(id, 1)
	service.BeginShutdownDiscard()
	service.mu.Lock()
	doc.metadata.ContentRevision = 2
	service.mu.Unlock()
	service.scheduleAutosave(id, 2)
	service.scheduleAutosave(id, 1)
	service.mu.Lock()
	doc.metadata.ContentRevision = 3
	service.mu.Unlock()
	service.scheduleAutosave(id, 3)
	if service.setWriteInFlight(context.Background(), id, true) {
		t.Fatal("fence admitted a new write")
	}
	if len(clock.callbacks) != 1 {
		t.Fatalf("armed %d timers while fenced", len(clock.callbacks))
	}
	clock.callbacks[0]()
	service.mu.RLock()
	held := doc.autosave
	service.mu.RUnlock()
	if held == nil || held.revision != 3 {
		t.Fatal("fence lost the latest intent")
	}
	service.EndShutdownDrain()
	if len(clock.callbacks) != 2 {
		t.Fatalf("cancel armed %d timers, want 2", len(clock.callbacks))
	}
}

func TestSynchronousAutosaveTimerDoesNotLeaveFiredHandleInstalled(t *testing.T) {
	service := NewAppModelServiceForHost(WithEmitter(&retentionEmitter{}), AppModelOption{AutosaveTimer: immediateAutosaveClock{}})
	path, id := openWarningDocument(t, service, t.TempDir())
	if err := service.UpdateBuffer(context.Background(), id, "updated\n"); err != nil {
		t.Fatal(err)
	}
	bytes, err := os.ReadFile(path)
	if err != nil || string(bytes) != "updated\n" {
		t.Fatalf("disk = %q, %v", bytes, err)
	}
	service.mu.RLock()
	defer service.mu.RUnlock()
	if doc := service.state.documents[id]; doc.autosave != nil || doc.autosaveInFlight != nil {
		t.Fatal("fired autosave timer or claim remained installed")
	}
}

func TestLateTimerInstallationCannotCrossDiscardFence(t *testing.T) {
	service := NewAppModelServiceForHost(WithEmitter(&retentionEmitter{}))
	id := newRetentionDocument(t, service)
	clock := &delayedAutosaveClock{firstStarted: make(chan struct{}), releaseFirst: make(chan struct{})}
	service.mu.Lock()
	doc := service.state.documents[id]
	doc.metadata.Path = filepath.Join(t.TempDir(), "file.md")
	doc.metadata.Capability = string(file.CapabilityWritable)
	doc.metadata.ContentRevision = 1
	service.autosaveTimer = clock
	service.mu.Unlock()
	finished := make(chan struct{})
	go func() { service.scheduleAutosave(id, 1); close(finished) }()
	<-clock.firstStarted
	service.BeginShutdownDiscard()
	service.EndShutdownDrain()
	close(clock.releaseFirst)
	<-finished
	if !clock.first.stopped.Load() {
		t.Fatal("timer created before fence was installed after cancellation")
	}
	service.mu.RLock()
	defer service.mu.RUnlock()
	if doc.autosave == nil || doc.autosave.timer == clock.first {
		t.Fatal("late timer replaced the rearmed intent")
	}
}

func TestCloseFlushWaitsForClaimAndKeepsNewerIntent(t *testing.T) {
	clock := &retentionClock{}
	service := NewAppModelServiceForHost(WithEmitter(&retentionEmitter{}), AppModelOption{AutosaveTimer: clock})
	path, id := openWarningDocument(t, service, t.TempDir())
	if err := service.UpdateBuffer(context.Background(), id, "latest\n"); err != nil {
		t.Fatal(err)
	}
	claim := make(chan struct{})
	service.mu.Lock()
	service.state.documents[id].autosaveInFlight = claim
	service.mu.Unlock()
	finished := make(chan struct{})
	go func() { service.flushAutosaveForClose(id); close(finished) }()
	select {
	case <-finished:
		t.Fatal("close did not wait for active claim")
	case <-time.After(30 * time.Millisecond):
	}
	service.mu.Lock()
	if service.state.documents[id].autosave == nil {
		service.mu.Unlock()
		t.Fatal("close discarded the newer intent")
	}
	service.state.documents[id].autosaveInFlight = nil
	close(claim)
	service.mu.Unlock()
	select {
	case <-finished:
	case <-time.After(time.Second):
		t.Fatal("close did not finish after claim")
	}
	bytes, err := os.ReadFile(path)
	if err != nil || string(bytes) != "latest\n" {
		t.Fatalf("disk = %q, %v", bytes, err)
	}
}

func TestAutosaveClaimedBeforeFenceRetainsIntentWhenAdmissionIsRefused(t *testing.T) {
	clock := &retentionClock{}
	service := NewAppModelServiceForHost(WithEmitter(&retentionEmitter{}), AppModelOption{AutosaveTimer: clock})
	path, id := openWarningDocument(t, service, t.TempDir())
	started := make(chan struct{})
	release := make(chan struct{})
	var reads atomic.Int32
	service.mu.Lock()
	service.diskVersion = func(path string) (file.DiskVersion, error) {
		if reads.Add(1) == 1 {
			close(started)
			<-release
		}
		return file.CurrentDiskVersion(path)
	}
	service.mu.Unlock()
	if err := service.UpdateBuffer(context.Background(), id, "latest\n"); err != nil {
		t.Fatal(err)
	}
	finished := make(chan struct{})
	go func() { clock.callbacks[0](); close(finished) }()
	<-started
	service.BeginShutdownDiscard()
	close(release)
	<-finished
	before, err := os.ReadFile(path)
	if err != nil || string(before) == "latest\n" {
		t.Fatalf("write occurred while fenced: %q, %v", before, err)
	}
	service.mu.RLock()
	entry := service.state.documents[id].autosave
	service.mu.RUnlock()
	if entry == nil {
		t.Fatal("refused autosave lost its intent")
	}
	service.EndShutdownDrain()
	deadline := time.After(time.Second)
	for {
		bytes, err := os.ReadFile(path)
		if err == nil && string(bytes) == "latest\n" {
			break
		}
		select {
		case <-deadline:
			t.Fatal("cancel did not resume the claimed autosave")
		default:
			time.Sleep(time.Millisecond)
		}
	}
}

func TestOverlappingAutosavesPreserveNewestIntentAcrossFenceAndCancel(t *testing.T) {
	clock := &retentionClock{}
	service := NewAppModelServiceForHost(WithEmitter(&retentionEmitter{}), AppModelOption{AutosaveTimer: clock})
	path, id := openWarningDocument(t, service, t.TempDir())
	started, release := make(chan struct{}), make(chan struct{})
	var reads atomic.Int32
	service.mu.Lock()
	service.diskVersion = func(path string) (file.DiskVersion, error) {
		if reads.Add(1) == 1 {
			close(started)
			<-release
		}
		return file.CurrentDiskVersion(path)
	}
	service.mu.Unlock()
	if err := service.UpdateBuffer(context.Background(), id, "first\n"); err != nil {
		t.Fatal(err)
	}
	finished := make(chan struct{})
	go func() { clock.callbacks[0](); close(finished) }()
	<-started
	service.mu.RLock()
	claim := service.state.documents[id].autosaveInFlight
	service.mu.RUnlock()
	if err := service.UpdateBuffer(context.Background(), id, "latest\n"); err != nil {
		t.Fatal(err)
	}
	clock.callbacks[1]()
	service.mu.RLock()
	doc := service.state.documents[id]
	if doc.autosaveInFlight != claim || doc.autosave == nil || !doc.autosave.elapsed {
		service.mu.RUnlock()
		t.Fatal("newer callback replaced the active claim or lost its elapsed intent")
	}
	service.mu.RUnlock()
	service.BeginShutdownDiscard()
	close(release)
	<-finished
	select {
	case <-claim:
	default:
		t.Fatal("original claim did not signal completion")
	}
	service.mu.RLock()
	held := service.state.documents[id].autosave
	service.mu.RUnlock()
	if held == nil {
		t.Fatal("discard fence lost newer intent")
	}
	service.EndShutdownDrain()
	deadline := time.After(time.Second)
	for {
		bytes, err := os.ReadFile(path)
		if err == nil && string(bytes) == "latest\n" {
			break
		}
		select {
		case <-deadline:
			t.Fatal("cancel did not resume latest intent")
		default:
			time.Sleep(time.Millisecond)
		}
	}
}

func TestAutosaveClaimSignalsAfterDocumentRecordDisappears(t *testing.T) {
	clock := &retentionClock{}
	service := NewAppModelServiceForHost(WithEmitter(&retentionEmitter{}), AppModelOption{AutosaveTimer: clock})
	_, id := openWarningDocument(t, service, t.TempDir())
	started, release := make(chan struct{}), make(chan struct{})
	service.mu.Lock()
	service.diskVersion = func(path string) (file.DiskVersion, error) {
		close(started)
		<-release
		return file.CurrentDiskVersion(path)
	}
	service.mu.Unlock()
	if err := service.UpdateBuffer(context.Background(), id, "change\n"); err != nil {
		t.Fatal(err)
	}
	finished := make(chan struct{})
	go func() { clock.callbacks[0](); close(finished) }()
	<-started
	service.mu.Lock()
	claim := service.state.documents[id].autosaveInFlight
	delete(service.state.documents, id)
	service.mu.Unlock()
	close(release)
	<-finished
	select {
	case <-claim:
	default:
		t.Fatal("disposed record left claim waiter blocked")
	}
}

func TestCloseFlushPreservesRestoredIntentAfterFenceEnds(t *testing.T) {
	clock := &retentionClock{}
	service := NewAppModelServiceForHost(WithEmitter(&retentionEmitter{}), AppModelOption{AutosaveTimer: clock})
	path, id := openWarningDocument(t, service, t.TempDir())
	if err := service.UpdateBuffer(context.Background(), id, "latest\n"); err != nil {
		t.Fatal(err)
	}
	started, release := make(chan struct{}), make(chan struct{})
	var reads atomic.Int32
	service.mu.Lock()
	doc := service.state.documents[id]
	entry := doc.autosave
	service.diskVersion = func(path string) (file.DiskVersion, error) {
		if reads.Add(1) == 1 {
			close(started)
			<-release
		}
		return file.CurrentDiskVersion(path)
	}
	service.mu.Unlock()
	result := make(chan autosaveRunResult, 1)
	go func() { result <- service.runAutosave(id, entry.revision, entry.generation) }()
	<-started
	service.BeginShutdownDiscard()
	close(release)
	outcome := <-result
	if outcome != autosaveClaimed {
		t.Fatalf("actual autosave result = %v, want claimed", outcome)
	}
	// Keep the owner from immediately retrying while cancellation ends the
	// fence, so cleanup is exercised deterministically at the seam used by
	// flushAutosaveForClose after its real runAutosave call returns.
	blockRetry := make(chan struct{})
	service.mu.Lock()
	if doc.autosave != entry {
		service.mu.Unlock()
		t.Fatal("refused claim did not restore its original entry")
	}
	doc.autosaveInFlight = blockRetry
	service.mu.Unlock()
	service.EndShutdownDrain()
	service.mu.Lock()
	doc.autosaveInFlight = nil
	close(blockRetry)
	cancelled := service.cancelUnusableAutosaveLocked(id, doc, entry, outcome)
	service.mu.Unlock()
	if cancelled {
		t.Fatal("close cleanup discarded a restored autosave intent")
	}
	service.flushAutosaveForClose(id)
	bytes, err := os.ReadFile(path)
	if err != nil || string(bytes) != "latest\n" {
		t.Fatalf("disk = %q, %v", bytes, err)
	}
}

type retentionEmitter struct{}

func TestAutosaveDoesNotReplaceAnActiveClaim(t *testing.T) {
	service := NewAppModelServiceForHost(WithEmitter(&retentionEmitter{}))
	id := newRetentionDocument(t, service)
	path := filepath.Join(t.TempDir(), "file.md")
	if err := os.WriteFile(path, []byte("disk"), 0o644); err != nil {
		t.Fatal(err)
	}
	service.mu.Lock()
	doc := service.state.documents[id]
	doc.metadata.Path = path
	doc.metadata.Capability = string(file.CapabilityWritable)
	doc.metadata.ContentRevision = 1
	service.autosaveEnabled = true
	active := make(chan struct{})
	doc.autosaveInFlight = active
	entry := &autosaveTimerEntry{revision: 1, generation: 1}
	doc.autosave = entry
	service.mu.Unlock()
	service.runAutosave(id, 1, 1)
	service.mu.RLock()
	defer service.mu.RUnlock()
	if doc.autosaveInFlight != active || doc.autosave != entry {
		t.Fatal("newer intent replaced an active autosave claim")
	}
}

func TestAutosaveOwnershipSurvivesFailedConcurrentPublication(t *testing.T) {
	ctx := context.Background()
	service := NewAppModelServiceForHost(WithEmitter(&retentionEmitter{}))
	id := newRetentionDocument(t, service)
	other := newRetentionDocument(t, service)
	emitter := &failingBlockedEmitter{started: make(chan struct{}), release: make(chan struct{})}
	service.mu.Lock()
	doc := service.state.documents[id]
	doc.metadata.Path = filepath.Join(t.TempDir(), "file.md")
	doc.metadata.Capability = string(file.CapabilityWritable)
	doc.metadata.ContentRevision = 1
	doc.autosave = &autosaveTimerEntry{revision: 1, generation: 1}
	service.emitter = emitter
	service.mu.Unlock()
	finished := make(chan error, 1)
	go func() { finished <- service.UpdateBuffer(ctx, other, "change") }()
	<-emitter.started
	entry := &autosaveTimerEntry{revision: 1, generation: 2, elapsed: true}
	claim := make(chan struct{})
	service.mu.Lock()
	doc.autosave = entry
	doc.autosaveGeneration = 2
	doc.autosaveInFlight = claim
	service.mu.Unlock()
	close(emitter.release)
	if err := <-finished; err == nil {
		t.Fatal("publication unexpectedly succeeded")
	}
	service.mu.RLock()
	current := service.state.documents[id]
	defer service.mu.RUnlock()
	if current.autosave != entry || current.autosaveInFlight != claim || current.autosaveGeneration != 2 {
		t.Fatal("rollback restored stale autosave ownership")
	}
}

func TestElapsedAutosaveResumesAfterNewerPublicationRollsBack(t *testing.T) {
	ctx := context.Background()
	clock := &retentionClock{}
	service := NewAppModelServiceForHost(WithEmitter(&retentionEmitter{}), AppModelOption{AutosaveTimer: clock})
	path, id := openWarningDocument(t, service, t.TempDir())
	if err := service.UpdateBuffer(ctx, id, "first\n"); err != nil {
		t.Fatal(err)
	}
	emitter := &failingBlockedEmitter{started: make(chan struct{}), release: make(chan struct{})}
	service.mu.Lock()
	service.emitter = emitter
	service.mu.Unlock()
	finished := make(chan error, 1)
	go func() { finished <- service.UpdateBuffer(ctx, id, "second\n") }()
	<-emitter.started
	clock.callbacks[0]()
	service.mu.Lock()
	service.emitter = &retentionEmitter{}
	service.mu.Unlock()
	close(emitter.release)
	if err := <-finished; err == nil {
		t.Fatal("publication unexpectedly succeeded")
	}
	deadline := time.After(time.Second)
	for {
		bytes, err := os.ReadFile(path)
		if err == nil && string(bytes) == "first\n" {
			break
		}
		select {
		case <-deadline:
			t.Fatal("eligible elapsed autosave did not resume after rollback")
		default:
			time.Sleep(time.Millisecond)
		}
	}
}

func (retentionEmitter) EmitStatePatch(context.Context, apperr.AppStatePatch) error { return nil }

func (retentionEmitter) EmitAsyncError(context.Context, apperr.WireError) error { return nil }

type failingBlockedEmitter struct {
	started chan struct{}
	release chan struct{}
}

func (emitter *failingBlockedEmitter) EmitStatePatch(context.Context, apperr.AppStatePatch) error {
	close(emitter.started)
	<-emitter.release
	return errors.New("blocked publication failed")
}

func (*failingBlockedEmitter) EmitAsyncError(context.Context, apperr.WireError) error { return nil }

// newRetentionDocument creates the document a new service no longer starts with.
func newRetentionDocument(t *testing.T, service *AppModelService) string {
	t.Helper()
	state, err := service.GetState(context.Background())
	if err != nil {
		t.Fatalf("GetState: %v", err)
	}
	created := service.NewDocument(context.Background(), state.Snapshot.TabSetRevision)
	if created.Data == nil {
		t.Fatalf("NewDocument = %+v", created)
	}
	return created.Data.DocumentID
}

func TestDisposeReleasesDocumentOwnedResources(t *testing.T) {
	service := NewAppModelServiceForHost(WithEmitter(&retentionEmitter{}))
	documentID := newRetentionDocument(t, service)
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

	state, err := service.GetState(context.Background())
	if err != nil {
		t.Fatalf("GetState: %v", err)
	}
	closed := service.CloseDocument(context.Background(), documentID, state.Snapshot.TabSetRevision)
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
	service := NewAppModelServiceForHost(WithEmitter(&retentionEmitter{}), AppModelOption{WriteExecutor: func(snapshot WriteSnapshot) (file.DiskVersion, error) {
		return executor(snapshot)
	}})
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
	documentID := newRetentionDocument(t, service)
	if !service.setWriteInFlight(context.Background(), documentID, true) {
		t.Fatal("write was not admitted")
	}

	closed := make(chan apperr.TabTransitionResult, 1)
	go func() {
		closed <- service.closeDocuments(context.Background(), []string{documentID}, nil, "")
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

	service.setWriteInFlight(context.Background(), documentID, false)

	select {
	case result := <-closed:
		if result.Error != nil || result.Status != apperr.TabTransitionClosed {
			t.Fatalf("closeDocuments = %+v", result)
		}
	case <-time.After(time.Second):
		t.Fatal("closeDocuments did not finish after the accepted write drained")
	}
}

func TestPreparedQuitRejectsOwnershipTransfer(t *testing.T) {
	for _, newOwner := range []string{"native", "cleared", "new"} {
		t.Run(newOwner, func(t *testing.T) {
			service := NewAppModelServiceForHost(WithEmitter(&retentionEmitter{}))
			first := newRetentionDocument(t, service)
			second := newRetentionDocument(t, service)
			service.SetPendingClose(apperr.PendingClose{ID: "a", Owner: apperr.PendingCloseOwnerFrontend})
			state, _ := service.GetState(context.Background())
			plan := service.PrepareClose(context.Background(), apperr.ClosePlanQuit, nil, state.Snapshot.TabSetRevision)
			if plan.Error != nil || plan.Data == nil {
				t.Fatalf("prepare = %+v", plan)
			}
			if result := service.ExecuteClosePlan(context.Background(), plan.Data.ID); result.Error != nil || result.Status != apperr.TabTransitionNoop {
				t.Fatalf("execute = %+v", result)
			}
			transferRetentionClose(service, newOwner)
			if refusal := service.ClaimPreparedQuit("a"); refusal == nil {
				t.Fatal("stale authorization accepted")
			}
			assertRetentionDocumentsOpen(t, service, first, second)
		})
	}
}

func transferRetentionClose(service *AppModelService, newOwner string) {
	service.SetPendingClose(apperr.PendingClose{ID: "a", Owner: apperr.PendingCloseOwnerNative})
	if newOwner != "native" {
		service.ClearPendingClose("a")
	}
	if newOwner == "new" {
		service.SetPendingClose(apperr.PendingClose{ID: "b", Owner: apperr.PendingCloseOwnerFrontend})
	}
}

func assertRetentionDocumentsOpen(t *testing.T, service *AppModelService, ids ...string) {
	t.Helper()
	service.mu.RLock()
	defer service.mu.RUnlock()
	for _, id := range ids {
		if doc := service.state.documents[id]; doc == nil || doc.closing {
			t.Errorf("document %s removed or sealed", id)
		}
	}
}

func TestCloseDocumentsClearsPriorSealsWhenLaterTargetIsMissing(t *testing.T) {
	service := NewAppModelServiceForHost(WithEmitter(&retentionEmitter{}))
	first := newRetentionDocument(t, service)
	result := service.closeDocuments(context.Background(), []string{first, "missing"}, nil, "")
	if result.Error == nil {
		t.Fatalf("close unexpectedly succeeded: %+v", result)
	}
	service.mu.RLock()
	defer service.mu.RUnlock()
	if doc := service.state.documents[first]; doc == nil || doc.closing {
		t.Fatal("first document remained sealed after refusal")
	}
}

func TestCloseWaitsForEveryAdmittedWrite(t *testing.T) {
	service := NewAppModelServiceForHost(WithEmitter(&retentionEmitter{}))
	documentID := newRetentionDocument(t, service)
	ctx := context.Background()
	if !service.setWriteInFlight(ctx, documentID, true) {
		t.Fatal("first write should be admitted")
	}
	if !service.setWriteInFlight(ctx, documentID, true) {
		t.Fatal("second write should be admitted")
	}
	service.setWriteInFlight(ctx, documentID, false)
	service.mu.RLock()
	writing := service.state.documents[documentID].effectiveMetadata().WriteInFlight
	service.mu.RUnlock()
	if !writing {
		t.Fatal("document stopped reporting a write while the second admitted write is pending")
	}
	drained := make(chan struct{})
	go func() { service.waitForDocumentIdle(documentID); close(drained) }()
	select {
	case <-drained:
		t.Fatal("drain returned before the second admitted write completed")
	case <-time.After(30 * time.Millisecond):
	}
	service.setWriteInFlight(ctx, documentID, false)
	select {
	case <-drained:
	case <-time.After(time.Second):
		t.Fatal("drain did not return after both writes completed")
	}
}

func TestCloseWaitsForQueuedExecutorWrite(t *testing.T) {
	ctx := context.Background()
	firstStarted, secondStarted := make(chan struct{}), make(chan struct{})
	finishFirst, finishSecond := make(chan struct{}), make(chan struct{})
	var calls atomic.Int32
	executor := func(snapshot WriteSnapshot) (file.DiskVersion, error) {
		if calls.Add(1) == 1 {
			close(firstStarted)
			<-finishFirst
		} else {
			close(secondStarted)
			<-finishSecond
		}
		return file.DiskVersion{Exists: true, Size: int64(len(snapshot.EncodedData))}, nil
	}
	service := NewAppModelServiceForHost(WithEmitter(&retentionEmitter{}), AppModelOption{WriteExecutor: executor})
	_, documentID := openWarningDocument(t, service, t.TempDir())
	service.mu.RLock()
	document := service.state.documents[documentID]
	first := writeSnapshot{documentID: documentID, contentRevision: 1, content: "first\n", path: document.metadata.Path, identity: document.identity, metadata: document.metadata, expectedVersion: document.baselineVersion}
	service.mu.RUnlock()
	second := first
	second.contentRevision = 2
	second.content = "second\n"
	results := make(chan apperr.WriteResult, 2)
	go func() { results <- service.executeWrite(ctx, first, SaveOriginExplicitSave) }()
	select {
	case <-firstStarted:
	case <-time.After(time.Second):
		t.Fatal("first executor did not start")
	}
	go func() { results <- service.executeWrite(ctx, second, SaveOriginExplicitSave) }()
	deadline := time.After(time.Second)
	for {
		service.mu.RLock()
		count := service.state.documents[documentID].admittedWrites
		service.mu.RUnlock()
		if count == 2 {
			break
		}
		select {
		case <-deadline:
			t.Fatal("second write was not admitted")
		default:
			time.Sleep(time.Millisecond)
		}
	}
	close(finishFirst)
	select {
	case <-secondStarted:
	case <-time.After(time.Second):
		t.Fatal("second executor did not start")
	}
	if result := <-results; result.Status != apperr.WriteStatusCommitted {
		t.Fatalf("first result = %+v", result)
	}
	drained := make(chan struct{})
	go func() { service.waitForDocumentIdle(documentID); close(drained) }()
	select {
	case <-drained:
		t.Fatal("drain completed while the queued write was executing")
	case <-time.After(30 * time.Millisecond):
	}
	close(finishSecond)
	if result := <-results; result.Status != apperr.WriteStatusCommitted {
		t.Fatalf("second result = %+v", result)
	}
	select {
	case <-drained:
	case <-time.After(time.Second):
		t.Fatal("drain did not complete after queued write")
	}
}

func TestWriteCompletionReleasesOnlyItsAdmission(t *testing.T) {
	for _, tc := range []struct {
		name     string
		executor WriteExecutor
		want     apperr.WriteStatus
	}{
		{"failure", func(WriteSnapshot) (file.DiskVersion, error) { return file.DiskVersion{}, errors.New("write failed") }, apperr.WriteStatusRefused},
		{"committed warning", func(WriteSnapshot) (file.DiskVersion, error) {
			version := file.DiskVersion{Exists: true}
			return version, &committedWriteError{version: version, err: errors.New("sync failed")}
		}, apperr.WriteStatusCommitted},
	} {
		t.Run(tc.name, func(t *testing.T) {
			ctx := context.Background()
			service := NewAppModelServiceForHost(WithEmitter(&retentionEmitter{}), AppModelOption{WriteExecutor: tc.executor})
			_, id := openWarningDocument(t, service, t.TempDir())
			service.mu.RLock()
			document := service.state.documents[id]
			snapshot := writeSnapshot{documentID: id, contentRevision: 1, content: "changed\n", path: document.metadata.Path, identity: document.identity, metadata: document.metadata, expectedVersion: document.baselineVersion}
			service.mu.RUnlock()
			if !service.setWriteInFlight(ctx, id, true) {
				t.Fatal("first write was not admitted")
			}
			if result := service.executeWrite(ctx, snapshot, SaveOriginExplicitSave); result.Status != tc.want {
				t.Fatalf("executeWrite = %+v, want %s", result, tc.want)
			}
			service.mu.RLock()
			count := service.state.documents[id].admittedWrites
			writing := service.state.documents[id].effectiveMetadata().WriteInFlight
			service.mu.RUnlock()
			if count != 1 || !writing {
				t.Fatalf("remaining admissions = %d, writing = %t; want 1 and true", count, writing)
			}
			service.setWriteInFlight(ctx, id, false)
		})
	}
}

type failedPublicationAdmissionCase struct {
	name    string
	initial int
	admit   bool
	want    uint64
	other   bool
}

func TestWriteAdmissionsSurviveFailedConcurrentPublication(t *testing.T) {
	for _, tc := range []failedPublicationAdmissionCase{
		{"admission", 1, true, 2, false},
		{"completion", 2, false, 1, false},
		{"other document admission", 1, true, 2, true},
		{"other document completion", 2, false, 1, true},
	} {
		t.Run(tc.name, func(t *testing.T) { runFailedPublicationAdmission(t, tc) })
	}
}

func runFailedPublicationAdmission(t *testing.T, tc failedPublicationAdmissionCase) {
	t.Helper()
	ctx := context.Background()
	service := NewAppModelServiceForHost(WithEmitter(&retentionEmitter{}))
	id := newRetentionDocument(t, service)
	publicationID := id
	if tc.other {
		publicationID = newRetentionDocument(t, service)
	}
	for i := 0; i < tc.initial; i++ {
		if !service.setWriteInFlight(ctx, id, true) {
			t.Fatal("initial write admission failed")
		}
	}
	emitter := &failingBlockedEmitter{started: make(chan struct{}), release: make(chan struct{})}
	service.mu.Lock()
	service.emitter = emitter
	service.mu.Unlock()
	finished := make(chan error, 1)
	go func() { finished <- service.UpdateBuffer(ctx, publicationID, "changed") }()
	select {
	case <-emitter.started:
	case <-time.After(time.Second):
		t.Fatal("publication did not start")
	}
	if !service.setWriteInFlight(ctx, id, tc.admit) {
		t.Fatal("count-only write transition failed")
	}
	close(emitter.release)
	if err := <-finished; err == nil {
		t.Fatal("publication unexpectedly succeeded")
	}
	service.mu.RLock()
	count := service.state.documents[id].admittedWrites
	content := service.state.documents[publicationID].content
	service.mu.RUnlock()
	if count != tc.want {
		t.Fatalf("admissions after failed publication = %d, want %d", count, tc.want)
	}
	if content != "" {
		t.Fatalf("failed buffer publication retained content %q", content)
	}
}
