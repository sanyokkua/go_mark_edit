package appmodel_test

import (
	"context"
	"testing"

	"github.com/sanyokkua/go_mark_edit/internal/appmodel"
)

func TestWithVersionReachesTheApplicationState(t *testing.T) {
	service := appmodel.NewAppModelServiceForHost(appmodel.WithVersion("test-version"))

	state, err := service.GetState(context.Background())
	if err != nil {
		t.Fatalf("GetState: %v", err)
	}
	if got := state.Snapshot.ApplicationVersion; got != "test-version" {
		t.Fatalf("application version = %q, want %q", got, "test-version")
	}
}
