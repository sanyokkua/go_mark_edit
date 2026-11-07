package appmodel_test

import (
	"context"
	"fmt"
	"sync"
	"testing"
	"time"

	"github.com/sanyokkua/go_mark_edit/internal/apperr"
	. "github.com/sanyokkua/go_mark_edit/internal/appmodel"
)

func TestExternalChangeCheckDuringTheAppsOwnSaveFindsNoConflict(t *testing.T) {
	ctx := context.Background()
	var service *AppModelService
	var id string
	var checks sync.WaitGroup
	var mu sync.Mutex
	var outcomes []apperr.ConflictResult
	check := func() {
		defer checks.Done()
		result := service.CheckExternalChanges(ctx, id)
		mu.Lock()
		outcomes = append(outcomes, result)
		mu.Unlock()
	}
	service = NewAppModelServiceForHost(WithEmitter(&recordingEmitter{}), AppModelOption{
		AutosaveTimer: &fakeAutosaveClock{},
		// A focus check that starts the moment the save's bytes reach disk.
		WriteCommitObserver: func(CommittedWriteResult, SaveOrigin) {
			checks.Add(1)
			finished := make(chan struct{})
			go func() {
				defer close(finished)
				check()
			}()
			select {
			case <-finished:
			case <-time.After(50 * time.Millisecond):
			}
		},
	})
	_, id = openAutosaveDocument(t, service, "base\n")

	for iteration := 0; iteration < 20; iteration++ {
		if err := service.UpdateBuffer(ctx, id, fmt.Sprintf("edit %d\n", iteration)); err != nil {
			t.Fatalf("UpdateBuffer: %v", err)
		}
		revision := contentRevision(t, service, id)
		checks.Add(1)
		go check()
		if saved := service.Save(ctx, id, revision, ""); saved.Status != apperr.WriteStatusCommitted {
			t.Fatalf("Save = %+v, want committed", saved)
		}
		checks.Wait()
	}

	for _, outcome := range outcomes {
		if outcome.Status == apperr.ConflictStatusDetected || outcome.Preview != nil {
			t.Fatalf("check racing the app's own save = %+v, want no external change", outcome)
		}
	}
}
