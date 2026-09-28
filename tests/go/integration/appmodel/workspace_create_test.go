package appmodel_test

import (
	"context"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"testing"

	"github.com/sanyokkua/go_mark_edit/internal/apperr"
	"github.com/sanyokkua/go_mark_edit/internal/appmodel"
)

func TestWorkspaceCreateKeepsCommittedTreeWhenPublicationFails(t *testing.T) {
	for _, directory := range []bool{false, true} {
		t.Run(map[bool]string{false: "file", true: "folder"}[directory], func(t *testing.T) {
			ctx := context.Background()
			root := t.TempDir()
			emitter := &workspaceToggleEmitter{}
			service := appmodel.NewAppModelServiceForHost(appmodel.WithEmitter(emitter), appmodel.AppModelOption{LayoutRepository: &workspaceLayoutFixture{values: []bool{false}}})
			if got := service.OpenWorkspace(ctx, root); got.Error != nil {
				t.Fatalf("open: %+v", got)
			}
			emitter.fail = true
			name := "created.md"
			if directory {
				name = "created"
			}
			var got apperr.WorkspaceResult
			if directory {
				got = service.CreateWorkspaceFolder(ctx, root, name)
			} else {
				got = service.CreateWorkspaceFile(ctx, root, name)
			}
			if got.Status != apperr.WorkspaceStatusOpened || got.Workspace == nil || got.Error == nil || got.Error.Category != apperr.ClassifiedIOFailure || !strings.Contains(got.Error.Message, "created") {
				t.Fatalf("committed create with failed publication = %+v", got)
			}
			if info, err := os.Stat(filepath.Join(root, name)); err != nil || info.IsDir() != directory {
				t.Fatalf("disk entry: %v, %v", info, err)
			}
			state, err := service.GetState(ctx)
			if err != nil || state.Snapshot.Workspace == nil || len(state.Snapshot.Workspace.Root.Children) != 1 || state.Snapshot.Workspace.Root.Children[0].Name != name {
				t.Fatalf("committed tree after failed publication = %+v, %v", state.Snapshot.Workspace, err)
			}
			emitter.fail = false
			if retry := service.CreateWorkspaceFile(ctx, root, name); retry.Error == nil || retry.Error.Category != apperr.ClassifiedConflict {
				t.Fatalf("retry must report existing committed entry: %+v", retry)
			}
		})
	}
}

