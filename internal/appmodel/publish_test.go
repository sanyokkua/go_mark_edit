package appmodel

import (
	"context"
	"errors"
	"sync"
	"testing"
	"time"

	"github.com/sanyokkua/go_mark_edit/internal/apperr"
)

type lockObservingEmitter struct {
	mu           sync.Mutex
	service      *AppModelService
	lockHeld     bool
	publications int
}

func (emitter *lockObservingEmitter) EmitStatePatch(_ context.Context, _ apperr.AppStatePatch) error {
	if !emitter.service.mu.TryRLock() {
		emitter.mu.Lock()
		emitter.lockHeld = true
		emitter.mu.Unlock()
		return nil
	}
	emitter.service.mu.RUnlock()
	emitter.mu.Lock()
	emitter.publications++
	emitter.mu.Unlock()
	return nil
}

func (emitter *lockObservingEmitter) observed() (bool, int) {
	emitter.mu.Lock()
	defer emitter.mu.Unlock()
	return emitter.lockHeld, emitter.publications
}

func TestStatePublicationOccursAfterModelLockRelease(t *testing.T) {
	emitter := &lockObservingEmitter{}
	service := NewAppModelService(emitter)
	emitter.service = service

	if err := service.UpdateBuffer(context.Background(), service.state.activeDocumentID, "changed"); err != nil {
		t.Fatalf("UpdateBuffer: %v", err)
	}
	lockHeld, publications := emitter.observed()
	if lockHeld {
		t.Fatal("state patch emitter ran while the model lock was held")
	}
	if publications == 0 {
		t.Fatal("UpdateBuffer did not publish a state patch")
	}
}

func TestStalePublicationIsRejectedWithoutRollingBackNewerState(t *testing.T) {
	emitter := &recordingEmitter{}
	service := NewAppModelService(emitter)
	documentID := service.state.activeDocumentID
	service.publicationMu.Lock()

	firstDone := make(chan error, 1)
	go func() {
		firstDone <- service.UpdateBuffer(context.Background(), documentID, "first")
	}()
	waitForPublishedRevision(t, service, documentID, 1)

	secondDone := make(chan error, 1)
	go func() {
		secondDone <- service.UpdateBuffer(context.Background(), documentID, "second")
	}()
	waitForPublishedRevision(t, service, documentID, 2)
	service.publicationMu.Unlock()

	if err := <-firstDone; !errors.Is(err, errStalePublication) {
		t.Fatalf("first publication error = %v, want stale publication", err)
	}
	if err := <-secondDone; err != nil {
		t.Fatalf("second publication error = %v", err)
	}
	if emitter.Count() != 1 {
		t.Fatalf("published patch count = %d, want only the current publication", emitter.Count())
	}
	service.mu.RLock()
	content := service.state.documents[documentID].content
	service.mu.RUnlock()
	if content != "second" {
		t.Fatalf("document content = %q, want the newer accepted content", content)
	}
}

func waitForPublishedRevision(t *testing.T, service *AppModelService, documentID string, want uint64) {
	t.Helper()
	deadline := time.NewTimer(time.Second)
	defer deadline.Stop()
	for {
		service.mu.RLock()
		document := service.state.documents[documentID]
		got := uint64(0)
		if document != nil {
			got = document.metadata.ContentRevision
		}
		service.mu.RUnlock()
		if got == want {
			return
		}
		select {
		case <-deadline.C:
			t.Fatalf("document revision = %d, want %d", got, want)
		default:
			time.Sleep(time.Millisecond)
		}
	}
}
