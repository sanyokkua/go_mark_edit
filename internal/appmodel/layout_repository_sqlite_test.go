package appmodel

import (
	"context"
	"errors"
	"reflect"
	"runtime"
	"strings"
	"testing"
	"time"

	"github.com/sanyokkua/go_mark_edit/internal/apperr"
	"github.com/sanyokkua/go_mark_edit/internal/kv"
)

// Proves: FR-WS-009
// Application layout owns only durable native geometry, workspace state, and an
// arrangement fallback. Document panes and Assistant state are never accepted
// as global layout fields.
func TestLayoutRejectsExcludedDocumentAndAssistantFields(t *testing.T) {
	service := NewAppModelService(WithEmitter(&recordingEmitter{}))
	visible := true
	width := 240

	for name, layout := range map[string]apperr.UILayout{
		"editor pane":          {EditorPaneVisible: &visible},
		"preview pane":         {PreviewPaneVisible: &visible},
		"assistant visibility": {AssistantVisible: &visible},
		"assistant width":      {AssistantWidth: &width},
	} {
		t.Run(name, func(t *testing.T) {
			err := service.SetUILayout(context.Background(), layout)
			var appError *apperr.AppError
			if !errors.As(err, &appError) || appError.Code != apperr.CodeValidation {
				t.Fatalf("SetUILayout(%+v) error = %v, want validation error", layout, err)
			}
		})
	}
}

// Proves: FR-WS-009, FR-WS-011
// A stale process cannot overwrite a newer per-field layout value and receives
// the stored winner as its acknowledgement.
func TestSqliteLayoutRepositoryKeepsNewestPerFieldWinner(t *testing.T) {
	first, second := openTwoLayoutDatabases(t)
	firstRepository := NewSqliteLayoutRepository(first)
	secondRepository := NewSqliteLayoutRepository(second)
	newer := VersionedLayoutValue{
		Version:           1,
		Value:             1200,
		ChangedAtUnixNano: time.Date(2026, 8, 1, 12, 0, 1, 0, time.UTC).UnixNano(),
		WriterID:          "writer-a",
		Sequence:          2,
	}
	if result, err := firstRepository.Write(context.Background(), LayoutWindowWidth, newer); err != nil || !result.Applied {
		t.Fatalf("write newer value = %+v, %v; want applied", result, err)
	}
	older := newer
	older.Value = 900
	older.ChangedAtUnixNano--
	older.WriterID = "writer-b"
	result, err := secondRepository.Write(context.Background(), LayoutWindowWidth, older)
	if err != nil {
		t.Fatalf("write stale value: %v", err)
	}
	if result.Applied || result.Value != newer {
		t.Fatalf("stale write result = %+v, want stored winner %+v", result, newer)
	}
}

// Proves: FR-WS-011
// A writer that read an older committed value must not later overwrite a newer
// committed winner after another connection wins the same field first.
func TestSqliteLayoutRepositoryKeepsCommittedWinnerAcrossReadThenWriteRace(t *testing.T) {
	first, second := openTwoLayoutDatabases(t)
	firstRepository := NewSqliteLayoutRepository(first)
	readDecided := make(chan struct{})
	releaseWrite := make(chan struct{})
	secondRepository := &SqliteLayoutRepository{
		store: kv.New(second.DB),
		afterReadDecision: func() {
			close(readDecided)
			<-releaseWrite
		},
	}
	oldest := VersionedLayoutValue{
		Version:           1,
		Value:             800,
		ChangedAtUnixNano: time.Date(2026, 8, 1, 12, 0, 0, 0, time.UTC).UnixNano(),
		WriterID:          "writer-a",
		Sequence:          1,
	}
	if result, err := firstRepository.Write(context.Background(), LayoutWindowWidth, oldest); err != nil || !result.Applied {
		t.Fatalf("seed oldest value = %+v, %v; want applied", result, err)
	}
	stale := oldest
	stale.Value = 900
	stale.ChangedAtUnixNano++
	stale.Sequence++
	newer := stale
	newer.Value = 1200
	newer.ChangedAtUnixNano++
	newer.Sequence++

	resultCh := make(chan struct {
		result LayoutWriteResult
		err    error
	}, 1)
	go func() {
		result, err := secondRepository.Write(context.Background(), LayoutWindowWidth, stale)
		resultCh <- struct {
			result LayoutWriteResult
			err    error
		}{result: result, err: err}
	}()

	<-readDecided
	if result, err := firstRepository.Write(context.Background(), LayoutWindowWidth, newer); err != nil || !result.Applied {
		t.Fatalf("write newer winner = %+v, %v; want applied", result, err)
	}
	close(releaseWrite)

	outcome := <-resultCh
	if outcome.err != nil {
		t.Fatalf("stale writer returned error = %v, want stored winner acknowledgement", outcome.err)
	}
	if outcome.result.Applied || outcome.result.Value != newer {
		t.Fatalf("stale race result = %+v, want committed winner %+v", outcome.result, newer)
	}
	stored, found, err := firstRepository.Read(context.Background(), LayoutWindowWidth)
	if err != nil || !found || stored != newer {
		t.Fatalf("stored winner after race = %+v, found=%t, err=%v; want %+v", stored, found, err, newer)
	}
}

