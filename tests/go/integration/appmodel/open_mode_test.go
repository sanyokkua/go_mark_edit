package appmodel_test

import (
	"context"
	"os"
	"path/filepath"
	"testing"

	"github.com/sanyokkua/go_mark_edit/internal/apperr"
	"github.com/sanyokkua/go_mark_edit/internal/appmodel"
	"github.com/sanyokkua/go_mark_edit/internal/db"
)

type openModeFixture struct {
	t          *testing.T
	ctx        context.Context
	directory  string
	database   *db.Database
	metadata   *appmodel.SqliteFileMetadataRepository
	service    *appmodel.AppModelService
	fileSerial int
}

func newOpenModeFixture(t *testing.T, directory string) *openModeFixture {
	t.Helper()
	ctx := context.Background()
	database, err := db.Open(ctx, filepath.Join(directory, "settings.db"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = database.Close() })
	fixture := &openModeFixture{t: t, ctx: ctx, directory: directory, database: database, metadata: appmodel.NewSqliteFileMetadataRepository(database)}
	fixture.service = appmodel.NewAppModelServiceForHost(
		appmodel.AppModelOption{FileMetadataRepository: fixture.metadata, LayoutRepository: appmodel.NewSqliteLayoutRepository(database)},
		appmodel.WithEmitter(&recordingEmitter{}),
	)
	if err := fixture.service.RestoreUILayout(ctx); err != nil {
		t.Fatal(err)
	}
	return fixture
}

func (fixture *openModeFixture) newFile() string {
	fixture.fileSerial++
	path := filepath.Join(fixture.directory, "note"+string(rune('a'+fixture.fileSerial))+".md")
	if err := os.WriteFile(path, []byte("text\n"), 0o644); err != nil {
		fixture.t.Fatal(err)
	}
	return path
}

func (fixture *openModeFixture) open(mode, path string) (apperr.OpenResult, apperr.DocView) {
	fixture.t.Helper()
	fixture.service.SetDefaultOpenMode(mode)
	state, err := fixture.service.GetState(fixture.ctx)
	if err != nil {
		fixture.t.Fatal(err)
	}
	opened := fixture.service.OpenPath(fixture.ctx, path, state.Snapshot.TabSetRevision)
	if opened.Status != apperr.OpenStatusOpened {
		fixture.t.Fatalf("open %s: %+v", path, opened)
	}
	state, err = fixture.service.GetState(fixture.ctx)
	if err != nil {
		fixture.t.Fatal(err)
	}
	return opened, state.Snapshot.Documents[opened.DocumentID].View
}

func (fixture *openModeFixture) expectOpen(mode string, wantArrangement string, wantReading bool) {
	fixture.t.Helper()
	opened, view := fixture.open(mode, fixture.newFile())
	if view.Arrangement != wantArrangement || opened.ReadingMode != wantReading {
		fixture.t.Fatalf("open in %q mode = arrangement %q reading %v, want %q reading %v", mode, view.Arrangement, opened.ReadingMode, wantArrangement, wantReading)
	}
}

func TestEachOpenModeChoosesTheArrangementAndReadingState(t *testing.T) {
	for _, testCase := range []struct {
		mode        string
		arrangement string
		reading     bool
	}{
		{appmodel.OpenModeReading, appmodel.ArrangementSplit, true},
		{appmodel.OpenModeEditor, appmodel.ArrangementEditor, false},
		{appmodel.OpenModeSplit, appmodel.ArrangementSplit, false},
		{appmodel.OpenModePreview, appmodel.ArrangementPreview, false},
		{appmodel.OpenModeLast, appmodel.ArrangementSplit, false},
	} {
		t.Run(testCase.mode, func(t *testing.T) {
			newOpenModeFixture(t, t.TempDir()).expectOpen(testCase.mode, testCase.arrangement, testCase.reading)
		})
	}
}

func TestReadingOpenKeepsTheWindowArrangementBehindIt(t *testing.T) {
	fixture := newOpenModeFixture(t, t.TempDir())
	arrangement := appmodel.ArrangementPreview
	if err := fixture.service.SetUILayout(fixture.ctx, apperr.UILayout{ViewArrangement: &arrangement}); err != nil {
		t.Fatal(err)
	}
	fixture.expectOpen(appmodel.OpenModeReading, appmodel.ArrangementPreview, true)
}

