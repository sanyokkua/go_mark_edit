package application_test

import (
	"context"
	"errors"
	. "github.com/sanyokkua/go_mark_edit/internal/application"
	"testing"

	"github.com/sanyokkua/go_mark_edit/internal/appmodel"
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

func TestDocumentDialogsSaveAndOverwritePorts(t *testing.T) {
	ctx := context.WithValue(context.Background(), dialogContextKey{}, "save-dialog")
	saveCalls := 0
	overwriteCalls := 0
	dialogs := NewDocumentDialogs(nil)
	dialogs.SetSaveFilePicker(
		func(got context.Context, request appmodel.SaveDialogRequest) (string, error) {
			saveCalls++
			if got != ctx || request.DefaultFilename != "Untitled.md" {
				t.Fatalf("save dialog context/request = %v/%+v", got, request)
			}
			return "/tmp/Untitled.md", nil
		})
	dialogs.SetOverwriteConfirmer(
		func(got context.Context, subject string) (bool, error) {
			overwriteCalls++
			if got != ctx || subject != "Untitled.md" {
				t.Fatalf("overwrite context/subject = %v/%q", got, subject)
			}
			return true, nil
		})
	path, err := dialogs.ChooseSaveFile(ctx, appmodel.SaveDialogRequest{DefaultFilename: "Untitled.md"})
	if err != nil || path != "/tmp/Untitled.md" || saveCalls != 1 {
		t.Fatalf("save dialog result = %q/%v calls=%d", path, err, saveCalls)
	}
	confirmed, err := dialogs.ConfirmOverwrite(ctx, "Untitled.md")
	if err != nil || !confirmed || overwriteCalls != 1 {
		t.Fatalf("overwrite result = %t/%v calls=%d", confirmed, err, overwriteCalls)
	}
}

type dialogContextKey struct{}
