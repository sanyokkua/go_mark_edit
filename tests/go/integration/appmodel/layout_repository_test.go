package appmodel_test

import (
	"context"
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

func TestLayoutCommandsPersistContinuousFieldsAfterTheDebounce(t *testing.T) {
	timer := &layoutManualTimer{}
	repository := &layoutRecordingRepository{}
	emitter := &recordingEmitter{}
	service := NewAppModelServiceForHost(WithEmitter(emitter), WithClock(timer), WithLayoutRepository(repository))
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