// Proves: FR-WS-011
// Two independently constructed application services must identify their
// writes differently, otherwise concurrent processes cannot arbitrate a tie
// using the required writer-identity portion of the version tuple.
func TestAppModelServicesUseDistinctLayoutWriterIdentities(t *testing.T) {
	first := NewAppModelService(WithEmitter(&recordingEmitter{}), WithLayoutRepository(&recordingLayoutRepository{}))
	second := NewAppModelService(WithEmitter(&recordingEmitter{}), WithLayoutRepository(&recordingLayoutRepository{}))
	if first.writerID == "" || second.writerID == "" {
		t.Fatalf("writer identities = %q, %q; want both populated", first.writerID, second.writerID)
	}
	if first.writerID == second.writerID {
		t.Fatalf("writer identities = %q and %q; want one identity per process", first.writerID, second.writerID)
	}
}

// Proves: FR-WS-009
// Pre-envelope scalar values remain readable so an existing local profile does
// not lose a valid native width during the additive migration.
func TestSqliteLayoutRepositoryReadsLegacyScalar(t *testing.T) {
	first, _ := openTwoLayoutDatabases(t)
	if _, err := first.DB.ExecContext(context.Background(), "INSERT INTO settings (key, value, type) VALUES (?, ?, ?)", layoutKey(LayoutWindowWidth), "1024", "int"); err != nil {
		t.Fatalf("seed legacy width: %v", err)
	}
	value, found, err := NewSqliteLayoutRepository(first).Read(context.Background(), LayoutWindowWidth)
	if err != nil {
		t.Fatalf("read legacy width: %v", err)
	}
	if !found || value.Version != 1 || value.Value != 1024 {
		t.Fatalf("legacy width = %+v, found=%t; want versioned 1024", value, found)
	}
}

// Proves: FR-WS-009
// Each stored native dimension validates independently: an invalid width is
// rejected without preventing a valid height from becoming durable state.
func TestSqliteLayoutRepositoryValidatesNativeDimensionsIndependently(t *testing.T) {
	first, _ := openTwoLayoutDatabases(t)
	repository := NewSqliteLayoutRepository(first)
	identity := VersionedLayoutValue{
		Version:           1,
		ChangedAtUnixNano: time.Date(2026, 8, 1, 12, 0, 1, 0, time.UTC).UnixNano(),
		WriterID:          "writer-a",
		Sequence:          1,
	}
	invalidWidth := identity
	invalidWidth.Value = 374
	if _, err := repository.Write(context.Background(), LayoutWindowWidth, invalidWidth); err == nil {
		t.Fatal("write width below 375 succeeded")
	}
	validHeight := identity
	validHeight.Value = 768
	validHeight.Sequence++
	result, err := repository.Write(context.Background(), LayoutWindowHeight, validHeight)
	if err != nil || !result.Applied {
		t.Fatalf("write valid height = %+v, %v; want applied", result, err)
	}
}

// Proves: FR-WS-009
// Every and only approved durable layout field round-trips independently.
func TestSqliteLayoutRepositoryPersistsApprovedFieldsOnly(t *testing.T) {
	first, _ := openTwoLayoutDatabases(t)
	repository := NewSqliteLayoutRepository(first)
	changedAt := time.Date(2026, 8, 1, 12, 0, 1, 0, time.UTC).UnixNano()
	fields := map[string]any{
		LayoutWindowWidth:       1024,
		LayoutWindowHeight:      768,
		LayoutWindowMaximized:   true,
		LayoutWorkspaceVisible:  false,
		LayoutWorkspaceWidth:    280,
		LayoutArrangementBackup: ArrangementSplit,
	}
	sequence := uint64(0)
	for field, raw := range fields {
		sequence++
		candidate := VersionedLayoutValue{Version: 1, Value: raw, ChangedAtUnixNano: changedAt, WriterID: "writer-a", Sequence: sequence}
		if result, err := repository.Write(context.Background(), field, candidate); err != nil || !result.Applied {
			t.Fatalf("write %s = %+v, %v; want applied", field, result, err)
		}
		stored, found, err := repository.Read(context.Background(), field)
		if err != nil || !found || stored != candidate {
			t.Fatalf("read %s = %+v, found=%t, err=%v; want %+v", field, stored, found, err, candidate)
		}
	}
	if _, err := repository.Write(context.Background(), "assistant.width", VersionedLayoutValue{Version: 1, Value: 240, ChangedAtUnixNano: changedAt, WriterID: "writer-a", Sequence: sequence + 1}); err == nil {
		t.Fatal("unknown Assistant layout field succeeded")
	}
}

