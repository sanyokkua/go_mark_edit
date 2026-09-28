package appmodel_test

import (
	"context"
	"errors"
	. "github.com/sanyokkua/go_mark_edit/internal/appmodel"
	"io/fs"
	"os"
	"path/filepath"
	"slices"
	"testing"

	"github.com/sanyokkua/go_mark_edit/internal/apperr"
)

func TestWorkspacePathCommandsAcceptTreeNodesWithoutOpenDocuments(t *testing.T) {
	ctx := context.Background()
	root := t.TempDir()
	folder := filepath.Join(root, "folder")
	unreadable := filepath.Join(root, "unreadable")
	filePath := filepath.Join(folder, "note.md")
	for _, path := range []string{folder, unreadable} {
		if err := os.Mkdir(path, 0755); err != nil {
			t.Fatal(err)
		}
	}
	if err := os.WriteFile(filePath, []byte("note"), 0644); err != nil {
		t.Fatal(err)
	}
	if err := os.Chmod(unreadable, 0); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = os.Chmod(unreadable, 0755) })
	var copied, revealed string
	service := NewAppModelServiceForHost(WithEmitter(&recordingEmitter{}), WithClipboardWriter(clipboardWriterFunc(func(path string) error { copied = path; return nil })), WithRevealPort(revealPortFunc(func(path string) error { revealed = path; return nil })), AppModelOption{LayoutRepository: &workspaceLayoutFixture{values: []bool{false}}})
	if got := service.OpenWorkspace(ctx, root); got.Error != nil {
		t.Fatalf("open: %+v", got)
	}
	for _, path := range []string{root, folder, unreadable, filePath} {
		if got := service.CopyWorkspacePath(ctx, path); got.Status != apperr.PathCommandCopied || copied != path {
			t.Errorf("copy %q: %+v, wrote %q", path, got, copied)
		}
		if got := service.RevealWorkspacePath(ctx, path); got.Status != apperr.PathCommandRevealed || revealed != path {
			t.Errorf("reveal %q: %+v, revealed %q", path, got, revealed)
		}
	}
}

func TestCopyPathResolvesCanonicalPathAndClassifiesClipboardFailure(t *testing.T) {
	root := t.TempDir()
	path := filepath.Join(root, "notes.md")
	if err := os.WriteFile(path, []byte("notes\n"), 0o644); err != nil {
		t.Fatalf("write fixture: %v", err)
	}
	want := errors.New("clipboard failed")
	var copied string
	clipboard := clipboardWriterFunc(func(value string) error {
		copied = value
		return want
	})
	service := NewAppModelServiceForHost(WithEmitter(&recordingEmitter{}), WithClipboardWriter(clipboard))
	state, _ := service.GetState(context.Background())
	opened := service.OpenPath(context.Background(), path, state.Snapshot.TabSetRevision)
	if opened.Error != nil {
		t.Fatalf("OpenPath = %+v", opened)
	}
	result := service.CopyPath(context.Background(), opened.DocumentID)
	if result.Error == nil || result.Error.Category != apperr.ClassifiedSystemCommandFailure || result.Error.DocumentID != opened.DocumentID {
		t.Fatalf("CopyPath failure = %+v", result)
	}
	if copied != openedPath(t, opened.DocumentID, service) {
		t.Fatalf("copied path = %q, want canonical path", copied)
	}
}

func TestCopyPathSucceedsForDetachedDocument(t *testing.T) {
	root := t.TempDir()
	path := filepath.Join(root, "detached.md")
	if err := os.WriteFile(path, []byte("detached\n"), 0o644); err != nil {
		t.Fatalf("write fixture: %v", err)
	}
	var copied string
	clipboard := clipboardWriterFunc(func(value string) error { copied = value; return nil })
	service := NewAppModelServiceForHost(WithEmitter(&recordingEmitter{}), WithClipboardWriter(clipboard))
	state, _ := service.GetState(context.Background())
	opened := service.OpenPath(context.Background(), path, state.Snapshot.TabSetRevision)
	if opened.Error != nil {
		t.Fatalf("OpenPath = %+v", opened)
	}
	if err := os.Remove(path); err != nil {
		t.Fatalf("remove fixture: %v", err)
	}
	result := service.CopyPath(context.Background(), opened.DocumentID)
	if result.Error != nil || result.Status != apperr.PathCommandCopied {
		t.Fatalf("CopyPath detached = %+v", result)
	}
	if copied == "" || copied == path && filepath.IsAbs(copied) == false {
		t.Fatalf("detached copied path = %q", copied)
	}
}

