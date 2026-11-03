package appmodel_test

import (
	"context"
	"sync"
	"testing"
	"time"

	"github.com/sanyokkua/go_mark_edit/internal/apperr"
	. "github.com/sanyokkua/go_mark_edit/internal/appmodel"
	"github.com/sanyokkua/go_mark_edit/internal/db"
)

func TestSqliteLayoutRepositoryArbitratesPerFieldAndReadsLegacyValues(t *testing.T) {
	database, err := db.Open(context.Background(), t.TempDir()+"/settings.db")
	if err != nil {
		t.Fatalf("open settings database: %v", err)
	}
	defer func() { _ = database.Close() }()
	repository := NewSqliteLayoutRepository(database)

	newer := VersionedLayoutValue{Version: 1, Value: 1200, ChangedAtUnixNano: time.Now().UnixNano(), WriterID: "writer-a", Sequence: 2}
	if result, err := repository.Write(context.Background(), LayoutWindowWidth, newer); err != nil || !result.Applied {
		t.Fatalf("write newer width = %+v, %v; want applied", result, err)
	}
	older := newer
	older.Value = 900
	older.ChangedAtUnixNano--
	older.WriterID = "writer-b"
	result, err := repository.Write(context.Background(), LayoutWindowWidth, older)
	if err != nil || result.Applied || result.Value != newer {
		t.Fatalf("stale width write = %+v, %v; want stored winner", result, err)
	}
	stored, found, err := repository.Read(context.Background(), LayoutWindowWidth)
	if err != nil || !found || stored != newer {
		t.Fatalf("stored width = %+v, found=%t, err=%v; want newer value", stored, found, err)
	}

	if _, err := repository.Write(context.Background(), LayoutWindowWidth, VersionedLayoutValue{Version: 1, Value: 374, WriterID: "writer-c", Sequence: 1}); err == nil {
		t.Fatal("invalid native width was accepted")
	}
	if _, err := database.DB.ExecContext(context.Background(), "INSERT INTO settings (key, value, type) VALUES (?, ?, ?)", "layout.window.height", "768", "int"); err != nil {
		t.Fatalf("seed legacy height: %v", err)
	}
	legacy, found, err := repository.Read(context.Background(), LayoutWindowHeight)
	if err != nil || !found || legacy.Value != 768 || legacy.Version != 1 {
		t.Fatalf("legacy height = %+v, found=%t, err=%v; want versioned 768", legacy, found, err)
	}
}

func TestHiddenFolderPreferenceDefaultsAndValidatesAsBoolean(t *testing.T) {
	database, err := db.Open(context.Background(), t.TempDir()+"/settings.db")
	if err != nil {
		t.Fatalf("open settings database: %v", err)
	}
	defer func() { _ = database.Close() }()
	repository := NewSqliteLayoutRepository(database)

	missing, found, err := repository.Read(context.Background(), LayoutWorkspaceHiddenFolders)
	if err != nil || found || missing.Value != nil {
		t.Fatalf("missing hidden-folder preference = %+v, found=%t, err=%v; want absent", missing, found, err)
	}
	stored := VersionedLayoutValue{Version: 1, Value: true, WriterID: "workspace-test", Sequence: 1}
	if result, err := repository.Write(context.Background(), LayoutWorkspaceHiddenFolders, stored); err != nil || !result.Applied {
		t.Fatalf("write hidden-folder preference = %+v, %v; want applied", result, err)
	}
	loaded, found, err := repository.Read(context.Background(), LayoutWorkspaceHiddenFolders)
	if err != nil || !found || loaded.Value != true {
		t.Fatalf("loaded hidden-folder preference = %+v, found=%t, err=%v; want true", loaded, found, err)
	}
	stored.Value = "true"
	stored.Sequence++
	if _, err := repository.Write(context.Background(), LayoutWorkspaceHiddenFolders, stored); err == nil {
		t.Fatal("non-boolean hidden-folder preference was accepted")
	}
}

func TestLayoutCommandsPersistContinuousFieldsAfterTheDebounce(t *testing.T) {
	timer := &layoutManualTimer{}
	repository := &layoutRecordingRepository{}
	emitter := &recordingEmitter{}
	service := NewAppModelServiceForHost(WithEmitter(emitter), AppModelOption{Clock: timer}, AppModelOption{LayoutRepository: repository})
	width := 280
	if err := service.SetUILayout(context.Background(), apperr.UILayout{SidebarWidth: &width}); err != nil {
		t.Fatalf("SetUILayout: %v", err)
	}
	if len(repository.writes) != 0 || !timer.scheduled {
		t.Fatalf("layout before debounce = writes=%+v scheduled=%t, want deferred write", repository.writes, timer.scheduled)
	}
	timer.fire()
	if len(repository.writes) != 1 || repository.writes[0].field != LayoutWorkspaceWidth || repository.writes[0].value.Value != width {
		t.Fatalf("layout after debounce = %+v, want one width acknowledgement", repository.writes)
	}
	state, err := service.GetState(context.Background())
	if err != nil {
		t.Fatalf("GetState after layout: %v", err)
	}
	if state.Snapshot.UI.SidebarWidth == nil || *state.Snapshot.UI.SidebarWidth != width {
		t.Fatalf("projected sidebar width = %+v, want %d", state.Snapshot.UI.SidebarWidth, width)
	}
}

