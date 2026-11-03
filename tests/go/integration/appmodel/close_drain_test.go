package appmodel_test

import (
	"bytes"
	"context"
	. "github.com/sanyokkua/go_mark_edit/internal/appmodel"
	"os"
	"path/filepath"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"github.com/rs/zerolog"
	"github.com/sanyokkua/go_mark_edit/internal/apperr"
	"github.com/sanyokkua/go_mark_edit/internal/file"
)

func TestShutdownDrainRefusesSavePausedBeforeAdmission(t *testing.T) {
	entered, release := make(chan struct{}), make(chan struct{})
	var block atomic.Bool
	var once sync.Once
	var writes atomic.Int32
	service := NewAppModelServiceForHost(WithEmitter(&recordingEmitter{}), AppModelOption{
		DiskVersion: func(path string) (file.DiskVersion, error) {
			if block.Load() {
				once.Do(func() { close(entered); <-release })
			}
			return file.CurrentDiskVersion(path)
		},
		WriteExecutor: func(snapshot WriteSnapshot) (file.DiskVersion, error) {
			writes.Add(1)
			return file.CurrentDiskVersion(snapshot.TargetPath)
		},
	})
	service.SetAutosaveEnabled(false)
	path, id := openAutosaveDocument(t, service, "base\n")
	if err := service.UpdateBuffer(context.Background(), id, "edited\n"); err != nil {
		t.Fatal(err)
	}
	state, err := service.GetState(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	block.Store(true)
	result := make(chan apperr.WriteResult, 1)
	go func() {
		result <- service.Save(context.Background(), id, state.Snapshot.Documents[id].ContentRevision, "")
	}()
	select {
	case <-entered:
	case <-time.After(5 * time.Second):
		t.Fatal("save did not reach disk inspection")
	}
	service.BeginShutdownDrain()
	if classified := drainBeforeCloseWithin(t, service, 5*time.Second); classified != nil {
		t.Fatalf("drain: %+v", classified)
	}
	close(release)
	select {
	case got := <-result:
		if got.Status == apperr.WriteStatusCommitted {
			t.Fatalf("late save committed: %+v", got)
		}
	case <-time.After(5 * time.Second):
		t.Fatal("late save did not return")
	}
	if writes.Load() != 0 {
		t.Fatalf("late save invoked executor %d times", writes.Load())
	}
	if data, err := os.ReadFile(path); err != nil || string(data) != "base\n" {
		t.Fatalf("disk = %q, %v", data, err)
	}
	state, err = service.GetState(context.Background())
	if err != nil || state.Snapshot.Documents[id].WriteInFlight {
		t.Fatalf("state after refusal = %+v, %v", state, err)
	}
}

type oneBlockedSaveDialog struct {
	entered, release chan struct{}
	path             string
	once             sync.Once
}

func (d *oneBlockedSaveDialog) ChooseSaveFile(context.Context, SaveDialogRequest) (string, error) {
	d.once.Do(func() { close(d.entered); <-d.release })
	return d.path, nil
}
func (*oneBlockedSaveDialog) ConfirmOverwrite(context.Context, string) (bool, error) {
	return true, nil
}

func TestShutdownDrainRefusesSaveAsPausedInDialogAndAllowsRetry(t *testing.T) {
	dialog := &oneBlockedSaveDialog{entered: make(chan struct{}), release: make(chan struct{}), path: filepath.Join(t.TempDir(), "saved.md")}
	service := NewAppModelServiceForHost(WithEmitter(&recordingEmitter{}), WithDialogs(nil, dialog))
	service.SetAutosaveEnabled(false)
	id := newUntitledID(t, service)
	if err := service.UpdateBuffer(context.Background(), id, "unsaved"); err != nil {
		t.Fatal(err)
	}
	state, err := service.GetState(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	revision := state.Snapshot.Documents[id].ContentRevision
	result := make(chan apperr.WriteResult, 1)
	go func() { result <- service.SaveAs(context.Background(), id, revision, "") }()
	select {
	case <-dialog.entered:
	case <-time.After(5 * time.Second):
		t.Fatal("save dialog did not open")
	}
	service.BeginShutdownDrain()
	if classified := drainBeforeCloseWithin(t, service, 5*time.Second); classified != nil {
		t.Fatalf("drain: %+v", classified)
	}
	close(dialog.release)
	select {
	case got := <-result:
		if got.Status == apperr.WriteStatusCommitted {
			t.Fatalf("late Save As committed: %+v", got)
		}
	case <-time.After(5 * time.Second):
		t.Fatal("Save As did not return")
	}
	if _, err := os.Stat(dialog.path); !os.IsNotExist(err) {
		t.Fatalf("target exists after refusal: %v", err)
	}
	state, err = service.GetState(context.Background())
	if err != nil || state.Snapshot.Documents[id].Path != "" {
		t.Fatalf("source adopted target: %+v, %v", state, err)
	}
	service.EndShutdownDrain()
	if got := service.SaveAs(context.Background(), id, revision, ""); got.Status != apperr.WriteStatusCommitted {
		t.Fatalf("retry = %+v", got)
	}
}

// drainBeforeCloseWithin runs the shutdown drain with a real deadline. Every
// assertion in this file goes through it on purpose: flushAutosaveMode has spun
// forever once already, on a scheduled document that runAutosave declined and
// left in place, and a drain that never returns is a window the user cannot
// close. A hung drain must fail this suite in seconds rather than wait for the
// package test timeout.
func drainBeforeCloseWithin(t *testing.T, service *AppModelService, limit time.Duration) *apperr.ClassifiedError {
	t.Helper()
	drained := make(chan *apperr.ClassifiedError, 1)
	go func() { drained <- service.DrainBeforeClose() }()
	select {
	case classified := <-drained:
		return classified
	case <-time.After(limit):
		t.Fatalf("DrainBeforeClose did not return within %s", limit)
		return nil
	}
}

// Accepted autosaves are drained before the native close permit is granted.
func TestDrainBeforeCloseRunsAcceptedAutosaveWork(t *testing.T) {
	clock := &fakeAutosaveClock{}
	service := NewAppModelServiceForHost(WithEmitter(&recordingEmitter{}), AppModelOption{AutosaveTimer: clock})
	path, documentID := openAutosaveDocument(t, service, "base\n")

	if err := service.UpdateBuffer(context.Background(), documentID, "accepted before quit\n"); err != nil {
		t.Fatalf("accepted edit: %v", err)
	}
	if clock.Pending() != 1 {
		t.Fatalf("pending debounces after the accepted edit = %d, want 1", clock.Pending())
	}

	service.BeginShutdownDrain()
	if classified := drainBeforeCloseWithin(t, service, 5*time.Second); classified != nil {
		t.Fatalf("DrainBeforeClose error = %+v, want none", classified)
	}

	disk, err := os.ReadFile(path)
	if err != nil {
		t.Fatalf("read drained file: %v", err)
	}
	if string(disk) != "accepted before quit\n" {
		t.Fatalf("bytes on disk after the drain = %q, want the last accepted revision", disk)
	}
	if clock.Pending() != 0 {
		t.Fatalf("pending debounces after the drain = %d, want none left armed", clock.Pending())
	}
}

func TestShutdownDrainWaitsForClaimedAutosaveBeforeAdmission(t *testing.T) {
	clock := &fakeAutosaveClock{}
	entered, release := make(chan struct{}), make(chan struct{})
	var block atomic.Bool
	var once sync.Once
	service := NewAppModelServiceForHost(WithEmitter(&recordingEmitter{}), AppModelOption{
		AutosaveTimer: clock,
		DiskVersion: func(path string) (file.DiskVersion, error) {
			if block.Load() {
				once.Do(func() { close(entered); <-release })
			}
			return file.CurrentDiskVersion(path)
		},
	})
	path, id := openAutosaveDocument(t, service, "base\n")
	if err := service.UpdateBuffer(context.Background(), id, "accepted autosave\n"); err != nil {
		t.Fatal(err)
	}
	block.Store(true)
	if !clock.FireNextAsync() {
		t.Fatal("autosave not scheduled")
	}
	select {
	case <-entered:
	case <-time.After(5 * time.Second):
		t.Fatal("autosave did not reach disk inspection")
	}
	service.BeginShutdownDrain()
	drained := make(chan *apperr.ClassifiedError, 1)
	go func() { drained <- service.DrainBeforeClose() }()
	select {
	case result := <-drained:
		t.Fatalf("drain returned before claimed autosave completed: %+v", result)
	case <-time.After(100 * time.Millisecond):
	}
	close(release)
	select {
	case result := <-drained:
		if result != nil {
			t.Fatalf("drain: %+v", result)
		}
	case <-time.After(5 * time.Second):
		t.Fatal("drain did not finish")
	}
	if data, err := os.ReadFile(path); err != nil || string(data) != "accepted autosave\n" {
		t.Fatalf("disk = %q, %v", data, err)
	}
}

// Save already inside atomic replacement is waited for, never cancelled, because
// AtomicReplace has no safe interruption point.)
func TestDrainBeforeCloseWaitsForAWriteInFlight(t *testing.T) {
	clock := &fakeAutosaveClock{}
	var executor WriteExecutor
	service := NewAppModelServiceForHost(WithEmitter(&recordingEmitter{}), AppModelOption{AutosaveTimer: clock}, AppModelOption{WriteExecutor: func(snapshot WriteSnapshot) (file.DiskVersion, error) {
		return executor(snapshot)
	}})
	// Autosave off isolates the explicit-write wait from the debounce flush the
	// previous test covers; with both armed a blocked executor would stall the
	// autosave flush instead and the assertion would not say which wait held.
	service.SetAutosaveEnabled(false)

	entered := make(chan struct{})
	release := make(chan struct{})
	var once sync.Once
	executor = func(snapshot WriteSnapshot) (file.DiskVersion, error) {
		once.Do(func() { close(entered) })
		<-release
		if err := os.WriteFile(snapshot.TargetPath, snapshot.EncodedData, 0o640); err != nil {
			return file.DiskVersion{}, err
		}
		return file.CurrentDiskVersion(snapshot.TargetPath)
	}

	path, documentID := openAutosaveDocument(t, service, "base\n")
	if err := service.UpdateBuffer(context.Background(), documentID, "committed by the blocked write\n"); err != nil {
		t.Fatalf("edit before the explicit save: %v", err)
	}
	state, err := service.GetState(context.Background())
	if err != nil {
		t.Fatalf("GetState before the explicit save: %v", err)
	}
	revision := state.Snapshot.Documents[documentID].ContentRevision

	saved := make(chan apperr.WriteResult, 1)
	go func() { saved <- service.Save(context.Background(), documentID, revision, "") }()
	<-entered

	drained := make(chan *apperr.ClassifiedError, 1)
	go func() { drained <- service.DrainBeforeClose() }()
	select {
	case classified := <-drained:
		t.Fatalf("DrainBeforeClose returned %+v while a write was still in flight", classified)
	case <-time.After(250 * time.Millisecond):
	}

	close(release)
	select {
	case classified := <-drained:
		if classified != nil {
			t.Fatalf("DrainBeforeClose error after the write finished = %+v, want none", classified)
		}
	case <-time.After(5 * time.Second):
		t.Fatal("DrainBeforeClose did not return within five seconds of the write finishing")
	}

	result := <-saved
	if result.Status != apperr.WriteStatusCommitted {
		t.Fatalf("explicit save status = %q, want committed", result.Status)
	}
	disk, err := os.ReadFile(path)
	if err != nil {
		t.Fatalf("read the drained file: %v", err)
	}
	if string(disk) != "committed by the blocked write\n" {
		t.Fatalf("bytes on disk after the drain = %q, want the committed write", disk)
	}
}

// work that was scheduled but has since become ineligible is cancelled rather
// than waited for, and the drain still returns.
//
// The clause read "cancel in-flight long operations" until the 2026-08-17
// amendment, and this anchor named that wording while the body proved the
// debounce behaviour below — an anchor asserting a claim its body does not make,
// which converts a coverage gap into a false record of coverage. Nothing in this
// backend implements the stronger reading and nothing here ever proved it:
// AtomicReplace has no cancellation point by design, ReadClassifiedStable takes
// no context, and the write coordinator serializes rather than interrupts. The
// requirement and the anchor now say the same thing.
//
// This is also the regression guard for the live-lock this area has already had.
// runAutosave declines a document that has become autosave-ineligible and leaves
// its entry in place; a drain that loops until the entry disappears never
// returns, which is a window that cannot be closed rather than a completed drain.
func TestDrainBeforeCloseCancelsWorkThatCanNoLongerRun(t *testing.T) {
	clock := &fakeAutosaveClock{}
	service := NewAppModelServiceForHost(WithEmitter(&recordingEmitter{}), AppModelOption{AutosaveTimer: clock})
	path, documentID := openAutosaveDocument(t, service, "base\n")

	if err := service.UpdateBuffer(context.Background(), documentID, "never reaches disk\n"); err != nil {
		t.Fatalf("accepted edit: %v", err)
	}
	if clock.Pending() != 1 {
		t.Fatalf("pending debounces after the accepted edit = %d, want 1", clock.Pending())
	}
	if err := os.Remove(path); err != nil {
		t.Fatalf("remove backing file: %v", err)
	}
	if !clock.FireNext() {
		t.Fatal("detached autosave timer did not fire")
	}

	if classified := drainBeforeCloseWithin(t, service, 5*time.Second); classified != nil {
		t.Fatalf("DrainBeforeClose error = %+v, want none", classified)
	}
	if clock.Pending() != 0 {
		t.Fatalf("pending debounces after the drain = %d, want the unrunnable one cancelled", clock.Pending())
	}
	state, err := service.GetState(context.Background())
	if err != nil {
		t.Fatalf("GetState after detached autosave: %v", err)
	}
	if metadata := state.Snapshot.Documents[documentID]; !metadata.Detached || !metadata.Dirty {
		t.Fatalf("detached metadata = %+v, want dirty detached document", metadata)
	}
}

func TestCloseDrainDropsFailedLayout(t *testing.T) {
	for _, discard := range []bool{false, true} {
		t.Run(map[bool]string{false: "normal", true: "discard"}[discard], func(t *testing.T) {
			var logs bytes.Buffer
			timer := &manualLayoutTimer{}
			repository := &drainLayoutRepository{}
			service := NewAppModelServiceForHost(WithEmitter(&recordingEmitter{}), WithLogger(zerolog.New(&logs)), AppModelOption{LayoutRepository: repository, Clock: timer})
			width := 1200
			if err := service.SetUILayout(context.Background(), apperr.UILayout{WindowWidth: &width}); err != nil {
				t.Fatal(err)
			}
			var result *apperr.ClassifiedError
			if discard {
				result = service.DrainDiscardBeforeClose()
			} else {
				result = drainBeforeCloseWithin(t, service, 5*time.Second)
			}
			if result != nil {
				t.Fatalf("drain should tolerate layout failure: %+v", result)
			}
			if err := service.FlushPendingUILayout(); err != nil {
				t.Fatalf("failed layout was retained: %v", err)
			}
			timer.fire()
			if got := repository.writes.Load(); got != 1 {
				t.Fatalf("writes = %d, want 1", got)
			}
			if !bytes.Contains(logs.Bytes(), []byte("layout persistence failed during close")) {
				t.Fatalf("missing close log: %s", logs.String())
			}
		})
	}
}

type drainLayoutRepository struct{ writes atomic.Int32 }

func (*drainLayoutRepository) Read(context.Context, string) (VersionedLayoutValue, bool, error) {
	return VersionedLayoutValue{}, false, nil
}
func (r *drainLayoutRepository) Write(context.Context, string, VersionedLayoutValue) (LayoutWriteResult, error) {
	r.writes.Add(1)
	return LayoutWriteResult{}, os.ErrPermission
}

type blockingDrainLayoutRepository struct {
	writes           atomic.Int32
	entered, release chan struct{}
}

func (*blockingDrainLayoutRepository) Read(context.Context, string) (VersionedLayoutValue, bool, error) {
	return VersionedLayoutValue{}, false, nil
}
func (r *blockingDrainLayoutRepository) Write(context.Context, string, VersionedLayoutValue) (LayoutWriteResult, error) {
	if r.writes.Add(1) == 1 {
		close(r.entered)
		<-r.release
	}
	return LayoutWriteResult{}, os.ErrPermission
}

func TestCloseDrainDropsActiveDebounceFailureBeforeWake(t *testing.T) {
	for _, discard := range []bool{false, true} {
		t.Run(map[bool]string{false: "normal", true: "discard"}[discard], func(t *testing.T) {
			var logs bytes.Buffer
			timer := &manualLayoutTimer{}
			repository := &blockingDrainLayoutRepository{entered: make(chan struct{}), release: make(chan struct{})}
			service := NewAppModelServiceForHost(WithEmitter(&recordingEmitter{}), WithLogger(zerolog.New(&logs)), AppModelOption{LayoutRepository: repository, Clock: timer})
			width := 1200
			if err := service.SetUILayout(context.Background(), apperr.UILayout{WindowWidth: &width}); err != nil {
				t.Fatal(err)
			}
			first := make(chan struct{})
			go func() { timer.fire(); close(first) }()
			select {
			case <-repository.entered:
			case <-time.After(5 * time.Second):
				t.Fatal("layout write did not start")
			}
			width = 1300
			if err := service.SetUILayout(context.Background(), apperr.UILayout{WindowWidth: &width}); err != nil {
				t.Fatal(err)
			}
			if discard {
				service.BeginShutdownDiscard()
			} else {
				service.BeginShutdownDrain()
			}
			drained := make(chan *apperr.ClassifiedError, 1)
			go func() {
				if discard {
					drained <- service.DrainDiscardBeforeClose()
				} else {
					drained <- service.DrainBeforeClose()
				}
			}()
			second := make(chan struct{})
			go func() { timer.fire(); close(second) }()
			select {
			case <-second:
				t.Fatal("callback returned before the active flush completed")
			case <-time.After(50 * time.Millisecond):
			}
			close(repository.release)
			select {
			case <-first:
			case <-time.After(5 * time.Second):
				t.Fatal("callback did not finish")
			}
			select {
			case <-second:
			case <-time.After(5 * time.Second):
				t.Fatal("waiting callback did not finish")
			}
			select {
			case got := <-drained:
				if got != nil {
					t.Fatalf("drain = %+v", got)
				}
			case <-time.After(5 * time.Second):
				t.Fatal("drain did not finish")
			}
			if err := service.FlushPendingUILayout(); err != nil {
				t.Fatalf("layout retained: %v", err)
			}
			if got := repository.writes.Load(); got != 1 {
				t.Fatalf("writes = %d, want 1", got)
			}
			if got := bytes.Count(logs.Bytes(), []byte("layout persistence failed during close")); got != 1 {
				t.Fatalf("close logs = %d, want 1: %s", got, logs.String())
			}
		})
	}
}

type failOnceDrainLayoutRepository struct{ writes atomic.Int32 }

func (*failOnceDrainLayoutRepository) Read(context.Context, string) (VersionedLayoutValue, bool, error) {
	return VersionedLayoutValue{}, false, nil
}
func (r *failOnceDrainLayoutRepository) Write(_ context.Context, _ string, value VersionedLayoutValue) (LayoutWriteResult, error) {
	if r.writes.Add(1) == 1 {
		return LayoutWriteResult{}, os.ErrPermission
	}
	return LayoutWriteResult{Applied: true, Value: value}, nil
}

func TestNormalLayoutFlushRetainsFailureForRetry(t *testing.T) {
	repository := &failOnceDrainLayoutRepository{}
	service := NewAppModelServiceForHost(WithEmitter(&recordingEmitter{}), AppModelOption{LayoutRepository: repository, Clock: noopDrainLayoutTimer{}})
	width := 1200
	if err := service.SetUILayout(context.Background(), apperr.UILayout{WindowWidth: &width}); err != nil {
		t.Fatal(err)
	}
	if err := service.FlushPendingUILayout(); err == nil {
		t.Fatal("first flush should fail")
	}
	if err := service.FlushPendingUILayout(); err != nil {
		t.Fatalf("retry: %v", err)
	}
	if got := repository.writes.Load(); got != 2 {
		t.Fatalf("writes = %d, want 2", got)
	}
}

type noopDrainLayoutTimer struct{}

func (noopDrainLayoutTimer) AfterFunc(time.Duration, func()) {}