func TestRevealInFileManagerRevalidatesExistenceAndClassifiesFailure(t *testing.T) {
	root := t.TempDir()
	path := filepath.Join(root, "reveal.md")
	if err := os.WriteFile(path, []byte("reveal\n"), 0o644); err != nil {
		t.Fatalf("write fixture: %v", err)
	}
	calls := 0
	reveal := revealPortFunc(func(string) error { calls++; return fs.ErrNotExist })
	service := NewAppModelServiceForHost(WithEmitter(&recordingEmitter{}), WithRevealPort(reveal))
	state, _ := service.GetState(context.Background())
	opened := service.OpenPath(context.Background(), path, state.Snapshot.TabSetRevision)
	if opened.Error != nil {
		t.Fatalf("OpenPath = %+v", opened)
	}
	if err := os.Remove(path); err != nil {
		t.Fatalf("remove known-missing fixture: %v", err)
	}
	// The first reveal after the file vanishes is the invocation-time race: it must
	// report, and it detaches the document as a side effect. (This assertion used to
	// require Status=unavailable with no error, which is the behaviour removed —
	// the test was pinning the defect, so it is corrected rather than dropped. The
	// race itself is proved in full by
	// TestRevealDisappearanceAtInvocationReportsNotFoundOfferingBothActions.)
	vanishedAtStat := service.RevealInFileManager(context.Background(), opened.DocumentID)
	if vanishedAtStat.Status != apperr.PathCommandRefused || vanishedAtStat.Error == nil || calls != 0 {
		t.Fatalf("invocation-time race reveal = %+v, calls=%d", vanishedAtStat, calls)
	}
	// Only now is the document genuinely known-detached, and a repeat reveal is the
	// silent no-op that keeps one failure from being reported twice.
	knownMissing := service.RevealInFileManager(context.Background(), opened.DocumentID)
	if knownMissing.Status != apperr.PathCommandUnavailable || knownMissing.Error != nil || calls != 0 {
		t.Fatalf("known-missing reveal = %+v, calls=%d", knownMissing, calls)
	}

	if err := os.WriteFile(path, []byte("reveal again\n"), 0o644); err != nil {
		t.Fatalf("restore fixture: %v", err)
	}
	// A fresh document exercises the invocation-time disappearance race.
	service = NewAppModelServiceForHost(WithEmitter(&recordingEmitter{}), WithRevealPort(revealPortFunc(func(string) error { return fs.ErrNotExist })))
	state, _ = service.GetState(context.Background())
	opened = service.OpenPath(context.Background(), path, state.Snapshot.TabSetRevision)
	race := service.RevealInFileManager(context.Background(), opened.DocumentID)
	wantPair := []apperr.ClassifiedRemediation{apperr.RemediationSaveToRecreate, apperr.RemediationCopyPath}
	if race.Error == nil || race.Error.Category != apperr.ClassifiedNotFound || !slices.Equal(race.Error.Remediations, wantPair) {
		t.Fatalf("host-reported disappearance reveal = %+v", race)
	}
	after, _ := service.GetState(context.Background())
	if !after.Snapshot.Documents[opened.DocumentID].Detached {
		t.Fatal("disappearance race did not mark document detached")
	}
}

func openedPath(t *testing.T, documentID string, service *AppModelService) string {
	t.Helper()
	state, err := service.GetState(context.Background())
	if err != nil {
		t.Fatalf("GetState = %v", err)
	}
	return state.Snapshot.Documents[documentID].Path
}

// classified not-found offering both Save to recreate and Copy path, and the
// document is marked detached. Does not prove the deduplication itself, which the
// notification layer owns via DedupKey.
func TestRevealDisappearanceAtInvocationReportsNotFoundOfferingBothActions(t *testing.T) {
	root := t.TempDir()
	path := filepath.Join(root, "vanishes.md")
	if err := os.WriteFile(path, []byte("here\n"), 0o644); err != nil {
		t.Fatalf("write fixture: %v", err)
	}
	reveals := 0
	reveal := revealPortFunc(func(string) error { reveals++; return nil })
	service := NewAppModelServiceForHost(WithEmitter(&recordingEmitter{}), WithRevealPort(reveal))
	state, _ := service.GetState(context.Background())
	opened := service.OpenPath(context.Background(), path, state.Snapshot.TabSetRevision)
	if opened.Error != nil {
		t.Fatalf("OpenPath = %+v", opened)
	}
	// The file goes away after the document is open and before Reveal is invoked.
	if err := os.Remove(path); err != nil {
		t.Fatalf("remove fixture: %v", err)
	}
	vanished := service.RevealInFileManager(context.Background(), opened.DocumentID)

	if vanished.Status != apperr.PathCommandRefused {
		t.Fatalf("status = %q, want %q — the race was swallowed", vanished.Status, apperr.PathCommandRefused)
	}
	if vanished.Error == nil {
		t.Fatal("no classified error: requires the race to be reported, not collapsed into the known-missing case")
	}
	if vanished.Error.Category != apperr.ClassifiedNotFound {
		t.Errorf("category = %q, want %q", vanished.Error.Category, apperr.ClassifiedNotFound)
	}
	want := []apperr.ClassifiedRemediation{apperr.RemediationSaveToRecreate, apperr.RemediationCopyPath}
	if !slices.Equal(vanished.Error.Remediations, want) {
		t.Errorf("remediations = %v, want %v", vanished.Error.Remediations, want)
	}
	if reveals != 0 {
		t.Errorf("host reveal invoked %d times; the missing path must be classified before the port is touched", reveals)
	}
	after, _ := service.GetState(context.Background())
	if !after.Snapshot.Documents[opened.DocumentID].Detached {
		t.Error("the document was not marked detached")
	}
}