// Proves: FR-WS-012
// A persistence failure leaves the backend acknowledgement and emitted
// projection untouched; callers never observe an optimistic layout value.
func TestSetUILayoutRetainsAcknowledgedProjectionAfterWriteFailure(t *testing.T) {
	repository := failingLayoutRepository{err: errors.New("write failed")}
	emitter := &recordingEmitter{}
	service := NewAppModelService(WithEmitter(emitter), WithLayoutRepository(repository))
	before, err := service.GetState(context.Background())
	if err != nil {
		t.Fatalf("GetState before rejected write: %v", err)
	}
	visible := false
	if err := service.SetUILayout(context.Background(), apperr.UILayout{SidebarVisible: &visible}); err == nil {
		t.Fatal("SetUILayout succeeded despite repository failure")
	}
	after, err := service.GetState(context.Background())
	if err != nil {
		t.Fatalf("GetState after rejected write: %v", err)
	}
	if !reflect.DeepEqual(after, before) || emitter.Count() != 0 {
		t.Fatalf("rejected write changed acknowledged state=%+v or emitted %d patches", after, emitter.Count())
	}
}

// Proves: FR-WS-012
// A stale write is a successful acknowledgement of the persisted winner, not
// an optimistic projection of the losing local intent.
func TestSetUILayoutProjectsStaleWinnerWithoutError(t *testing.T) {
	storedVisible := true
	service := NewAppModelService(WithEmitter(&recordingEmitter{}), WithLayoutRepository(staleLayoutRepository{
		result: LayoutWriteResult{Value: VersionedLayoutValue{Version: 1, Value: storedVisible, ChangedAtUnixNano: 2, WriterID: "other", Sequence: 1}},
	}))
	requestedVisible := false
	if err := service.SetUILayout(context.Background(), apperr.UILayout{SidebarVisible: &requestedVisible}); err != nil {
		t.Fatalf("SetUILayout stale result: %v", err)
	}
	state, err := service.GetState(context.Background())
	if err != nil {
		t.Fatalf("GetState: %v", err)
	}
	if state.Snapshot.UI.SidebarVisible == nil || *state.Snapshot.UI.SidebarVisible != storedVisible {
		t.Fatalf("acknowledged sidebar = %+v, want stored winner %t", state.Snapshot.UI, storedVisible)
	}
}

// Proves: FR-WS-011, FR-WS-012
// A discrete workspace visibility command reaches persistence before the
// acknowledged projection is emitted.
func TestSetUILayoutPersistsDiscreteWorkspaceVisibilityBeforeProjection(t *testing.T) {
	repository := &recordingLayoutRepository{}
	emitter := &recordingEmitter{}
	service := NewAppModelService(WithEmitter(emitter), WithLayoutRepository(repository))
	visible := false
	if err := service.SetUILayout(context.Background(), apperr.UILayout{SidebarVisible: &visible}); err != nil {
		t.Fatalf("SetUILayout: %v", err)
	}
	if len(repository.writes) != 1 || repository.writes[0].field != LayoutWorkspaceVisible || repository.writes[0].value.Value != false {
		t.Fatalf("persisted layout writes = %+v, want one workspace visibility write", repository.writes)
	}
	if emitter.Count() != 1 {
		t.Fatalf("patch count = %d, want one acknowledged patch", emitter.Count())
	}
}