type layoutManualTimer struct {
	callback  func()
	scheduled bool
}

func (timer *layoutManualTimer) AfterFunc(_ time.Duration, callback func()) {
	timer.callback = callback
	timer.scheduled = true
}

func (timer *layoutManualTimer) fire() {
	if timer.callback == nil {
		return
	}
	callback := timer.callback
	timer.callback = nil
	timer.scheduled = false
	callback()
}

type layoutRecordedWrite struct {
	field string
	value VersionedLayoutValue
}

type layoutRecordingRepository struct {
	writes []layoutRecordedWrite
}

func (repository *layoutRecordingRepository) Write(_ context.Context, field string, value VersionedLayoutValue) (LayoutWriteResult, error) {
	repository.writes = append(repository.writes, layoutRecordedWrite{field: field, value: value})
	return LayoutWriteResult{Applied: true, Value: value}, nil
}

func (*layoutRecordingRepository) Read(context.Context, string) (VersionedLayoutValue, bool, error) {
	return VersionedLayoutValue{}, false, nil
}

func TestWindowResizeLayoutsDeferRepositoryWrites(t *testing.T) {
	timer := &layoutManualTimer{}
	repository := &layoutRecordingRepository{}
	service := NewAppModelServiceForHost(WithEmitter(&recordingEmitter{}), AppModelOption{Clock: timer}, AppModelOption{LayoutRepository: repository})
	maximized := false
	if err := service.SetUILayout(context.Background(), apperr.UILayout{WindowMaximized: &maximized}); err != nil {
		t.Fatal(err)
	}
	repository.writes = nil
	for i := 0; i < 12; i++ {
		width, height := 800+i, 600+i
		if err := service.SetUILayout(context.Background(), apperr.UILayout{WindowWidth: &width, WindowHeight: &height}); err != nil {
			t.Fatal(err)
		}
	}
	if len(repository.writes) != 0 {
		t.Fatalf("resize wrote before debounce: %+v", repository.writes)
	}
	timer.fire()
	if len(repository.writes) != 2 || repository.writes[0].field != LayoutWindowWidth || repository.writes[0].value.Value != 811 || repository.writes[1].field != LayoutWindowHeight || repository.writes[1].value.Value != 611 {
		t.Fatalf("flushed resize = %+v; want final width and height", repository.writes)
	}
	state, err := service.GetState(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	if state.Snapshot.UI.WindowWidth == nil || *state.Snapshot.UI.WindowWidth != 811 || state.Snapshot.UI.WindowHeight == nil || *state.Snapshot.UI.WindowHeight != 611 {
		t.Fatalf("projected resize = %+v", state.Snapshot.UI)
	}
}

type concurrentLayoutRepository struct {
	mu     sync.Mutex
	writes []layoutRecordedWrite
}

func (r *concurrentLayoutRepository) Write(_ context.Context, field string, value VersionedLayoutValue) (LayoutWriteResult, error) {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.writes = append(r.writes, layoutRecordedWrite{field: field, value: value})
	return LayoutWriteResult{Applied: true, Value: value}, nil
}
func (*concurrentLayoutRepository) Read(context.Context, string) (VersionedLayoutValue, bool, error) {
	return VersionedLayoutValue{}, false, nil
}

type idleLayoutTimer struct{}

func (idleLayoutTimer) AfterFunc(time.Duration, func()) {}

func TestConcurrentSetUILayoutAllocatesUniqueSequences(t *testing.T) {
	repository := &concurrentLayoutRepository{}
	service := NewAppModelServiceForHost(WithEmitter(&recordingEmitter{}), AppModelOption{Clock: idleLayoutTimer{}}, AppModelOption{LayoutRepository: repository})
	const workers = 24
	const rounds = 20
	start := make(chan struct{})
	errors := make(chan error, workers*rounds)
	var wg sync.WaitGroup
	for worker := 0; worker < workers; worker++ {
		wg.Add(1)
		go func(worker int) {
			defer wg.Done()
			<-start
			for i := 0; i < rounds; i++ {
				var layout apperr.UILayout
				if worker == 0 {
					maximized := i%2 == 0
					layout.WindowMaximized = &maximized
				} else {
					width := 800 + i
					height := 600 + i
					layout.WindowWidth = &width
					layout.WindowHeight = &height
				}
				if err := service.SetUILayout(context.Background(), layout); err != nil {
					errors <- err
				}
			}
		}(worker)
	}
	close(start)
	wg.Wait()
	close(errors)
	for err := range errors {
		t.Errorf("SetUILayout: %v", err)
	}
	if err := service.FlushPendingUILayout(); err != nil {
		t.Fatal(err)
	}
	repository.mu.Lock()
	defer repository.mu.Unlock()
	seen := make(map[uint64]bool)
	for _, write := range repository.writes {
		if write.value.Sequence == 0 || seen[write.value.Sequence] {
			t.Errorf("invalid or duplicate layout sequence: %+v", write)
		}
		seen[write.value.Sequence] = true
	}
	if len(repository.writes) != rounds+2 {
		t.Fatalf("writes = %d; want %d", len(repository.writes), rounds+2)
	}
}
