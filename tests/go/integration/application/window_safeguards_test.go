package application_test

import (
	"context"
	"fmt"
	"os"
	"path/filepath"
	"testing"

	"github.com/sanyokkua/go_mark_edit/internal/apperr"
	"github.com/sanyokkua/go_mark_edit/internal/application"
	"github.com/sanyokkua/go_mark_edit/internal/bridge"
)

// A window that took a path from argv must never spawn another window for that
// same path when the operating system reports it again as a file-open event.
// macOS does exactly that for a path in argv, which made every spawned window
// spawn the next one without end.
func TestAWindowNeverRespawnsForItsOwnStartupPath(t *testing.T) {
	docs := t.TempDir()
	for _, path := range []string{filepath.Join(docs, "a.md"), filepath.Join(docs, "missing.md"), filepath.Join(docs, "folder")} {
		launcher := &lockedLauncher{}
		holder := newLaunchHolder(t, application.ApplicationContextOptions{
			NewWindowLauncher: launcher,
			StartupArgs:       []string{path},
		})

		holder.AcceptOpenRequest(path)
		holder.FrontendReady(context.Background())
		holder.AcceptOpenRequest(path)

		if got := launcher.launched(); len(got) != 0 {
			t.Fatalf("path %s: launched = %#v, want no new window for the window's own path", path, got)
		}
	}
}

func TestAPathOpenInAnotherLiveWindowIsNotOpenedAgain(t *testing.T) {
	dir := t.TempDir()
	other := application.NewWindowRegistry(dir, os.Getppid())
	if err := other.Register("/docs/a.md"); err != nil {
		t.Fatalf("Register: %v", err)
	}
	launcher := &lockedLauncher{}
	holder := newLaunchHolder(t, application.ApplicationContextOptions{
		NewWindowLauncher: launcher,
		WindowRegistry:    registryFor(dir),
	})
	holder.FrontendReady(context.Background())

	holder.AcceptOpenRequest("/docs/a.md")
	holder.AcceptOpenRequest("/docs/b.md")

	if got := launcher.launched(); len(got) != 1 || got[0] != "/docs/b.md" {
		t.Fatalf("launched = %#v, want only the path that is not open yet", got)
	}
}

func TestAnEntryOfAProcessThatIsGoneDoesNotBlockOrCount(t *testing.T) {
	dir := t.TempDir()
	stale := application.NewWindowRegistry(dir, 2147480000)
	if err := stale.Register("/docs/a.md"); err != nil {
		t.Fatalf("Register: %v", err)
	}
	if stale.IsOpen("/docs/a.md") || stale.Count() != 0 {
		t.Fatal("a dead process still counts as an open window")
	}
	launcher := &lockedLauncher{}
	holder := newLaunchHolder(t, application.ApplicationContextOptions{NewWindowLauncher: launcher, WindowRegistry: application.NewWindowRegistry(dir, os.Getpid())})
	holder.FrontendReady(context.Background())

	holder.AcceptOpenRequest("/docs/a.md")

	if got := launcher.launched(); len(got) != 1 {
		t.Fatalf("launched = %#v, want the stale entry ignored", got)
	}
}

func TestTheSamePathRequestedTwiceInARowOpensOneWindow(t *testing.T) {
	launcher := &lockedLauncher{}
	holder := newLaunchHolder(t, application.ApplicationContextOptions{NewWindowLauncher: launcher})
	holder.FrontendReady(context.Background())

	holder.AcceptOpenRequest("/docs/a.md")
	holder.AcceptOpenRequest("/docs/a.md")

	if got := launcher.launched(); len(got) != 1 {
		t.Fatalf("launched = %#v, want exactly one window", got)
	}
}

func registryFor(dir string) *application.WindowRegistry {
	return application.NewWindowRegistry(dir, os.Getpid())
}

// fillRegistry writes the entries of windows that belong to this live process,
// in the registry's on-disk format, one file per window.
func fillRegistry(t *testing.T, dir string, windows int) {
	t.Helper()
	for index := 0; index < windows; index++ {
		entry := fmt.Sprintf(`{"pid":%d,"target":"/docs/open-%d.md"}`, os.Getpid(), index)
		if err := os.WriteFile(filepath.Join(dir, fmt.Sprintf("window-%d.json", index)), []byte(entry), 0o600); err != nil {
			t.Fatalf("write entry: %v", err)
		}
	}
}

func TestNoWindowIsOpenedBeyondTheLimit(t *testing.T) {
	dir := t.TempDir()
	fillRegistry(t, dir, application.MaxWindows)
	emitter := &recordingEmitter{}
	launcher := &lockedLauncher{}
	holder := newLaunchHolder(t, application.ApplicationContextOptions{
		NewWindowLauncher: launcher,
		WindowRegistry:    registryFor(dir),
		EmitEvent:         emitter.emit,
	})
	holder.SetContext(context.Background())
	holder.FrontendReady(context.Background())

	holder.AcceptOpenRequest("/docs/new.md")

	if got := launcher.launched(); len(got) != 0 {
		t.Fatalf("launched = %#v, want none at the limit", got)
	}
	events := emitter.snapshot()
	if len(events) != 1 || events[0].name != bridge.EventStateError {
		t.Fatalf("events = %+v, want one %s event", events, bridge.EventStateError)
	}
	wire, ok := events[0].payload.(apperr.WireError)
	if !ok || wire.Message != "Too many GoMarkEdit windows are open." || wire.Remediation != apperr.RemediationNone {
		t.Fatalf("payload = %#v, want the window-limit message without Retry", events[0].payload)
	}
}

func TestAWindowIsOpenedJustBelowTheLimit(t *testing.T) {
	dir := t.TempDir()
	fillRegistry(t, dir, application.MaxWindows-2)
	launcher := &lockedLauncher{}
	holder := newLaunchHolder(t, application.ApplicationContextOptions{NewWindowLauncher: launcher, WindowRegistry: registryFor(dir)})
	holder.FrontendReady(context.Background())

	holder.AcceptOpenRequest("/docs/new.md")

	if got := launcher.launched(); len(got) != 1 {
		t.Fatalf("launched = %#v, want a window below the limit", got)
	}
}

func TestClosingTheHolderRemovesItsWindowEntry(t *testing.T) {
	dir := t.TempDir()
	target := filepath.Join(t.TempDir(), "a.md")
	holder := application.NewApplicationContextHolderWithOptions(nil, nil, application.ApplicationContextOptions{
		WindowRegistry: registryFor(dir),
		StartupArgs:    []string{target},
	})
	observer := application.NewWindowRegistry(dir, os.Getppid())
	if observer.Count() != 1 || !observer.IsOpen(target) {
		t.Fatalf("count=%d open=%v, want the starting window registered with its target", observer.Count(), observer.IsOpen(target))
	}
	if err := holder.Close(); err != nil {
		t.Fatalf("Close: %v", err)
	}
	if observer.Count() != 0 {
		entries, _ := filepath.Glob(filepath.Join(dir, "*"))
		t.Fatalf("count = %d, entries %v, want the entry removed on close", observer.Count(), entries)
	}
}