// Proves: FR-WS-011, FR-WS-012
// Divider width stays pending for 250 ms and becomes visible only after its
// delayed persistence acknowledgement.
func TestSetUILayoutDebouncesWorkspaceWidthUntilAcknowledged(t *testing.T) {
	timer := &deterministicTimer{}
	repository := &recordingLayoutRepository{}
	emitter := &recordingEmitter{}
	service := NewAppModelService(WithEmitter(emitter), WithLayoutRepository(repository), WithClock(timer))
	width := 280
	if err := service.SetUILayout(context.Background(), apperr.UILayout{SidebarWidth: &width}); err != nil {
		t.Fatalf("SetUILayout: %v", err)
	}
	if len(repository.writes) != 0 || emitter.Count() != 0 || timer.Duration() != 250*time.Millisecond {
		t.Fatalf("pending width wrote=%d patches=%d delay=%s; want 0, 0, 250ms", len(repository.writes), emitter.Count(), timer.Duration())
	}
	timer.Fire()
	if len(repository.writes) != 1 || repository.writes[0].field != LayoutWorkspaceWidth || emitter.Count() != 1 {
		t.Fatalf("flushed width writes=%+v patches=%d; want one acknowledged width write", repository.writes, emitter.Count())
	}
}

// Proves: FR-WS-012
// A debounced continuous layout write failure retains the prior acknowledged
// projection and emits exactly one safe classified notification.
func TestDebouncedLayoutWriteFailureRetainsAcknowledgementAndEmitsOneSafeNotification(t *testing.T) {
	timer := &deterministicTimer{}
	repository := failingLayoutRepository{err: errors.New("/private/user/settings.db")}
	emitter := &recordingEmitter{}
	service := NewAppModelService(WithEmitter(emitter), WithLayoutRepository(repository), WithClock(timer))
	before, err := service.GetState(context.Background())
	if err != nil {
		t.Fatalf("GetState before debounced failure: %v", err)
	}
	width := 280
	if err := service.SetUILayout(context.Background(), apperr.UILayout{SidebarWidth: &width}); err != nil {
		t.Fatalf("SetUILayout: %v", err)
	}

	timer.Fire()

	after, err := service.GetState(context.Background())
	if err != nil {
		t.Fatalf("GetState after debounced failure: %v", err)
	}
	if !reflect.DeepEqual(after, before) {
		t.Fatalf("debounced failure changed acknowledged state: got %+v, want %+v", after, before)
	}
	if emitter.Count() != 0 {
		t.Fatalf("debounced failure emitted %d patches, want none", emitter.Count())
	}
	errors := emitter.Errors()
	if len(errors) != 1 {
		t.Fatalf("debounced failure errors = %+v, want exactly one safe notification", errors)
	}
	if errors[0].Code != apperr.CodeIO {
		t.Fatalf("debounced failure error = %+v, want io classification", errors[0])
	}
	if errors[0].Details["operation"] != "update layout" {
		t.Fatalf("debounced failure details = %+v, want safe layout subject", errors[0].Details)
	}
	for _, forbidden := range []string{"/private/user/settings.db", "settings.db"} {
		if strings.Contains(errors[0].Title, forbidden) || strings.Contains(errors[0].Message, forbidden) {
			t.Fatalf("debounced failure leaked raw error data %q: %+v", forbidden, errors[0])
		}
	}
}

// Proves: FR-WS-011
// Shutdown flushes a pending divider width synchronously instead of losing it
// to the outstanding 250-ms timer.
func TestFlushPendingUILayoutPersistsDividerBeforeClose(t *testing.T) {
	timer := &deterministicTimer{}
	repository := &recordingLayoutRepository{}
	service := NewAppModelService(WithEmitter(&recordingEmitter{}), WithLayoutRepository(repository), WithClock(timer))
	width := 300
	if err := service.SetUILayout(context.Background(), apperr.UILayout{SidebarWidth: &width}); err != nil {
		t.Fatalf("SetUILayout: %v", err)
	}
	if err := service.FlushPendingUILayout(); err != nil {
		t.Fatalf("FlushPendingUILayout: %v", err)
	}
	if len(repository.writes) != 1 || repository.writes[0].field != LayoutWorkspaceWidth {
		t.Fatalf("close flush writes = %+v, want persisted workspace width", repository.writes)
	}
}

// Proves: FR-WS-011
// Rapid divider input retains one pending field and commits only the latest
// intended width when the debounce expires.
func TestSetUILayoutKeepsOnlyLatestPendingWorkspaceWidth(t *testing.T) {
	timer := &deterministicTimer{}
	repository := &recordingLayoutRepository{}
	service := NewAppModelService(WithEmitter(&recordingEmitter{}), WithLayoutRepository(repository), WithClock(timer))
	first, latest := 260, 320
	if err := service.SetUILayout(context.Background(), apperr.UILayout{SidebarWidth: &first}); err != nil {
		t.Fatalf("set first width: %v", err)
	}
	if err := service.SetUILayout(context.Background(), apperr.UILayout{SidebarWidth: &latest}); err != nil {
		t.Fatalf("set latest width: %v", err)
	}
	timer.Fire()
	if len(repository.writes) != 1 || repository.writes[0].value.Value != latest {
		t.Fatalf("debounced writes = %+v, want one latest width %d", repository.writes, latest)
	}
}