func TestTheSettingWinsOverTheFilesSavedViewButKeepsItsSplitRatio(t *testing.T) {
	fixture := newOpenModeFixture(t, t.TempDir())
	path := fixture.newFile()
	canonical, err := filepath.EvalSymlinks(path)
	if err != nil {
		t.Fatal(err)
	}
	if err := fixture.metadata.WriteView(fixture.ctx, canonical, appmodel.FileViewMetadata{Arrangement: appmodel.ArrangementPreview, SplitRatio: 0.7}); err != nil {
		t.Fatal(err)
	}
	opened, view := fixture.open(appmodel.OpenModeEditor, path)
	if opened.ReadingMode || view.Arrangement != appmodel.ArrangementEditor || !view.EditorVisible || view.PreviewVisible || view.SplitRatio != 0.7 {
		t.Fatalf("editor setting over a saved Preview view = %+v reading %v, want Editor with ratio 0.7", view, opened.ReadingMode)
	}

	reading := newOpenModeFixture(t, t.TempDir())
	savedPath := reading.newFile()
	savedCanonical, _ := filepath.EvalSymlinks(savedPath)
	if err := reading.metadata.WriteView(reading.ctx, savedCanonical, appmodel.FileViewMetadata{Arrangement: appmodel.ArrangementPreview, SplitRatio: 0.3}); err != nil {
		t.Fatal(err)
	}
	opened, view = reading.open(appmodel.OpenModeReading, savedPath)
	if !opened.ReadingMode || view.Arrangement != appmodel.ArrangementPreview || view.SplitRatio != 0.3 {
		t.Fatalf("reading setting over a saved Preview view = %+v reading %v, want Reading over the saved Preview", view, opened.ReadingMode)
	}
}

func TestLastFollowsTheLatestArrangementAndReadingChoice(t *testing.T) {
	fixture := newOpenModeFixture(t, t.TempDir())
	first, _ := fixture.open(appmodel.OpenModeLast, fixture.newFile())
	if err := fixture.service.SetDocView(fixture.ctx, first.DocumentID, validDocView(true, false)); err != nil {
		t.Fatal(err)
	}
	fixture.expectOpen(appmodel.OpenModeLast, appmodel.ArrangementEditor, false)

	if err := fixture.service.SetReadingActive(fixture.ctx, true); err != nil {
		t.Fatal(err)
	}
	fixture.expectOpen(appmodel.OpenModeLast, appmodel.ArrangementSplit, true)

	// Leaving Reading returns to the arrangement it was covering: the Split the
	// reading-open document has.
	if err := fixture.service.SetReadingActive(fixture.ctx, false); err != nil {
		t.Fatal(err)
	}
	fixture.expectOpen(appmodel.OpenModeLast, appmodel.ArrangementSplit, false)

	state, _ := fixture.service.GetState(fixture.ctx)
	if err := fixture.service.SetDocView(fixture.ctx, state.Snapshot.ActiveDocumentID, validDocView(false, true)); err != nil {
		t.Fatal(err)
	}
	fixture.expectOpen(appmodel.OpenModeLast, appmodel.ArrangementPreview, false)
}

func TestSwitchingTabsDoesNotReplaceTheLastChoiceWhileReadingIsActive(t *testing.T) {
	fixture := newOpenModeFixture(t, t.TempDir())
	first, _ := fixture.open(appmodel.OpenModeLast, fixture.newFile())
	if err := fixture.service.SetReadingActive(fixture.ctx, true); err != nil {
		t.Fatal(err)
	}
	if err := fixture.service.SetDocView(fixture.ctx, first.DocumentID, validDocView(true, false)); err != nil {
		t.Fatal(err)
	}
	fixture.expectOpen(appmodel.OpenModeLast, appmodel.ArrangementSplit, true)
}

func TestLastSurvivesARestart(t *testing.T) {
	directory := t.TempDir()
	first := newOpenModeFixture(t, directory)
	opened, _ := first.open(appmodel.OpenModeLast, first.newFile())
	if err := first.service.SetDocView(first.ctx, opened.DocumentID, validDocView(false, true)); err != nil {
		t.Fatal(err)
	}
	if err := first.service.SetReadingActive(first.ctx, true); err != nil {
		t.Fatal(err)
	}
	if err := first.service.FlushPendingUILayout(); err != nil {
		t.Fatal(err)
	}
	if err := first.database.Close(); err != nil {
		t.Fatal(err)
	}

	// The relaunched fixture reopens the same file name, so Reading sits over
	// that file's saved Preview view.
	second := newOpenModeFixture(t, directory)
	second.expectOpen(appmodel.OpenModeLast, appmodel.ArrangementPreview, true)
}

