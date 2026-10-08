package appmodel_test

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"math"
	"os"
	"path/filepath"
	"testing"

	"github.com/sanyokkua/go_mark_edit/internal/apperr"
	"github.com/sanyokkua/go_mark_edit/internal/appmodel"
	"github.com/sanyokkua/go_mark_edit/internal/db"
)

func TestSplitRatioDefaultsAndPartialViewUpdatesPreserveIt(t *testing.T) {
	ctx := context.Background()
	service := appmodel.NewAppModelServiceForHost(appmodel.WithEmitter(&recordingEmitter{}))
	id := newUntitledID(t, service)
	state, err := service.GetState(ctx)
	if err != nil {
		t.Fatal(err)
	}
	if got := state.Snapshot.Documents[id].View.SplitRatio; got != 0.5 {
		t.Fatalf("initial ratio = %v", got)
	}
	view := validDocView(true, true)
	view.SplitRatio = ratio(0.68)
	if err := service.SetDocView(ctx, id, view); err != nil {
		t.Fatal(err)
	}
	if err := service.SetDocView(ctx, id, validDocView(false, true)); err != nil {
		t.Fatal(err)
	}
	state, err = service.GetState(ctx)
	if err != nil {
		t.Fatal(err)
	}
	if got := state.Snapshot.Documents[id].View.SplitRatio; got != 0.68 {
		t.Fatalf("ratio after omitted update = %v", got)
	}
}

func TestSplitRatioRejectsInvalidValuesWithoutChangingState(t *testing.T) {
	ctx := context.Background()
	service := appmodel.NewAppModelServiceForHost(appmodel.WithEmitter(&recordingEmitter{}))
	id := newUntitledID(t, service)
	state, err := service.GetState(ctx)
	if err != nil {
		t.Fatal(err)
	}
	for _, value := range []float64{0.19, 0.81, math.NaN(), math.Inf(1), math.Inf(-1)} {
		view := validDocView(true, true)
		view.SplitRatio = ratio(value)
		if err := service.SetDocView(ctx, id, view); err == nil {
			t.Fatalf("accepted ratio %v", value)
		}
	}
	state, err = service.GetState(ctx)
	if err != nil {
		t.Fatal(err)
	}
	if got := state.Snapshot.Documents[id].View.SplitRatio; got != 0.5 {
		t.Fatalf("ratio after rejection = %v", got)
	}
}

