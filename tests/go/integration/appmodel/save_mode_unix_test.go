//go:build darwin || dragonfly || freebsd || linux || netbsd || openbsd || solaris

package appmodel_test

import (
	"context"
	"os"
	"path/filepath"
	"testing"

	"github.com/sanyokkua/go_mark_edit/internal/apperr"
	. "github.com/sanyokkua/go_mark_edit/internal/appmodel"
)

func TestSaveAsAndRecreateUseNewFileModeAndRemainUnchanged(t *testing.T) {
	ctx := context.Background()
	dir := t.TempDir()
	reference := filepath.Join(dir, "reference")
	if err := os.WriteFile(reference, nil, 0644); err != nil {
		t.Fatal(err)
	}
	info, err := os.Stat(reference)
	if err != nil {
		t.Fatal(err)
	}
	want := info.Mode().Perm()
	target := filepath.Join(dir, "saved.md")
	service := NewAppModelServiceForHost(WithEmitter(&recordingEmitter{}), AppModelOption{AutosaveTimer: &fakeAutosaveClock{}}, WithDialogs(nil, saveDialog{path: target}))
	id := newUntitledID(t, service)
	if err := service.UpdateBuffer(ctx, id, "content\n"); err != nil {
		t.Fatal(err)
	}
	state, err := service.GetState(ctx)
	if err != nil {
		t.Fatal(err)
	}
	if result := service.Save(ctx, id, state.Snapshot.Documents[id].ContentRevision, ""); result.Status != apperr.WriteStatusCommitted {
		t.Fatalf("Save As = %+v", result)
	}
	assertMode := func() {
		t.Helper()
		info, err := os.Stat(target)
		if err != nil {
			t.Fatal(err)
		}
		if info.Mode().Perm() != want {
			t.Fatalf("mode = %04o, want %04o", info.Mode().Perm(), want)
		}
		if result := service.ForegroundCheck(ctx, id); result.Status != apperr.ConflictStatusUnchanged {
			t.Fatalf("foreground check = %+v", result)
		}
	}
	assertMode()
	if err := os.Remove(target); err != nil {
		t.Fatal(err)
	}
	if result := service.ForegroundCheck(ctx, id); result.Status != apperr.ConflictStatusDetached {
		t.Fatalf("deleted check = %+v", result)
	}
	state, err = service.GetState(ctx)
	if err != nil {
		t.Fatal(err)
	}
	if result := service.Save(ctx, id, state.Snapshot.Documents[id].ContentRevision, ""); result.Status != apperr.WriteStatusCommitted {
		t.Fatalf("recreate = %+v", result)
	}
	assertMode()
}
