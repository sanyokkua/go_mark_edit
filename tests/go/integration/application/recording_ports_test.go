package application_test

import (
	"context"
	"encoding/json"
	"os"
	"path/filepath"
	"reflect"
	"slices"
	"testing"

	"github.com/sanyokkua/go_mark_edit/internal/apperr"
	"github.com/sanyokkua/go_mark_edit/internal/application"
	"github.com/sanyokkua/go_mark_edit/internal/appmodel"
	"github.com/sanyokkua/go_mark_edit/internal/file"
)

func TestRecordingPortsOverridePlatformPorts(t *testing.T) {
	root := t.TempDir()
	reveal := filepath.Join(root, "reveal.jsonl")
	clipboard := filepath.Join(root, "clipboard.jsonl")
	holder := application.NewApplicationContextHolderWithOptions(&fakeFileUtils{databasePath: filepath.Join(root, "settings.db")}, nil, application.ApplicationContextOptions{AppModelOptions: []appmodel.AppModelOption{
		appmodel.WithEmitter(discardingLifecycleEmitter{}), appmodel.WithRevealPort(file.NewRecordingRevealPort(reveal)), appmodel.WithClipboardWriter(file.NewRecordingClipboardWriter(clipboard)),
	}})
	ctx := context.Background()
	holder.SetContext(ctx)
	if err := holder.Init(ctx); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() {
		if err := holder.Close(); err != nil {
			t.Error(err)
		}
	})
	path := filepath.Join(root, "document.md")
	if err := os.WriteFile(path, []byte("content"), 0600); err != nil {
		t.Fatal(err)
	}
	canonical, err := filepath.EvalSymlinks(path)
	if err != nil {
		t.Fatal(err)
	}
	state, _ := holder.AppModelService.GetState(ctx)
	opened := holder.AppModelService.OpenPath(ctx, path, state.Snapshot.TabSetRevision)
	if opened.Error != nil {
		t.Fatalf("open: %+v", opened)
	}
	if got := holder.AppModelService.CopyPath(ctx, opened.DocumentID); got.Status != apperr.PathCommandCopied {
		t.Fatalf("copy: %+v", got)
	}
	if got := holder.AppModelService.RevealInFileManager(ctx, opened.DocumentID); got.Status != apperr.PathCommandRevealed {
		t.Fatalf("reveal: %+v", got)
	}
	if err := os.Remove(path); err != nil {
		t.Fatal(err)
	}
	missing := holder.AppModelService.RevealInFileManager(ctx, opened.DocumentID)
	if missing.Error == nil || missing.Error.Category != apperr.ClassifiedNotFound || !slices.Equal(missing.Error.Remediations, []apperr.ClassifiedRemediation{apperr.RemediationSaveToRecreate, apperr.RemediationCopyPath}) {
		t.Fatalf("missing reveal: %+v", missing)
	}
	for _, p := range []string{reveal, clipboard} {
		data, err := os.ReadFile(p)
		if err != nil {
			t.Fatal(err)
		}
		var value string
		if err := json.Unmarshal(data, &value); err != nil {
			t.Fatal(err)
		}
		if !reflect.DeepEqual(value, canonical) {
			t.Fatalf("%s = %q, want %q", p, value, canonical)
		}
	}
}
