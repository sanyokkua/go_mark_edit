package application_test

import (
	"context"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"testing"

	"github.com/sanyokkua/go_mark_edit/internal/apperr"
	"github.com/sanyokkua/go_mark_edit/internal/application"
	"github.com/sanyokkua/go_mark_edit/internal/appmodel"
	"github.com/sanyokkua/go_mark_edit/internal/bridge"
)

// lockedLauncher records launches from concurrent callers.
type lockedLauncher struct {
	mu    sync.Mutex
	paths []string
	err   error
}

func (launcher *lockedLauncher) Launch(targetPath string) error {
	launcher.mu.Lock()
	defer launcher.mu.Unlock()
	launcher.paths = append(launcher.paths, targetPath)
	return launcher.err
}

func (launcher *lockedLauncher) launched() []string {
	launcher.mu.Lock()
	defer launcher.mu.Unlock()
	return append([]string(nil), launcher.paths...)
}

type emittedEvent struct {
	name    string
	payload any
}

type recordingEmitter struct {
	mu     sync.Mutex
	events []emittedEvent
}

func (emitter *recordingEmitter) emit(_ context.Context, name string, data ...any) {
	var payload any
	if len(data) > 0 {
		payload = data[0]
	}
	emitter.mu.Lock()
	defer emitter.mu.Unlock()
	emitter.events = append(emitter.events, emittedEvent{name: name, payload: payload})
}

func (emitter *recordingEmitter) snapshot() []emittedEvent {
	emitter.mu.Lock()
	defer emitter.mu.Unlock()
	return append([]emittedEvent(nil), emitter.events...)
}

func newLaunchHolder(t *testing.T, options application.ApplicationContextOptions) *application.ApplicationContextHolder {
	t.Helper()
	holder := application.NewApplicationContextHolderWithOptions(nil, nil, options)
	t.Cleanup(func() { _ = holder.Close() })
	return holder
}

func TestStartupFlagsAreSkippedAndTheFirstPathIsAccepted(t *testing.T) {
	launcher := &lockedLauncher{}
	first := filepath.Join(t.TempDir(), "a.md")
	holder := newLaunchHolder(t, application.ApplicationContextOptions{
		StartupArgs:       []string{"-psn_0_1", "", first},
		NewWindowLauncher: launcher,
	})

	target := holder.TakeLaunchTarget(context.Background())

	if target.Path != first || target.Kind != "file" || target.Error != nil {
		t.Fatalf("target = %+v, want file %q", target, first)
	}
}

func TestOnlyTheFirstPathAmongSeveralIsAcceptedAndNothingIsLaunched(t *testing.T) {
	launcher := &lockedLauncher{}
	directory := t.TempDir()
	first, second := filepath.Join(directory, "a.md"), filepath.Join(directory, "b.md")
	holder := newLaunchHolder(t, application.ApplicationContextOptions{
		StartupArgs:       []string{first, second},
		NewWindowLauncher: launcher,
	})

	target := holder.TakeLaunchTarget(context.Background())

	if target.Path != first {
		t.Fatalf("target path = %q, want %q", target.Path, first)
	}
	if got := launcher.launched(); len(got) != 0 {
		t.Fatalf("launched = %#v, want nothing for the extra startup path", got)
	}
}

func TestARelativeStartupPathBecomesAbsolute(t *testing.T) {
	workingDirectory, err := os.Getwd()
	if err != nil {
		t.Fatalf("Getwd: %v", err)
	}
	holder := newLaunchHolder(t, application.ApplicationContextOptions{
		StartupArgs: []string{filepath.Join("notes", "a.md")},
	})

	target := holder.TakeLaunchTarget(context.Background())

	if want := filepath.Join(workingDirectory, "notes", "a.md"); target.Path != want {
		t.Fatalf("target path = %q, want %q", target.Path, want)
	}
}

