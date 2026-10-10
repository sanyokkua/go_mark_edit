package application_test

import (
	"context"
	"testing"

	"github.com/sanyokkua/go_mark_edit/internal/appmodel"
)

// newUntitledID creates a clean Untitled document through the public
// NewDocument path, because a new service starts with no document.
func newUntitledID(t *testing.T, service *appmodel.AppModelService) string {
	t.Helper()
	state, err := service.GetState(context.Background())
	if err != nil {
		t.Fatalf("state before NewDocument: %v", err)
	}
	created := service.NewDocument(context.Background(), state.Snapshot.TabSetRevision)
	if created.Data == nil {
		t.Fatalf("NewDocument = %+v", created)
	}
	return created.Data.DocumentID
}
