package appmodel_test

import (
	"context"
	"os"
	"path/filepath"
	"reflect"
	"testing"

	"github.com/sanyokkua/go_mark_edit/internal/appmodel"
	"github.com/sanyokkua/go_mark_edit/internal/file"
)

func TestClassifyDroppedPathsBucketsInInputOrderWithoutChangingState(t *testing.T) {
	ctx := context.Background()
	root := t.TempDir()
	paths := map[string]string{}
	for _, name := range []string{"first.md", "second.TXT", "unsupported.bin"} {
		paths[name] = filepath.Join(root, name)
		if err := os.WriteFile(paths[name], []byte("test"), 0o600); err != nil {
			t.Fatal(err)
		}
	}
	folder := filepath.Join(root, "folder")
	if err := os.Mkdir(folder, 0o700); err != nil {
		t.Fatal(err)
	}
	missing := filepath.Join(root, "missing.md")
	pipe := filepath.Join(root, "pipe.md")
	// A symlink to a non-regular device exercises os.Stat's target mode.
	if err := os.Symlink("/dev/null", pipe); err != nil {
		t.Fatal(err)
	}
	directoryShapedSpecial := pipe + string(os.PathSeparator)
	emitter := &recordingEmitter{}
	service := appmodel.NewAppModelServiceForHost(appmodel.WithEmitter(emitter))
	before, err := service.GetState(ctx)
	if err != nil {
		t.Fatal(err)
	}
	count := emitter.Count()
	got := service.ClassifyDroppedPaths(ctx, []string{paths["second.TXT"], missing, folder, paths["unsupported.bin"], paths["first.md"], pipe, directoryShapedSpecial})
	canonical, err := file.CanonicalizeDirectoryPath(folder)
	if err != nil {
		t.Fatal(err)
	}
	if !reflect.DeepEqual(got.Files, []string{paths["second.TXT"], paths["first.md"]}) || !reflect.DeepEqual(got.Folders, []string{canonical}) || !reflect.DeepEqual(got.Unsupported, []string{missing, paths["unsupported.bin"], pipe, directoryShapedSpecial}) {
		t.Fatalf("classification = %+v", got)
	}
	after, err := service.GetState(ctx)
	if err != nil {
		t.Fatal(err)
	}
	if !reflect.DeepEqual(before, after) || emitter.Count() != count {
		t.Fatalf("classification changed state or published patch: before=%+v after=%+v patches=%d", before, after, emitter.Count()-count)
	}
	empty := service.ClassifyDroppedPaths(ctx, nil)
	if empty.Files == nil || empty.Folders == nil || empty.Unsupported == nil || len(empty.Files)+len(empty.Folders)+len(empty.Unsupported) != 0 {
		t.Fatalf("empty classification = %+v", empty)
	}
}

func TestClassifyDroppedDirectoryMatchesOpenWorkspaceCanonicalRoot(t *testing.T) {
	ctx := context.Background()
	root := t.TempDir()
	realParent := filepath.Join(root, "real")
	if err := os.MkdirAll(filepath.Join(realParent, "folder"), 0o700); err != nil {
		t.Fatal(err)
	}
	link := filepath.Join(root, "link")
	if err := os.Symlink(realParent, link); err != nil {
		t.Fatal(err)
	}
	throughLink := filepath.Join(link, "folder")
	service := appmodel.NewAppModelServiceForHost(appmodel.WithEmitter(&recordingEmitter{}), appmodel.AppModelOption{LayoutRepository: &workspaceWritableLayout{}})
	got := service.ClassifyDroppedPaths(ctx, []string{throughLink})
	canonical, err := file.CanonicalizeDirectoryPath(throughLink)
	if err != nil {
		t.Fatal(err)
	}
	opened := service.OpenWorkspace(ctx, throughLink)
	if opened.Workspace == nil || !reflect.DeepEqual(got.Folders, []string{canonical}) || opened.Workspace.RootPath != canonical {
		t.Fatalf("classification=%+v open=%+v canonical=%q", got, opened, canonical)
	}
}