// Proves: FR-WS-011
// A pending continuous field keeps its original arbitration identity when the
// delayed write finally commits.
func TestPendingLayoutFlushRetainsOriginalWriteIdentity(t *testing.T) {
	timer := &deterministicTimer{}
	repository := &recordingLayoutRepository{}
	service := NewAppModelService(WithEmitter(&recordingEmitter{}), WithLayoutRepository(repository), WithClock(timer))
	width := 310
	if err := service.SetUILayout(context.Background(), apperr.UILayout{SidebarWidth: &width}); err != nil {
		t.Fatalf("SetUILayout: %v", err)
	}
	original := service.pending.values[LayoutWorkspaceWidth]
	timer.Fire()
	if len(repository.writes) != 1 || repository.writes[0].value != original {
		t.Fatalf("flushed identity = %+v, want original pending value %+v", repository.writes, original)
	}
}

// Proves: FR-WS-011, FR-WS-012
// A failed synchronous close flush keeps the pending field and its original
// identity so a later retry can still durably acknowledge the same intent.
func TestFlushPendingUILayoutRetainsPendingFieldAfterWriteFailure(t *testing.T) {
	timer := &deterministicTimer{}
	repository := &failThenRecordLayoutRepository{remainingFailures: 1}
	service := NewAppModelService(WithEmitter(&recordingEmitter{}), WithLayoutRepository(repository), WithClock(timer))
	width := 310
	if err := service.SetUILayout(context.Background(), apperr.UILayout{SidebarWidth: &width}); err != nil {
		t.Fatalf("SetUILayout: %v", err)
	}
	original := service.pending.values[LayoutWorkspaceWidth]

	if err := service.FlushPendingUILayout(); err == nil {
		t.Fatal("FlushPendingUILayout succeeded despite repository failure")
	}
	if service.pending == nil {
		t.Fatal("pending layout cleared after failed flush")
	}
	if got := service.pending.values[LayoutWorkspaceWidth]; got != original {
		t.Fatalf("pending value after failed flush = %+v, want original %+v", got, original)
	}
	if err := service.FlushPendingUILayout(); err != nil {
		t.Fatalf("FlushPendingUILayout retry: %v", err)
	}
	if len(repository.writes) != 1 || repository.writes[0].value != original {
		t.Fatalf("retry writes = %+v, want one original pending write %+v", repository.writes, original)
	}
}

// Proves: FR-WS-011
// The synchronous close-flush seam must not return while an older timer flush
// still owns the detached pending snapshot.
func TestFlushPendingUILayoutWaitsForInFlightTimerWriteBeforeClose(t *testing.T) {
	timer := &deterministicTimer{}
	repository := &blockingLayoutRepository{
		firstWriteStarted: make(chan recordedLayoutWrite, 1),
		releaseFirstWrite: make(chan error, 1),
	}
	service := NewAppModelService(WithEmitter(&recordingEmitter{}), WithLayoutRepository(repository), WithClock(timer))
	width := 300
	if err := service.SetUILayout(context.Background(), apperr.UILayout{SidebarWidth: &width}); err != nil {
		t.Fatalf("SetUILayout: %v", err)
	}

	timerFlushDone := make(chan struct{})
	go func() {
		timer.Fire()
		close(timerFlushDone)
	}()
	<-repository.firstWriteStarted

	closeResult := make(chan error, 1)
	closeStarted := make(chan struct{})
	go func() {
		close(closeStarted)
		closeResult <- service.FlushPendingUILayout()
	}()
	<-closeStarted

	for range 100 {
		runtime.Gosched()
		select {
		case err := <-closeResult:
			t.Fatalf("FlushPendingUILayout returned early with %v while timer write was still in flight", err)
		default:
		}
	}

	repository.releaseFirstWrite <- nil
	<-timerFlushDone

	if err := <-closeResult; err != nil {
		t.Fatalf("FlushPendingUILayout after timer write: %v", err)
	}
	if len(repository.writes) != 1 || repository.writes[0].field != LayoutWorkspaceWidth {
		t.Fatalf("writes after coordinated close flush = %+v, want one timer-owned width write", repository.writes)
	}
}

