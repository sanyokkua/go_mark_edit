package appmodel

import (
	"context"
	"errors"
	"io/fs"
	"os"
	"path/filepath"
	"testing"

	"github.com/sanyokkua/go_mark_edit/internal/apperr"
	"github.com/sanyokkua/go_mark_edit/internal/file"
)

func TestCopyPathResolvesCanonicalPathAndClassifiesClipboardFailure(t *testing.T) {
	root := t.TempDir()
	path := filepath.Join(root, "notes.md")
	if err := os.WriteFile(path, []byte("notes\n"), 0o644); err != nil {
		t.Fatalf("write fixture: %v", err)
	}
	service := NewEmptyAppModelService(&recordingEmitter{})
	state, _ := service.GetState(context.Background())
	opened := service.OpenPath(context.Background(), path, state.Snapshot.TabSetRevision)
	if opened.Error != nil {
		t.Fatalf("OpenPath = %+v", opened)
	}
	want := errors.New("clipboard failed")
	var copied string
	service.SetClipboardWriter(file.ClipboardWriterFunc(func(value string) error {
		copied = value
		return want
	}))
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
	service := NewEmptyAppModelService(&recordingEmitter{})
	state, _ := service.GetState(context.Background())
	opened := service.OpenPath(context.Background(), path, state.Snapshot.TabSetRevision)
	if opened.Error != nil {
		t.Fatalf("OpenPath = %+v", opened)
	}
	if err := os.Remove(path); err != nil {
		t.Fatalf("remove fixture: %v", err)
	}
	var copied string
	service.SetClipboardWriter(file.ClipboardWriterFunc(func(value string) error { copied = value; return nil }))
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
	service := NewEmptyAppModelService(&recordingEmitter{})
	state, _ := service.GetState(context.Background())
	opened := service.OpenPath(context.Background(), path, state.Snapshot.TabSetRevision)
	if opened.Error != nil {
		t.Fatalf("OpenPath = %+v", opened)
	}
	calls := 0
	service.SetRevealPort(file.RevealPortFunc(func(string) error { calls++; return fs.ErrNotExist }))
	if err := os.Remove(path); err != nil {
		t.Fatalf("remove known-missing fixture: %v", err)
	}
	knownMissing := service.RevealInFileManager(context.Background(), opened.DocumentID)
	if knownMissing.Status != apperr.PathCommandUnavailable || knownMissing.Error != nil || calls != 0 {
		t.Fatalf("known-missing reveal = %+v, calls=%d", knownMissing, calls)
	}

	if err := os.WriteFile(path, []byte("reveal again\n"), 0o644); err != nil {
		t.Fatalf("restore fixture: %v", err)
	}
	// A fresh document exercises the invocation-time disappearance race.
	service = NewEmptyAppModelService(&recordingEmitter{})
	state, _ = service.GetState(context.Background())
	opened = service.OpenPath(context.Background(), path, state.Snapshot.TabSetRevision)
	service.SetRevealPort(file.RevealPortFunc(func(string) error { return fs.ErrNotExist }))
	race := service.RevealInFileManager(context.Background(), opened.DocumentID)
	if race.Error == nil || race.Error.Category != apperr.ClassifiedNotFound || race.Error.Remediation != apperr.RemediationSaveToRecreate {
		t.Fatalf("disappearance race reveal = %+v", race)
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
