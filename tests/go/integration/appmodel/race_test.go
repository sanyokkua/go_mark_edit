package appmodel_test

import (
	"context"
	"os"
	"path/filepath"
	"sync"
	"testing"

	"github.com/sanyokkua/go_mark_edit/internal/apperr"
	"github.com/sanyokkua/go_mark_edit/internal/appmodel"
)

func TestStaleSaveConcurrentWithNewDocumentNamesTheOriginalDocument(t *testing.T) {
	for iteration := 0; iteration < 32; iteration++ {
		path := filepath.Join(t.TempDir(), "race.md")
		if err := os.WriteFile(path, []byte("original\n"), 0o644); err != nil {
			t.Fatalf("write document: %v", err)
		}
		service := appmodel.NewAppModelServiceForHost(appmodel.WithEmitter(&statePatchRecorder{}))
		opened := service.OpenPath(context.Background(), path, 0)
		if opened.Status != appmodel.OpenStatusOpened {
			t.Fatalf("open status = %q, error = %+v", opened.Status, opened.Error)
		}
		if err := service.UpdateBuffer(context.Background(), opened.DocumentID, "edited\n"); err != nil {
			t.Fatalf("UpdateBuffer: %v", err)
		}
		state, err := service.GetState(context.Background())
		if err != nil {
			t.Fatalf("GetState: %v", err)
		}
		start := make(chan struct{})
		var wait sync.WaitGroup
		wait.Add(2)
		results := make(chan apperr.WriteResult, 1)
		go func() {
			defer wait.Done()
			<-start
			results <- service.Save(context.Background(), opened.DocumentID, 0, "")
		}()
		go func() {
			defer wait.Done()
			<-start
			_ = service.NewDocument(context.Background(), state.Snapshot.TabSetRevision)
		}()
		close(start)
		wait.Wait()
		result := <-results
		if result.Status != apperr.WriteStatusRefused || result.Error == nil {
			t.Fatalf("stale save result = %+v, want a classified refusal", result)
		}
		if result.Error.SafeSubject != "race.md" {
			t.Fatalf("stale save subject = %q, want race.md", result.Error.SafeSubject)
		}
	}
}
