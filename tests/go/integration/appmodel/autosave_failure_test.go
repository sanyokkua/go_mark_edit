package appmodel_test

import (
	"bytes"
	"context"
	"errors"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"testing"

	"github.com/rs/zerolog"
	"github.com/sanyokkua/go_mark_edit/internal/apperr"
	"github.com/sanyokkua/go_mark_edit/internal/appmodel"
	"github.com/sanyokkua/go_mark_edit/internal/file"
)

func TestAutosaveFailureEpisodeShowsNewCategoriesOnceAndClearsOnSuccess(t *testing.T) {
	root := t.TempDir()
	path := filepath.Join(root, "notes.md")
	if err := os.WriteFile(path, []byte("initial\n"), 0o400); err != nil {
		t.Fatalf("write unwritable fixture: %v", err)
	}
	clock := &manualAutosaveFactory{}
	recorder := &autosaveErrorRecorder{}
	attempt := 0
	service := appmodel.NewAppModelServiceForHost(
		appmodel.WithEmitter(recorder),
		appmodel.WithAutosaveTimer(clock),
		appmodel.WithWriteExecutor(func(snapshot appmodel.WriteSnapshot) (file.DiskVersion, error) {
			attempt++
			switch attempt {
			case 1, 2:
				return file.DiskVersion{}, autosaveFailure(snapshot.TargetPath, apperr.ClassifiedPermissionDenied, apperr.RemediationNone)
			case 3:
				return file.DiskVersion{}, autosaveFailure(snapshot.TargetPath, apperr.ClassifiedIOFailure, apperr.RemediationRetry)
			case 4:
				if err := os.Chmod(snapshot.TargetPath, 0o644); err != nil {
					return file.DiskVersion{}, err
				}
				if err := os.WriteFile(snapshot.TargetPath, snapshot.EncodedData, 0o644); err != nil {
					return file.DiskVersion{}, err
				}
				return file.CurrentDiskVersion(snapshot.TargetPath)
			default:
				return file.DiskVersion{}, errors.New("unexpected autosave attempt")
			}
		}),
	)
	opened := service.OpenPath(context.Background(), path, 0)
	if opened.DocumentID == "" {
		t.Fatalf("OpenPath = %+v, want document", opened)
	}
	documentID := opened.DocumentID

	editAndFire := func(content string) {
		t.Helper()
		if err := service.UpdateBuffer(context.Background(), documentID, content); err != nil {
			t.Fatalf("UpdateBuffer(%q): %v", content, err)
		}
		if !clock.fireNext() {
			t.Fatalf("autosave for %q was not scheduled", content)
		}
	}

	editAndFire("first failure\n")
	if got := recorder.snapshot(); len(got) != 1 || got[0].Category != apperr.ClassifiedPermissionDenied || got[0].Remediation != apperr.RemediationNone {
		t.Fatalf("first autosave error = %+v, want one permission-denied message-only error", got)
	}

	editAndFire("repeat failure\n")
	if got := recorder.snapshot(); len(got) != 1 {
		t.Fatalf("repeat autosave errors = %+v, want the same category silent", got)
	}

	editAndFire("new category\n")
	if got := recorder.snapshot(); len(got) != 2 || got[1].Category != apperr.ClassifiedIOFailure || got[1].Remediation != apperr.RemediationRetry {
		t.Fatalf("new-category autosave errors = %+v, want one io-failure Retry error", got)
	}

	editAndFire("successful recovery\n")
	if got := recorder.snapshot(); len(got) != 2 {
		t.Fatalf("successful autosave errors = %+v, want the episode closed without another error", got)
	}

	info, err := os.Stat(path)
	if err != nil {
		t.Fatalf("stat recovered fixture: %v", err)
	}
	if info.Mode().Perm() != 0o644 {
		t.Fatalf("recovered fixture mode = %o, want writable", info.Mode().Perm())
	}
}

func TestAutosaveFailureReporterLogsWhenEventDeliveryIsUnavailableOrFails(t *testing.T) {
	for name, emitter := range map[string]appmodel.StatePatchEmitter{
		"async event is unavailable": autosaveStateOnlyEmitter{},
		"async event fails":          autosaveFailingEmitter{},
	} {
		t.Run(name, func(t *testing.T) {
			root := t.TempDir()
			path := filepath.Join(root, "notes.md")
			if err := os.WriteFile(path, []byte("initial\n"), 0o400); err != nil {
				t.Fatalf("write unwritable fixture: %v", err)
			}
			clock := &manualAutosaveFactory{}
			var logs bytes.Buffer
			service := appmodel.NewAppModelServiceForHost(
				appmodel.WithEmitter(emitter),
				appmodel.WithLogger(zerolog.New(&logs)),
				appmodel.WithAutosaveTimer(clock),
				appmodel.WithWriteExecutor(func(snapshot appmodel.WriteSnapshot) (file.DiskVersion, error) {
					return file.DiskVersion{}, autosaveFailure(snapshot.TargetPath, apperr.ClassifiedPermissionDenied, apperr.RemediationNone)
				}),
			)
			opened := service.OpenPath(context.Background(), path, 0)
			if opened.DocumentID == "" {
				t.Fatalf("OpenPath = %+v, want document", opened)
			}
			if err := service.UpdateBuffer(context.Background(), opened.DocumentID, "failed\n"); err != nil {
				t.Fatalf("UpdateBuffer: %v", err)
			}
			if !clock.fireNext() {
				t.Fatal("autosave was not scheduled")
			}
			if !strings.Contains(logs.String(), "autosave failure could not be surfaced") {
				t.Fatalf("logs = %q, want a stated autosave reporting failure", logs.String())
			}
		})
	}
}

func autosaveFailure(path string, category apperr.ClassifiedErrorCategory, remediation apperr.ClassifiedRemediation) error {
	classified := apperr.NewClassifiedError(category, path, "The autosave could not be completed.", remediation, "")
	return &file.AtomicReplaceError{
		Committed:  false,
		Classified: &classified,
		Cause:      errors.New("fixture write refusal"),
	}
}

type autosaveErrorRecorder struct {
	mu     sync.Mutex
	errors []apperr.WireError
}

func (recorder *autosaveErrorRecorder) EmitStatePatch(context.Context, apperr.AppStatePatch) error {
	return nil
}

func (recorder *autosaveErrorRecorder) EmitAsyncError(_ context.Context, wire apperr.WireError) error {
	recorder.mu.Lock()
	recorder.errors = append(recorder.errors, wire)
	recorder.mu.Unlock()
	return nil
}

func (recorder *autosaveErrorRecorder) snapshot() []apperr.WireError {
	recorder.mu.Lock()
	defer recorder.mu.Unlock()
	return append([]apperr.WireError(nil), recorder.errors...)
}

type autosaveStateOnlyEmitter struct{}

func (autosaveStateOnlyEmitter) EmitStatePatch(context.Context, apperr.AppStatePatch) error {
	return nil
}

type autosaveFailingEmitter struct{}

func (autosaveFailingEmitter) EmitStatePatch(context.Context, apperr.AppStatePatch) error {
	return nil
}

func (autosaveFailingEmitter) EmitAsyncError(context.Context, apperr.WireError) error {
	return errors.New("event transport unavailable")
}