func TestTargetKindIsFolderForADirectoryAndFileForAMissingPath(t *testing.T) {
	directory := t.TempDir()
	cases := map[string]struct {
		path string
		kind string
	}{
		"directory":    {path: directory, kind: "folder"},
		"missing path": {path: filepath.Join(directory, "missing.md"), kind: "file"},
	}
	for name, tc := range cases {
		t.Run(name, func(t *testing.T) {
			holder := newLaunchHolder(t, application.ApplicationContextOptions{StartupArgs: []string{tc.path}})

			target := holder.TakeLaunchTarget(context.Background())

			if target.Path != tc.path || target.Kind != tc.kind {
				t.Fatalf("target = %+v, want %s %q", target, tc.kind, tc.path)
			}
		})
	}
}

func TestTakeLaunchTargetReturnsTheTargetOnceThenNothing(t *testing.T) {
	path := filepath.Join(t.TempDir(), "a.md")
	holder := newLaunchHolder(t, application.ApplicationContextOptions{StartupArgs: []string{path}})

	first := holder.TakeLaunchTarget(context.Background())
	second := holder.TakeLaunchTarget(context.Background())

	if first.Path != path {
		t.Fatalf("first take = %+v, want the target", first)
	}
	if second.Path != "" || second.Kind != "" || second.Error != nil {
		t.Fatalf("second take = %+v, want an empty result", second)
	}
}

func TestAPathSentBeforeStartupIsAcceptedAndTakenAfterFrontendReady(t *testing.T) {
	launcher := &lockedLauncher{}
	holder := newLaunchHolder(t, application.ApplicationContextOptions{
		NewWindowLauncher: launcher,
		AppModelOptions:   []appmodel.AppModelOption{appmodel.WithEmitter(&startupOrderRecorder{})},
	})

	holder.AcceptOpenRequest("/docs/cold.md")
	holder.FrontendReady(context.Background())
	target := holder.TakeLaunchTarget(context.Background())

	if target.Path != "/docs/cold.md" || target.Kind != "file" {
		t.Fatalf("target = %+v, want the cold-start file", target)
	}
	if got := launcher.launched(); len(got) != 0 {
		t.Fatalf("launched = %#v, want nothing for the accepted path", got)
	}
}

func TestASecondPathBeforeFrontendReadyGoesToANewWindow(t *testing.T) {
	launcher := &lockedLauncher{}
	holder := newLaunchHolder(t, application.ApplicationContextOptions{NewWindowLauncher: launcher})

	holder.AcceptOpenRequest("/docs/first.md")
	holder.AcceptOpenRequest("/docs/second.md")

	if got := launcher.launched(); len(got) != 1 || got[0] != "/docs/second.md" {
		t.Fatalf("launched = %#v, want only the second path", got)
	}
	if target := holder.TakeLaunchTarget(context.Background()); target.Path != "/docs/first.md" {
		t.Fatalf("target = %+v, want the first path", target)
	}
}

func TestEveryPathAfterFrontendReadyGoesToANewWindowEvenForAWindowWithoutDocuments(t *testing.T) {
	launcher := &lockedLauncher{}
	holder := newLaunchHolder(t, application.ApplicationContextOptions{NewWindowLauncher: launcher})
	state, err := holder.AppModelService.GetState(context.Background())
	if err != nil {
		t.Fatalf("GetState: %v", err)
	}
	if len(state.Snapshot.OrderedDocumentIDs) != 0 {
		t.Fatalf("window holds %d documents, want none before a launch target is opened", len(state.Snapshot.OrderedDocumentIDs))
	}

	holder.FrontendReady(context.Background())
	holder.AcceptOpenRequest("/docs/a.md")
	holder.AcceptOpenRequest("/docs/folder")

	if got := launcher.launched(); len(got) != 2 || got[0] != "/docs/a.md" || got[1] != "/docs/folder" {
		t.Fatalf("launched = %#v, want both paths in order", got)
	}
	if target := holder.TakeLaunchTarget(context.Background()); target.Path != "" {
		t.Fatalf("target = %+v, want nothing accepted after readiness", target)
	}
}