func TestSplitRatioRestoresPerCanonicalPathAcrossServiceRestart(t *testing.T) {
	ctx := context.Background()
	directory := t.TempDir()
	database, err := db.Open(ctx, filepath.Join(directory, "settings.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer func() { _ = database.Close() }()
	repository := appmodel.NewSqliteFileMetadataRepository(database)
	firstPath := filepath.Join(directory, "first.md")
	secondPath := filepath.Join(directory, "second.md")
	for _, path := range []string{firstPath, secondPath} {
		if err := os.WriteFile(path, []byte("text\n"), 0o644); err != nil {
			t.Fatal(err)
		}
	}
	service := appmodel.NewAppModelServiceForHost(appmodel.AppModelOption{FileMetadataRepository: repository}, appmodel.WithEmitter(&recordingEmitter{}))
	for _, item := range []struct {
		path  string
		ratio float64
	}{{firstPath, 0.34}, {secondPath, 0.76}} {
		state, err := service.GetState(ctx)
		if err != nil {
			t.Fatal(err)
		}
		opened := service.OpenPath(ctx, item.path, state.Snapshot.TabSetRevision)
		if opened.DocumentID == "" {
			t.Fatalf("open %s: %+v", item.path, opened)
		}
		view := validDocView(true, true)
		view.SplitRatio = ratio(item.ratio)
		if err := service.SetDocView(ctx, opened.DocumentID, view); err != nil {
			t.Fatal(err)
		}
	}
	restarted := appmodel.NewAppModelServiceForHost(appmodel.AppModelOption{FileMetadataRepository: repository}, appmodel.WithEmitter(&recordingEmitter{}))
	for _, item := range []struct {
		path  string
		ratio float64
	}{{firstPath, 0.34}, {secondPath, 0.76}} {
		state, err := restarted.GetState(ctx)
		if err != nil {
			t.Fatal(err)
		}
		opened := restarted.OpenPath(ctx, item.path, state.Snapshot.TabSetRevision)
		if opened.DocumentID == "" {
			t.Fatalf("reopen %s: %+v", item.path, opened)
		}
		state, err = restarted.GetState(ctx)
		if err != nil {
			t.Fatal(err)
		}
		if got := state.Snapshot.Documents[opened.DocumentID].View.SplitRatio; got != item.ratio {
			t.Fatalf("restored %s ratio = %v, want %v", item.path, got, item.ratio)
		}
	}
}

func TestSplitRatioPersistenceFailureRetainsSessionRatio(t *testing.T) {
	ctx := context.Background()
	path := filepath.Join(t.TempDir(), "notes.md")
	if err := os.WriteFile(path, []byte("text\n"), 0o644); err != nil {
		t.Fatal(err)
	}
	emitter := &recordingEmitter{}
	service := appmodel.NewAppModelServiceForHost(appmodel.AppModelOption{FileMetadataRepository: failingViewRepository{}}, appmodel.WithEmitter(emitter))
	opened := service.OpenPath(ctx, path, 0)
	if opened.DocumentID == "" {
		t.Fatalf("open: %+v", opened)
	}
	if err := service.SetDocView(ctx, opened.DocumentID, validDocView(true, true)); err != nil {
		t.Fatalf("cursor-only update wrote metadata: %v", err)
	}
	view := validDocView(true, true)
	view.SplitRatio = ratio(0.6)
	if err := service.SetDocView(ctx, opened.DocumentID, view); err != nil {
		t.Fatalf("accepted ratio returned transport failure: %v", err)
	}
	warnings := emitter.Errors()
	if len(warnings) != 1 || warnings[0].Category != apperr.ClassifiedPersistenceWarning {
		t.Fatalf("persistence warnings = %+v, want one classified warning", warnings)
	}
	state, err := service.GetState(ctx)
	if err != nil {
		t.Fatal(err)
	}
	if got := state.Snapshot.Documents[opened.DocumentID].View.SplitRatio; got != 0.6 {
		t.Fatalf("session ratio after failure = %v", got)
	}
	if err := service.SetDocView(ctx, opened.DocumentID, validDocView(true, true)); err != nil {
		t.Fatalf("cursor-only update retried metadata: %v", err)
	}
	if len(emitter.Errors()) != 1 {
		t.Fatalf("cursor-only update emitted extra warning: %+v", emitter.Errors())
	}
}

func TestSplitRatioRetriesFailedMetadataWriteWithoutChangingRatio(t *testing.T) {
	ctx := context.Background()
	path := filepath.Join(t.TempDir(), "notes.md")
	if err := os.WriteFile(path, []byte("text\n"), 0o644); err != nil {
		t.Fatal(err)
	}
	repository := &failOnceViewRepository{}
	service := appmodel.NewAppModelServiceForHost(appmodel.AppModelOption{FileMetadataRepository: repository}, appmodel.WithEmitter(&recordingEmitter{}))
	opened := service.OpenPath(ctx, path, 0)
	if opened.DocumentID == "" {
		t.Fatalf("open: %+v", opened)
	}
	view := validDocView(true, true)
	view.SplitRatio = ratio(0.6)
	if err := service.SetDocView(ctx, opened.DocumentID, view); err != nil {
		t.Fatalf("accepted first ratio returned transport failure: %v", err)
	}
	if err := service.SetDocView(ctx, opened.DocumentID, view); err != nil {
		t.Fatalf("retry: %v", err)
	}
	if repository.writes != 2 || repository.saved.SplitRatio != 0.6 {
		t.Fatalf("retry writes=%d saved=%+v", repository.writes, repository.saved)
	}
}

func TestSplitRatioReadFailureUsesDefaultAndSurfacesWarning(t *testing.T) {
	ctx := context.Background()
	path := filepath.Join(t.TempDir(), "notes.md")
	if err := os.WriteFile(path, []byte("text\n"), 0o644); err != nil {
		t.Fatal(err)
	}
	emitter := &recordingEmitter{}
	service := appmodel.NewAppModelServiceForHost(appmodel.AppModelOption{FileMetadataRepository: failingReadViewRepository{}}, appmodel.WithEmitter(emitter))
	opened := service.OpenPath(ctx, path, 0)
	if opened.DocumentID == "" {
		t.Fatalf("open: %+v", opened)
	}
	state, err := service.GetState(ctx)
	if err != nil {
		t.Fatal(err)
	}
	if got := state.Snapshot.Documents[opened.DocumentID].View.SplitRatio; got != 0.5 {
		t.Fatalf("ratio after failed read = %v", got)
	}
	if len(emitter.Errors()) != 1 {
		t.Fatalf("read errors = %+v", emitter.Errors())
	}
}

func TestSplitRatioLegacyAndInvalidStoredValuesDefault(t *testing.T) {
	ctx := context.Background()
	directory := t.TempDir()
	database, err := db.Open(ctx, filepath.Join(directory, "settings.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer func() { _ = database.Close() }()
	repository := appmodel.NewSqliteFileMetadataRepository(database)
	for _, item := range []struct{ name, value string }{
		{"legacy", `{"version":1,"arrangement":"split"}`},
		{"invalid", `{"version":1,"arrangement":"split","splitRatio":0.95}`},
		{"malformed-ratio", `{"version":1,"arrangement":"split","splitRatio":"wide"}`},
	} {
		path := filepath.Join(directory, item.name+".md")
		if err := os.WriteFile(path, []byte("text\n"), 0o644); err != nil {
			t.Fatal(err)
		}
		canonical, err := filepath.EvalSymlinks(path)
		if err != nil {
			t.Fatal(err)
		}
		hash := sha256.Sum256([]byte(canonical))
		key := "document.view." + hex.EncodeToString(hash[:])
		if _, err := database.DB.ExecContext(ctx, `INSERT INTO settings (key,value,type) VALUES (?,?,?)`, key, item.value, "document.view.v1"); err != nil {
			t.Fatal(err)
		}
		view, found, err := repository.ReadView(ctx, canonical)
		if err != nil || !found || view.Arrangement != appmodel.ArrangementSplit || view.SplitRatio != 0.5 {
			t.Fatalf("%s stored view = %+v, found=%v, error=%v", item.name, view, found, err)
		}
		service := appmodel.NewAppModelServiceForHost(appmodel.AppModelOption{FileMetadataRepository: repository}, appmodel.WithEmitter(&recordingEmitter{}))
		opened := service.OpenPath(ctx, path, 0)
		if opened.DocumentID == "" {
			t.Fatalf("%s open: %+v", item.name, opened)
		}
		state, err := service.GetState(ctx)
		if err != nil {
			t.Fatal(err)
		}
		if got := state.Snapshot.Documents[opened.DocumentID].View.SplitRatio; got != 0.5 {
			t.Fatalf("%s opened ratio = %v", item.name, got)
		}
	}
}

func TestSplitRatioRestoresWhileDefaultOpenModeIsViewer(t *testing.T) {
	ctx := context.Background()
	directory := t.TempDir()
	path := filepath.Join(directory, "notes.md")
	if err := os.WriteFile(path, []byte("text\n"), 0o644); err != nil {
		t.Fatal(err)
	}
	database, err := db.Open(ctx, filepath.Join(directory, "settings.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer func() { _ = database.Close() }()
	repository := appmodel.NewSqliteFileMetadataRepository(database)
	canonical, err := filepath.EvalSymlinks(path)
	if err != nil {
		t.Fatal(err)
	}
	if err := repository.WriteView(ctx, canonical, appmodel.FileViewMetadata{Arrangement: appmodel.ArrangementSplit, SplitRatio: 0.7}); err != nil {
		t.Fatal(err)
	}
	service := appmodel.NewAppModelServiceForHost(appmodel.AppModelOption{FileMetadataRepository: repository}, appmodel.WithEmitter(&recordingEmitter{}))
	service.SetDefaultOpenMode(appmodel.OpenModeViewer)
	opened := service.OpenPath(ctx, path, 0)
	if opened.DocumentID == "" {
		t.Fatalf("open: %+v", opened)
	}
	state, err := service.GetState(ctx)
	if err != nil {
		t.Fatal(err)
	}
	view := state.Snapshot.Documents[opened.DocumentID].View
	if view.Arrangement != appmodel.ArrangementSplit || view.SplitRatio != 0.7 {
		t.Fatalf("viewer open view = %+v", view)
	}
}

func TestSplitRatioSaveAsWritesDestinationMetadata(t *testing.T) {
	ctx := context.Background()
	directory := t.TempDir()
	database, err := db.Open(ctx, filepath.Join(directory, "settings.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer func() { _ = database.Close() }()
	repository := appmodel.NewSqliteFileMetadataRepository(database)
	target := filepath.Join(directory, "saved.md")
	service := appmodel.NewAppModelServiceForHost(appmodel.AppModelOption{FileMetadataRepository: repository}, appmodel.WithDialogs(nil, saveDialog{path: target}), appmodel.WithEmitter(&recordingEmitter{}))
	id := newUntitledID(t, service)
	state, err := service.GetState(ctx)
	if err != nil {
		t.Fatal(err)
	}
	view := validDocView(true, true)
	view.SplitRatio = ratio(0.62)
	if err := service.SetDocView(ctx, id, view); err != nil {
		t.Fatal(err)
	}
	if err := service.UpdateBuffer(ctx, id, "saved\n"); err != nil {
		t.Fatal(err)
	}
	state, err = service.GetState(ctx)
	if err != nil {
		t.Fatal(err)
	}
	result := service.Save(ctx, id, state.Snapshot.Documents[id].ContentRevision, "")
	if result.Status != "committed" {
		t.Fatalf("Save = %+v", result)
	}
	canonical, err := filepath.EvalSymlinks(target)
	if err != nil {
		t.Fatal(err)
	}
	stored, found, err := repository.ReadView(ctx, canonical)
	if err != nil || !found || stored.SplitRatio != 0.62 || stored.Arrangement != appmodel.ArrangementSplit {
		t.Fatalf("destination view = %+v, found=%v, error=%v", stored, found, err)
	}
}

func TestSplitRatioSaveAsFromSavedFileWritesNewPath(t *testing.T) {
	ctx := context.Background()
	directory := t.TempDir()
	database, err := db.Open(ctx, filepath.Join(directory, "settings.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer func() { _ = database.Close() }()
	repository := appmodel.NewSqliteFileMetadataRepository(database)
	source := filepath.Join(directory, "source.md")
	target := filepath.Join(directory, "target.md")
	if err := os.WriteFile(source, []byte("source\n"), 0o644); err != nil {
		t.Fatal(err)
	}
	service := appmodel.NewAppModelServiceForHost(appmodel.AppModelOption{FileMetadataRepository: repository}, appmodel.WithDialogs(nil, saveDialog{path: target}), appmodel.WithEmitter(&recordingEmitter{}))
	opened := service.OpenPath(ctx, source, 0)
	if opened.DocumentID == "" {
		t.Fatalf("open: %+v", opened)
	}
	view := validDocView(true, true)
	view.SplitRatio = ratio(0.24)
	if err := service.SetDocView(ctx, opened.DocumentID, view); err != nil {
		t.Fatal(err)
	}
	state, err := service.GetState(ctx)
	if err != nil {
		t.Fatal(err)
	}
	result := service.SaveAs(ctx, opened.DocumentID, state.Snapshot.Documents[opened.DocumentID].ContentRevision, "")
	if result.Status != "committed" {
		t.Fatalf("SaveAs = %+v", result)
	}
	canonical, err := filepath.EvalSymlinks(target)
	if err != nil {
		t.Fatal(err)
	}
	stored, found, err := repository.ReadView(ctx, canonical)
	if err != nil || !found || stored.SplitRatio != 0.24 {
		t.Fatalf("target view = %+v, found=%v, error=%v", stored, found, err)
	}
}

func TestSplitRatioSaveMetadataFailureReportsWarning(t *testing.T) {
	ctx := context.Background()
	path := filepath.Join(t.TempDir(), "notes.md")
	if err := os.WriteFile(path, []byte("old\n"), 0o644); err != nil {
		t.Fatal(err)
	}
	service := appmodel.NewAppModelServiceForHost(appmodel.AppModelOption{FileMetadataRepository: failingViewRepository{}}, appmodel.WithEmitter(&recordingEmitter{}))
	opened := service.OpenPath(ctx, path, 0)
	if opened.DocumentID == "" {
		t.Fatalf("open: %+v", opened)
	}
	if err := service.UpdateBuffer(ctx, opened.DocumentID, "new\n"); err != nil {
		t.Fatal(err)
	}
	state, err := service.GetState(ctx)
	if err != nil {
		t.Fatal(err)
	}
	result := service.Save(ctx, opened.DocumentID, state.Snapshot.Documents[opened.DocumentID].ContentRevision, "")
	if result.Status != "committed" || result.Error == nil {
		t.Fatalf("Save warning = %+v", result)
	}
	if got, err := os.ReadFile(path); err != nil || string(got) != "new\n" {
		t.Fatalf("saved bytes = %q, error=%v", got, err)
	}
}

func ratio(value float64) *float64 { return &value }

type failingViewRepository struct{}

func (failingViewRepository) ReadView(context.Context, string) (appmodel.FileViewMetadata, bool, error) {
	return appmodel.FileViewMetadata{}, false, nil
}
func (failingViewRepository) WriteView(context.Context, string, appmodel.FileViewMetadata) error {
	return errors.New("metadata unavailable")
}

type failOnceViewRepository struct {
	writes int
	saved  appmodel.FileViewMetadata
}

func (repository *failOnceViewRepository) ReadView(context.Context, string) (appmodel.FileViewMetadata, bool, error) {
	return appmodel.FileViewMetadata{}, false, nil
}

func (repository *failOnceViewRepository) WriteView(_ context.Context, _ string, view appmodel.FileViewMetadata) error {
	repository.writes++
	if repository.writes == 1 {
		return errors.New("metadata unavailable")
	}
	repository.saved = view
	return nil
}

type failingReadViewRepository struct{}

func (failingReadViewRepository) ReadView(context.Context, string) (appmodel.FileViewMetadata, bool, error) {
	return appmodel.FileViewMetadata{}, false, errors.New("metadata unavailable")
}

func (failingReadViewRepository) WriteView(context.Context, string, appmodel.FileViewMetadata) error {
	return nil
}
