package application

import (
	"context"
	"errors"
	"testing"
)

func TestDocumentDialogs(t *testing.T) {
	ctx := context.WithValue(context.Background(), dialogContextKey{}, "dialog")
	wantErr := errors.New("picker failed")
	calls := 0
	dialogs := NewDocumentDialogs(func(got context.Context) (string, error) {
		calls++
		if got != ctx {
			t.Fatalf("dialog context = %v, want injected context", got)
		}
		return "", wantErr
	})
	path, err := dialogs.ChooseOpenFile(ctx)
	if path != "" || !errors.Is(err, wantErr) || calls != 1 {
		t.Fatalf("dialog result = path %q, error %v, calls %d", path, err, calls)
	}
	if path, err := (*DocumentDialogs)(nil).ChooseOpenFile(ctx); path != "" || err != nil {
		t.Fatalf("nil dialog result = path %q, error %v, want cancellation", path, err)
	}
}

type dialogContextKey struct{}