func TestConcurrentOpenRequestsAcceptExactlyOnePath(t *testing.T) {
	const requests = 32
	launcher := &lockedLauncher{}
	holder := newLaunchHolder(t, application.ApplicationContextOptions{NewWindowLauncher: launcher})

	var group sync.WaitGroup
	for index := 0; index < requests; index++ {
		group.Add(1)
		go func() {
			defer group.Done()
			holder.AcceptOpenRequest(filepath.Join("/docs", fmt.Sprintf("file-%d.md", index)))
		}()
	}
	group.Wait()

	if got := launcher.launched(); len(got) != requests-1 {
		t.Fatalf("launched %d paths, want %d with exactly one accepted", len(got), requests-1)
	}
	if target := holder.TakeLaunchTarget(context.Background()); target.Path == "" {
		t.Fatal("no path was accepted, want exactly one")
	}
}

func TestLaunchFailureAfterSetContextEmitsTheNewWindowError(t *testing.T) {
	emitter := &recordingEmitter{}
	launcher := &lockedLauncher{err: errors.New("private process details")}
	holder := newLaunchHolder(t, application.ApplicationContextOptions{
		NewWindowLauncher: launcher,
		EmitEvent:         emitter.emit,
	})
	holder.SetContext(context.Background())
	holder.FrontendReady(context.Background())

	holder.AcceptOpenRequest("/docs/a.md")

	events := emitter.snapshot()
	if len(events) != 1 || events[0].name != bridge.EventStateError {
		t.Fatalf("events = %+v, want one %s event", events, bridge.EventStateError)
	}
	wire, ok := events[0].payload.(apperr.WireError)
	if !ok {
		t.Fatalf("payload = %#v, want a WireError", events[0].payload)
	}
	if wire.Message != "A new window could not be opened." || wire.Category != apperr.ClassifiedSystemCommandFailure || wire.Remediation != apperr.RemediationRetry {
		t.Fatalf("wire error = %+v, want the classified new-window failure offering Retry", wire)
	}
	if strings.Contains(wire.Message, "private process details") {
		t.Fatalf("wire message %q leaks the launcher cause", wire.Message)
	}
}

func TestLaunchFailureBeforeSetContextOnlyLogs(t *testing.T) {
	emitter := &recordingEmitter{}
	launcher := &lockedLauncher{err: errors.New("cannot start")}
	holder := newLaunchHolder(t, application.ApplicationContextOptions{
		NewWindowLauncher: launcher,
		EmitEvent:         emitter.emit,
	})
	holder.FrontendReady(context.Background())

	holder.AcceptOpenRequest("/docs/a.md")

	if events := emitter.snapshot(); len(events) != 0 {
		t.Fatalf("events = %+v, want none before the lifecycle context exists", events)
	}
}

func TestRetryAfterAnInitFailureLeavesTheAcceptedTargetTakeable(t *testing.T) {
	ctx := context.Background()
	tempDir := t.TempDir()
	fileUtils := &failOnceStartupFileUtils{
		startupFileUtils: startupFileUtils{databasePath: filepath.Join(tempDir, "settings.db")},
		initialError:     errors.New("temporary initialization failure"),
	}
	folderPath := filepath.Join(tempDir, "workspace")
	if err := os.Mkdir(folderPath, 0o700); err != nil {
		t.Fatalf("create folder: %v", err)
	}
	holder := application.NewApplicationContextHolderWithOptions(fileUtils, nil, application.ApplicationContextOptions{
		StartupArgs:     []string{folderPath},
		AppModelOptions: []appmodel.AppModelOption{appmodel.WithEmitter(&startupOrderRecorder{})},
	})
	t.Cleanup(func() { _ = holder.Close() })

	if err := holder.Init(ctx); err == nil {
		t.Fatal("initialization succeeded despite the configured first-attempt failure")
	}
	if err := holder.RetryStartup(ctx); err != nil {
		t.Fatalf("retry startup: %v", err)
	}
	holder.FrontendReady(ctx)
	target := holder.TakeLaunchTarget(ctx)

	if target.Path != folderPath || target.Kind != "folder" {
		t.Fatalf("target = %+v, want the folder accepted before the failure", target)
	}
	state, err := holder.AppModelService.GetState(ctx)
	if err != nil {
		t.Fatalf("GetState: %v", err)
	}
	if state.Snapshot.Workspace != nil {
		t.Fatalf("workspace = %+v, want retry to open nothing", state.Snapshot.Workspace)
	}
}