// Proves: FR-WS-011, FR-WS-012
// If an older timer callback has already detached its pending divider write,
// then a newer divider resize arrives before that older write fails, the newer
// pending field stays authoritative for the retry path.
func TestFailedOlderTimerFlushDoesNotRestoreOverNewerPendingResize(t *testing.T) {
	timer := &deterministicTimer{}
	repository := &blockingLayoutRepository{
		firstWriteStarted: make(chan recordedLayoutWrite, 1),
		releaseFirstWrite: make(chan error, 1),
	}
	service := NewAppModelService(WithEmitter(&recordingEmitter{}), WithLayoutRepository(repository), WithClock(timer))

	first := 280
	if err := service.SetUILayout(context.Background(), apperr.UILayout{SidebarWidth: &first}); err != nil {
		t.Fatalf("set first width: %v", err)
	}
	older := service.pending.values[LayoutWorkspaceWidth]

	firstFlushDone := make(chan struct{})
	go func() {
		timer.Fire()
		close(firstFlushDone)
	}()

	firstWrite := <-repository.firstWriteStarted
	if firstWrite.value != older {
		t.Fatalf("older timer write = %+v, want original pending value %+v", firstWrite, older)
	}

	latest := 340
	if err := service.SetUILayout(context.Background(), apperr.UILayout{SidebarWidth: &latest}); err != nil {
		t.Fatalf("set latest width: %v", err)
	}
	newer := service.pending.values[LayoutWorkspaceWidth]
	if newer == older {
		t.Fatalf("newer pending identity = %+v, want distinct later value", newer)
	}

	repository.releaseFirstWrite <- failedLayoutWrite{}.Err()
	<-firstFlushDone

	if service.pending == nil {
		t.Fatal("pending layout cleared after failed older timer flush")
	}
	if got := service.pending.values[LayoutWorkspaceWidth]; got != newer {
		t.Fatalf("pending value after failed older timer flush = %+v, want newer pending %+v", got, newer)
	}
	if got := service.pending.layout.SidebarWidth; got == nil || *got != latest {
		t.Fatalf("pending layout after failed older timer flush = %+v, want latest width %d", service.pending.layout, latest)
	}
	if len(repository.writes) != 0 {
		t.Fatalf("failed older timer flush wrote = %+v, want none", repository.writes)
	}

	timer.Fire()
	if len(repository.writes) != 1 || repository.writes[0].value != newer {
		t.Fatalf("retry writes = %+v, want one newer pending write %+v", repository.writes, newer)
	}
}

// Proves: FR-WS-011
// Native resize dimensions are continuous input: they wait for the debounce,
// unlike the discrete maximized-state command.
func TestSetUILayoutDebouncesNativeResizeButPersistsMaximizeImmediately(t *testing.T) {
	timer := &deterministicTimer{}
	repository := &recordingLayoutRepository{}
	service := NewAppModelService(WithEmitter(&recordingEmitter{}), WithLayoutRepository(repository), WithClock(timer))
	width := 1100
	if err := service.SetUILayout(context.Background(), apperr.UILayout{WindowWidth: &width}); err != nil {
		t.Fatalf("set native width: %v", err)
	}
	if len(repository.writes) != 0 {
		t.Fatalf("native resize wrote early: %+v", repository.writes)
	}
	maximized := true
	if err := service.SetUILayout(context.Background(), apperr.UILayout{WindowMaximized: &maximized}); err != nil {
		t.Fatalf("set maximized: %v", err)
	}
	if len(repository.writes) != 1 || repository.writes[0].field != LayoutWindowMaximized {
		t.Fatalf("discrete maximize writes = %+v, want immediate maximize", repository.writes)
	}
	timer.Fire()
	if len(repository.writes) != 2 || repository.writes[1].field != LayoutWindowWidth {
		t.Fatalf("debounced native resize writes = %+v, want width after timer", repository.writes)
	}
}

// Proves: FR-WS-009
// Native width, height, and maximized state are explicit durable fields and
// do not rely on browser viewport dimensions.
func TestSetUILayoutPersistsNativeGeometry(t *testing.T) {
	timer := &deterministicTimer{}
	repository := &recordingLayoutRepository{}
	service := NewAppModelService(WithEmitter(&recordingEmitter{}), WithLayoutRepository(repository), WithClock(timer))
	width, height := 1024, 768
	maximized := true
	if err := service.SetUILayout(context.Background(), apperr.UILayout{WindowWidth: &width, WindowHeight: &height, WindowMaximized: &maximized}); err != nil {
		t.Fatalf("SetUILayout native geometry: %v", err)
	}
	if len(repository.writes) != 1 || repository.writes[0].field != LayoutWindowMaximized {
		t.Fatalf("native geometry immediate writes = %+v, want maximized only", repository.writes)
	}
	timer.Fire()
	if len(repository.writes) != 3 {
		t.Fatalf("native geometry flushed writes = %+v, want width, height, maximized", repository.writes)
	}
}

