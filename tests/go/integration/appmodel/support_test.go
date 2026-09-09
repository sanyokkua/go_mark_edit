package appmodel_test

import (
	"context"
	"sync"
	"time"

	"github.com/sanyokkua/go_mark_edit/internal/apperr"
	"github.com/sanyokkua/go_mark_edit/internal/appmodel"
)

type statePatchRecorder struct {
	mu      sync.Mutex
	patches []apperr.AppStatePatch
}

func (recorder *statePatchRecorder) EmitStatePatch(_ context.Context, patch apperr.AppStatePatch) error {
	recorder.mu.Lock()
	defer recorder.mu.Unlock()
	if patch.Documents != nil {
		copyPatch := patch
		copyDocuments := *patch.Documents
		if patch.Documents.Upsert != nil {
			copyDocuments.Upsert = make(map[string]apperr.DocumentMetadata, len(patch.Documents.Upsert))
			for id, metadata := range patch.Documents.Upsert {
				copyDocuments.Upsert[id] = metadata
			}
		}
		copyDocuments.Remove = append([]string(nil), patch.Documents.Remove...)
		copyPatch.Documents = &copyDocuments
		patch = copyPatch
	}
	recorder.patches = append(recorder.patches, patch)
	return nil
}

func (recorder *statePatchRecorder) last() apperr.AppStatePatch {
	recorder.mu.Lock()
	defer recorder.mu.Unlock()
	if len(recorder.patches) == 0 {
		return apperr.AppStatePatch{}
	}
	return recorder.patches[len(recorder.patches)-1]
}

type saveDialog struct {
	path    string
	confirm bool
}

func (dialog saveDialog) ChooseSaveFile(context.Context, appmodel.SaveDialogRequest) (string, error) {
	return dialog.path, nil
}

func (dialog saveDialog) ConfirmOverwrite(context.Context, string) (bool, error) {
	return dialog.confirm, nil
}

type manualAutosaveFactory struct {
	mu     sync.Mutex
	timers []*manualAutosaveTimer
}

func (factory *manualAutosaveFactory) AfterFunc(_ time.Duration, callback func()) appmodel.AutosaveTimer {
	timer := &manualAutosaveTimer{callback: callback}
	factory.mu.Lock()
	factory.timers = append(factory.timers, timer)
	factory.mu.Unlock()
	return timer
}

func (factory *manualAutosaveFactory) fireNext() bool {
	factory.mu.Lock()
	for _, timer := range factory.timers {
		timer.mu.Lock()
		if !timer.stopped && !timer.fired {
			timer.fired = true
			callback := timer.callback
			timer.mu.Unlock()
			factory.mu.Unlock()
			callback()
			return true
		}
		timer.mu.Unlock()
	}
	factory.mu.Unlock()
	return false
}

type manualAutosaveTimer struct {
	mu       sync.Mutex
	callback func()
	stopped  bool
	fired    bool
}

func (timer *manualAutosaveTimer) Stop() bool {
	timer.mu.Lock()
	wasActive := !timer.stopped
	timer.stopped = true
	timer.mu.Unlock()
	return wasActive
}
