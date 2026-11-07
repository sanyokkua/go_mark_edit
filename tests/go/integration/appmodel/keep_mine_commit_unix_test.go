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

func TestKeepMineSaveWhoseReplacementFailsLeavesTheExternalVersionUndecided(t *testing.T) {
	ctx := context.Background()
	service := NewAppModelServiceForHost(WithEmitter(&recordingEmitter{}), AppModelOption{AutosaveTimer: &fakeAutosaveClock{}})
	fixture := authorizeKeepMineFixture(t, service, "mine\n")
	directory := filepath.Dir(fixture.path)
	if err := os.Chmod(directory, 0o555); err != nil {
		t.Fatalf("make directory read-only: %v", err)
	}
	t.Cleanup(func() { _ = os.Chmod(directory, 0o755) })

	refused := service.Save(ctx, fixture.id, fixture.revision, fixture.token)
	if refused.Status == apperr.WriteStatusCommitted {
		t.Fatalf("Save into a read-only directory = %+v, want a refusal", refused)
	}
	if err := os.Chmod(directory, 0o755); err != nil {
		t.Fatalf("restore directory permissions: %v", err)
	}

	assertLaterSaveConflictsAndKeepsExternalFile(t, fixture, fixture.revision)
}

func TestKeepMineSaveRetriedAfterAFailedReplacementStillWritesTheBuffer(t *testing.T) {
	ctx := context.Background()
	service := NewAppModelServiceForHost(WithEmitter(&recordingEmitter{}), AppModelOption{AutosaveTimer: &fakeAutosaveClock{}})
	fixture := authorizeKeepMineFixture(t, service, "mine\n")
	directory := filepath.Dir(fixture.path)
	if err := os.Chmod(directory, 0o555); err != nil {
		t.Fatalf("make directory read-only: %v", err)
	}
	t.Cleanup(func() { _ = os.Chmod(directory, 0o755) })
	if refused := service.Save(ctx, fixture.id, fixture.revision, fixture.token); refused.Status == apperr.WriteStatusCommitted {
		t.Fatalf("Save into a read-only directory = %+v, want a refusal", refused)
	}
	if err := os.Chmod(directory, 0o755); err != nil {
		t.Fatalf("restore directory permissions: %v", err)
	}

	saved := service.Save(ctx, fixture.id, fixture.revision, fixture.token)
	if saved.Status != apperr.WriteStatusCommitted {
		t.Fatalf("retried Keep mine Save = %+v, want committed", saved)
	}
	disk, err := os.ReadFile(fixture.path)
	if err != nil || string(disk) != "mine\n" {
		t.Fatalf("disk = %q, %v; want the buffer", disk, err)
	}
}