// Proves: FR-WS-009
// Native geometry is validated at the appmodel boundary even before startup
// supplies the SQLite repository.
func TestSetUILayoutRejectsInvalidNativeGeometryWithoutRepository(t *testing.T) {
	service := NewAppModelService(WithEmitter(&recordingEmitter{}))
	width := 374
	if err := service.SetUILayout(context.Background(), apperr.UILayout{WindowWidth: &width}); err == nil {
		t.Fatal("native width below 375 succeeded without repository")
	}
}

// Proves: FR-WS-010
// Changing the application fallback does not overwrite a document's saved
// arrangement; document view remains the canonical owner once present.
func TestApplicationArrangementFallbackDoesNotOverwriteSavedDocumentView(t *testing.T) {
	service := NewAppModelService(WithEmitter(&recordingEmitter{}))
	before, err := service.GetState(context.Background())
	if err != nil {
		t.Fatalf("GetState before fallback: %v", err)
	}
	if err := service.SetDocView(context.Background(), before.Snapshot.ActiveDocumentID, validDocView(true, true)); err != nil {
		t.Fatalf("save document view: %v", err)
	}
	fallback := ArrangementEditor
	if err := service.SetUILayout(context.Background(), apperr.UILayout{ViewArrangement: &fallback}); err != nil {
		t.Fatalf("set application fallback: %v", err)
	}
	after, err := service.GetState(context.Background())
	if err != nil {
		t.Fatalf("GetState after fallback: %v", err)
	}
	if got := after.Snapshot.Documents[before.Snapshot.ActiveDocumentID].View.Arrangement; got != ArrangementSplit {
		t.Fatalf("saved document arrangement = %q, want %q", got, ArrangementSplit)
	}
}

// Proves: FR-WS-010
// A fresh document without a saved view takes the application fallback until
// the document itself receives a view command.
func TestFreshDocumentUsesApplicationArrangementFallbackUntilItsViewIsSaved(t *testing.T) {
	service := NewAppModelService(WithEmitter(&recordingEmitter{}))
	state, err := service.GetState(context.Background())
	if err != nil {
		t.Fatalf("GetState: %v", err)
	}
	fallback := ArrangementPreview
	if err := service.SetUILayout(context.Background(), apperr.UILayout{ViewArrangement: &fallback}); err != nil {
		t.Fatalf("set fallback: %v", err)
	}
	withFallback, err := service.GetState(context.Background())
	if err != nil {
		t.Fatalf("GetState with fallback: %v", err)
	}
	if got := withFallback.Snapshot.Documents[state.Snapshot.ActiveDocumentID].View.Arrangement; got != ArrangementPreview {
		t.Fatalf("fresh document arrangement = %q, want fallback %q", got, ArrangementPreview)
	}
	if err := service.SetDocView(context.Background(), state.Snapshot.ActiveDocumentID, validDocView(true, false)); err != nil {
		t.Fatalf("save document view: %v", err)
	}
	fallback = ArrangementSplit
	if err := service.SetUILayout(context.Background(), apperr.UILayout{ViewArrangement: &fallback}); err != nil {
		t.Fatalf("change fallback after saved view: %v", err)
	}
	saved, err := service.GetState(context.Background())
	if err != nil {
		t.Fatalf("GetState with saved view: %v", err)
	}
	if got := saved.Snapshot.Documents[state.Snapshot.ActiveDocumentID].View.Arrangement; got != ArrangementEditor {
		t.Fatalf("saved document arrangement = %q, want %q", got, ArrangementEditor)
	}
}

type failingLayoutRepository struct{ err error }

func (repository failingLayoutRepository) Write(context.Context, string, VersionedLayoutValue) (LayoutWriteResult, error) {
	return LayoutWriteResult{}, repository.err
}

func (failingLayoutRepository) Read(context.Context, string) (VersionedLayoutValue, bool, error) {
	return VersionedLayoutValue{}, false, nil
}

type staleLayoutRepository struct{ result LayoutWriteResult }

func (repository staleLayoutRepository) Write(context.Context, string, VersionedLayoutValue) (LayoutWriteResult, error) {
	return repository.result, nil
}

func (staleLayoutRepository) Read(context.Context, string) (VersionedLayoutValue, bool, error) {
	return VersionedLayoutValue{}, false, nil
}

type recordedLayoutWrite struct {
	field string
	value VersionedLayoutValue
}

type recordingLayoutRepository struct{ writes []recordedLayoutWrite }