func TestWorkspaceCreateRebuildsWithoutOpening(t *testing.T) {
	ctx := context.Background()
	root := t.TempDir()
	nested := filepath.Join(root, "nested")
	if err := os.Mkdir(nested, 0755); err != nil {
		t.Fatal(err)
	}
	emitter := &recordingEmitter{}
	service := appmodel.NewAppModelServiceForHost(appmodel.WithEmitter(emitter), appmodel.AppModelOption{LayoutRepository: &workspaceLayoutFixture{values: []bool{false}}})
	if got := service.OpenWorkspace(ctx, root); got.Status != apperr.WorkspaceStatusOpened {
		t.Fatalf("open: %+v", got)
	}
	before, _ := service.GetState(ctx)
	patches := emitter.Count()
	for _, tc := range []struct {
		file         bool
		parent, name string
	}{
		{true, root, "z.md"}, {true, nested, "a.txt"}, {false, root, "folder"}, {false, nested, "child"},
	} {
		var result apperr.WorkspaceResult
		if tc.file {
			result = service.CreateWorkspaceFile(ctx, tc.parent, tc.name)
		} else {
			result = service.CreateWorkspaceFolder(ctx, tc.parent, tc.name)
		}
		if result.Status != apperr.WorkspaceStatusOpened || result.Workspace == nil {
			t.Fatalf("create %q: %+v", tc.name, result)
		}
		path := filepath.Join(tc.parent, tc.name)
		info, err := os.Stat(path)
		if err != nil {
			t.Fatal(err)
		}
		if info.IsDir() == tc.file {
			t.Fatalf("wrong entry kind: %s", path)
		}
		if tc.file && info.Size() != 0 {
			t.Fatalf("nonempty created file: %s", path)
		}
		wantMode := os.FileMode(0755)
		if tc.file {
			wantMode = 0644
		}
		if runtime.GOOS != "windows" && info.Mode().Perm() != wantMode {
			t.Fatalf("mode for %s = %o, want %o", path, info.Mode().Perm(), wantMode)
		}
		if emitter.Count() != patches+1 {
			t.Fatalf("create did not publish once: %s", path)
		}
		latest := emitter.Patches()[patches]
		if latest.Workspace == nil || latest.Workspace.Snapshot == nil {
			t.Fatalf("create did not publish a workspace snapshot: %s", path)
		}
		patches++
	}
	after, _ := service.GetState(ctx)
	if len(after.Snapshot.Documents) != len(before.Snapshot.Documents) || after.Snapshot.ActiveDocumentID != before.Snapshot.ActiveDocumentID {
		t.Fatalf("create changed open documents: before=%+v after=%+v", before.Snapshot, after.Snapshot)
	}
	if got := workspaceChildNamesFromSnapshot(after.Snapshot.Workspace.Root.Children); !equalStrings(got, []string{"folder", "nested", "z.md"}) {
		t.Fatalf("root ordering: %v", got)
	}
	for _, child := range after.Snapshot.Workspace.Root.Children {
		if child.Name == "nested" {
			if got := workspaceChildNamesFromSnapshot(child.Children); !equalStrings(got, []string{"child", "a.txt"}) {
				t.Fatalf("nested ordering: %v", got)
			}
		}
	}
}

func TestWorkspaceCreateRefusesInvalidInputWithoutWriting(t *testing.T) {
	ctx := context.Background()
	root := t.TempDir()
	outside := t.TempDir()
	service := appmodel.NewAppModelServiceForHost(appmodel.WithEmitter(&recordingEmitter{}), appmodel.AppModelOption{LayoutRepository: &workspaceLayoutFixture{values: []bool{false}}})
	if got := service.CreateWorkspaceFile(ctx, root, "x.md"); got.Error == nil || got.Error.Category != apperr.ClassifiedNotFound {
		t.Fatalf("no workspace: %+v", got)
	}
	if got := service.OpenWorkspace(ctx, root); got.Error != nil {
		t.Fatalf("open: %+v", got)
	}
	link := filepath.Join(root, "outside-link")
	if err := os.Symlink(outside, link); err != nil {
		t.Fatal(err)
	}
	cases := []struct{ parent, name string }{{outside, "x.md"}, {link, "x.md"}, {root, ""}, {root, ".hidden"}, {root, "a/b"}, {root, "a\\b"}}
	for _, tc := range cases {
		for _, file := range []bool{true, false} {
			var got apperr.WorkspaceResult
			if file {
				got = service.CreateWorkspaceFile(ctx, tc.parent, tc.name)
			} else {
				got = service.CreateWorkspaceFolder(ctx, tc.parent, tc.name)
			}
			if got.Error == nil || got.Error.Category != apperr.ClassifiedUnsupportedInput {
				t.Errorf("invalid parent=%q name=%q file=%v: %+v", tc.parent, tc.name, file, got)
			}
		}
	}
	if _, err := os.Stat(filepath.Join(outside, "x.md")); !os.IsNotExist(err) {
		t.Fatalf("outside write: %v", err)
	}
	if got := service.CreateWorkspaceFile(ctx, root, "same.md"); got.Error != nil {
		t.Fatalf("initial create: %+v", got)
	}
	if got := service.CreateWorkspaceFolder(ctx, root, "same.md"); got.Error == nil || got.Error.Category != apperr.ClassifiedConflict {
		t.Fatalf("collision: %+v", got)
	}
}
