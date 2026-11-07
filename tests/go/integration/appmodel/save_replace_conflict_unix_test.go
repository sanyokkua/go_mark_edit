//go:build darwin || dragonfly || freebsd || linux || netbsd || openbsd || solaris

package appmodel_test

import (
	"context"
	"os"
	"testing"

	"github.com/sanyokkua/go_mark_edit/internal/apperr"
	. "github.com/sanyokkua/go_mark_edit/internal/appmodel"
)

func TestSaveThatMeetsAWriteProtectionDuringReplacementReturnsTheReadOnlyComparison(t *testing.T) {
	ctx := context.Background()
	var path string
	service := NewAppModelServiceForHost(WithEmitter(&recordingEmitter{}), AppModelOption{AutosaveTimer: &fakeAutosaveClock{}, WriteExecutor: replaceAfterExternalChange(func() {
		if err := os.Chmod(path, 0o444); err != nil {
			t.Errorf("write-protect: %v", err)
		}
	})})
	path, id := openAutosaveDocument(t, service, "base\n")
	if err := service.UpdateBuffer(ctx, id, "mine\n"); err != nil {
		t.Fatalf("UpdateBuffer: %v", err)
	}

	result := service.Save(ctx, id, contentRevision(t, service, id), "")

	if result.Status != apperr.WriteStatusConflict || result.Conflict == nil || !result.Conflict.ReadOnly {
		t.Fatalf("Save = %+v, want a read-only comparison", result)
	}
	disk, err := os.ReadFile(path)
	if err != nil || string(disk) != "base\n" {
		t.Fatalf("disk = %q, %v; want the write-protected file kept", disk, err)
	}
	info, err := os.Stat(path)
	if err != nil || info.Mode().Perm() != 0o444 {
		t.Fatalf("mode = %v, %v; want 0444 kept", info, err)
	}
}

func TestKeepMineSaveThatMeetsAWriteProtectionDuringReplacementReturnsTheReadOnlyComparison(t *testing.T) {
	ctx := context.Background()
	var path string
	service := NewAppModelServiceForHost(WithEmitter(&recordingEmitter{}), AppModelOption{AutosaveTimer: &fakeAutosaveClock{}, WriteExecutor: replaceAfterExternalChange(func() {
		if err := os.Chmod(path, 0o444); err != nil {
			t.Errorf("write-protect: %v", err)
		}
	})})
	path, id := openAutosaveDocument(t, service, "base\n")
	revision, token := keepMineSave(t, service, path, id)

	result := service.Save(ctx, id, revision, token)

	if result.Status != apperr.WriteStatusConflict || result.Conflict == nil || !result.Conflict.ReadOnly {
		t.Fatalf("Save = %+v, want a read-only comparison", result)
	}
	disk, err := os.ReadFile(path)
	if err != nil || string(disk) != "external\n" {
		t.Fatalf("disk = %q, %v; want the write-protected external version kept", disk, err)
	}
}