func (repository *recordingLayoutRepository) Write(_ context.Context, field string, value VersionedLayoutValue) (LayoutWriteResult, error) {
	repository.writes = append(repository.writes, recordedLayoutWrite{field: field, value: value})
	return LayoutWriteResult{Applied: true, Value: value}, nil
}

func (*recordingLayoutRepository) Read(context.Context, string) (VersionedLayoutValue, bool, error) {
	return VersionedLayoutValue{}, false, nil
}

type failThenRecordLayoutRepository struct {
	remainingFailures int
	writes            []recordedLayoutWrite
}

func (repository *failThenRecordLayoutRepository) Write(_ context.Context, field string, value VersionedLayoutValue) (LayoutWriteResult, error) {
	if repository.remainingFailures > 0 {
		repository.remainingFailures--
		return LayoutWriteResult{}, failedLayoutWrite{}.Err()
	}
	repository.writes = append(repository.writes, recordedLayoutWrite{field: field, value: value})
	return LayoutWriteResult{Applied: true, Value: value}, nil
}

func (*failThenRecordLayoutRepository) Read(context.Context, string) (VersionedLayoutValue, bool, error) {
	return VersionedLayoutValue{}, false, nil
}

type blockingLayoutRepository struct {
	firstWriteStarted chan recordedLayoutWrite
	releaseFirstWrite chan error
	blocked           bool
	writes            []recordedLayoutWrite
}

func (repository *blockingLayoutRepository) Write(_ context.Context, field string, value VersionedLayoutValue) (LayoutWriteResult, error) {
	write := recordedLayoutWrite{field: field, value: value}
	if !repository.blocked {
		repository.blocked = true
		repository.firstWriteStarted <- write
		if err := <-repository.releaseFirstWrite; err != nil {
			return LayoutWriteResult{}, err
		}
	}
	repository.writes = append(repository.writes, write)
	return LayoutWriteResult{Applied: true, Value: value}, nil
}

func (*blockingLayoutRepository) Read(context.Context, string) (VersionedLayoutValue, bool, error) {
	return VersionedLayoutValue{}, false, nil
}

// Proves: FR-WS-009
// The backend projection does not leak document-owned panes or downstream
// Assistant state as application layout on hydration.
func TestInitialLayoutOmitsExcludedDocumentAndAssistantFields(t *testing.T) {
	state, err := NewAppModelService(WithEmitter(&recordingEmitter{})).GetState(context.Background())
	if err != nil {
		t.Fatalf("GetState: %v", err)
	}
	layout := state.Snapshot.UI
	if layout.EditorPaneVisible != nil || layout.PreviewPaneVisible != nil ||
		layout.AssistantVisible != nil || layout.AssistantWidth != nil {
		t.Fatalf("initial application layout leaked excluded fields: %+v", layout)
	}
}

// Proves: FR-WS-011
// A width that travels with a visibility change is one discrete intent —
// restoring a workspace that was put away — not the stream of updates a drag
// produces. It is applied with the visibility change in a single patch, because
// debouncing it would show the workspace at its old width and widen it a
// quarter of a second later, which is the symptom the restore exists to remove.
func TestSetUILayoutAppliesRestoredWorkspaceWidthWithItsVisibility(t *testing.T) {
	timer := &deterministicTimer{}
	repository := &recordingLayoutRepository{}
	emitter := &recordingEmitter{}
	service := NewAppModelService(WithEmitter(emitter), WithLayoutRepository(repository), WithClock(timer))
	visible := true
	width := 216

	if err := service.SetUILayout(context.Background(), apperr.UILayout{SidebarVisible: &visible, SidebarWidth: &width}); err != nil {
		t.Fatalf("SetUILayout: %v", err)
	}

	if emitter.Count() != 1 {
		t.Fatalf("patches=%d; want exactly one carrying both fields", emitter.Count())
	}
	fields := map[string]bool{}
	for _, write := range repository.writes {
		fields[write.field] = true
	}
	if !fields[LayoutWorkspaceVisible] || !fields[LayoutWorkspaceWidth] {
		t.Fatalf("writes=%+v; want both visibility and width persisted before the timer fires", repository.writes)
	}
	patch := emitter.Patches()[0]
	if patch.UI == nil || patch.UI.SidebarVisible == nil || patch.UI.SidebarWidth == nil {
		t.Fatalf("patch ui=%+v; want one patch carrying visibility and width together", patch.UI)
	}
	if *patch.UI.SidebarVisible != true || *patch.UI.SidebarWidth != 216 {
		t.Fatalf("patch ui visible=%v width=%d; want true and 216", *patch.UI.SidebarVisible, *patch.UI.SidebarWidth)
	}
}