func TestOnlySuccessfulOpensChangeTheModeAndNewDocumentStaysEditor(t *testing.T) {
	fixture := newOpenModeFixture(t, t.TempDir())
	path := fixture.newFile()
	fixture.open(appmodel.OpenModeReading, path)
	state, _ := fixture.service.GetState(fixture.ctx)

	focused := fixture.service.OpenPath(fixture.ctx, path, state.Snapshot.TabSetRevision)
	if focused.Status != apperr.OpenStatusFocused || focused.ReadingMode {
		t.Fatalf("duplicate open = %+v, want focused without readingMode", focused)
	}
	refused := fixture.service.OpenPath(fixture.ctx, filepath.Join(fixture.directory, "missing.md"), state.Snapshot.TabSetRevision)
	if refused.Error == nil || refused.ReadingMode {
		t.Fatalf("missing file open = %+v, want a refusal without readingMode", refused)
	}
	for _, mode := range []string{appmodel.OpenModePreview, appmodel.OpenModeReading, appmodel.OpenModeLast} {
		fixture.service.SetDefaultOpenMode(mode)
		state, _ = fixture.service.GetState(fixture.ctx)
		created := fixture.service.NewDocument(fixture.ctx, state.Snapshot.TabSetRevision)
		if created.Data == nil {
			t.Fatalf("NewDocument = %+v", created)
		}
		state, _ = fixture.service.GetState(fixture.ctx)
		view := state.Snapshot.Documents[created.Data.DocumentID].View
		if view.Arrangement != appmodel.ArrangementEditor {
			t.Fatalf("New document under %q = %+v, want Editor", mode, view)
		}
	}
}

func TestAnUnknownDefaultOpenModeIsIgnored(t *testing.T) {
	fixture := newOpenModeFixture(t, t.TempDir())
	fixture.service.SetDefaultOpenMode(appmodel.OpenModeEditor)
	fixture.service.SetDefaultOpenMode("viewer")
	fixture.expectOpen("viewer", appmodel.ArrangementEditor, false)
}

func TestLastArrangementSurvivesARestart(t *testing.T) {
	directory := t.TempDir()
	first := newOpenModeFixture(t, directory)
	opened, _ := first.open(appmodel.OpenModeLast, first.newFile())
	if err := first.service.SetDocView(first.ctx, opened.DocumentID, validDocView(false, true)); err != nil {
		t.Fatal(err)
	}
	if err := first.database.Close(); err != nil {
		t.Fatal(err)
	}

	newOpenModeFixture(t, directory).expectOpen(appmodel.OpenModeLast, appmodel.ArrangementPreview, false)
}

func TestClosingTheOnlyTabWhileReadingKeepsReadingAsTheLastChoice(t *testing.T) {
	fixture := newOpenModeFixture(t, t.TempDir())
	first, _ := fixture.open(appmodel.OpenModeLast, fixture.newFile())
	if err := fixture.service.SetReadingActive(fixture.ctx, true); err != nil {
		t.Fatal(err)
	}
	state, _ := fixture.service.GetState(fixture.ctx)
	if closed := fixture.service.CloseDocument(fixture.ctx, first.DocumentID, state.Snapshot.TabSetRevision); closed.Status != apperr.TabTransitionClosed {
		t.Fatalf("close = %+v", closed)
	}
	// With no document the shell leaves Reading mode on its own.
	if err := fixture.service.SetReadingActive(fixture.ctx, false); err != nil {
		t.Fatal(err)
	}

	fixture.expectOpen(appmodel.OpenModeLast, appmodel.ArrangementSplit, true)
}

func TestPickingTheArrangementANewTabAlreadyShowsStillRecordsItAsLast(t *testing.T) {
	fixture := newOpenModeFixture(t, t.TempDir())
	// Documents opened while Reading was the last mode keep no saved view of their own.
	if err := fixture.service.SetReadingActive(fixture.ctx, true); err != nil {
		t.Fatal(err)
	}
	a, _ := fixture.open(appmodel.OpenModeLast, fixture.newFile())
	b, _ := fixture.open(appmodel.OpenModeLast, fixture.newFile())
	// B is switched to Editor while Reading is active, which makes Editor the window arrangement.
	if err := fixture.service.SetDocView(fixture.ctx, b.DocumentID, validDocView(true, false)); err != nil {
		t.Fatal(err)
	}
	editor := appmodel.ArrangementEditor
	if err := fixture.service.SetUILayout(fixture.ctx, apperr.UILayout{ViewArrangement: &editor}); err != nil {
		t.Fatal(err)
	}
	if err := fixture.service.SetReadingActive(fixture.ctx, false); err != nil {
		t.Fatal(err)
	}
	state, _ := fixture.service.GetState(fixture.ctx)
	if activated := fixture.service.ActivateDocument(fixture.ctx, a.DocumentID, state.Snapshot.TabSetRevision); activated.Error != nil {
		t.Fatalf("activate = %+v", activated)
	}
	// A has no saved view, so it shows the window's Editor; choosing Split must still be remembered.
	if err := fixture.service.SetDocView(fixture.ctx, a.DocumentID, validDocView(true, true)); err != nil {
		t.Fatal(err)
	}

	fixture.expectOpen(appmodel.OpenModeLast, appmodel.ArrangementSplit, false)
}
