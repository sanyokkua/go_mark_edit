package appmodel_test

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/rs/zerolog"
	"github.com/sanyokkua/go_mark_edit/internal/apperr"
	"github.com/sanyokkua/go_mark_edit/internal/appmodel"
)

func TestPreviewLinkReturnsTreeRowOnlyForVisibleWorkspaceTargets(t *testing.T) {
	ctx := context.Background()
	root := previewTreeCanonicalTempDir(t)
	outside := t.TempDir()
	for _, path := range []string{filepath.Join(root, "source.md"), filepath.Join(root, "sub", "target.md"), filepath.Join(root, ".hidden", "secret.md"), filepath.Join(root, "report.pdf"), filepath.Join(outside, "outside.md")} {
		if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
			t.Fatal(err)
		}
		if err := os.WriteFile(path, []byte("# document\n"), 0o644); err != nil {
			t.Fatal(err)
		}
	}
	var logs bytes.Buffer
	service := appmodel.NewAppModelServiceForHost(
		appmodel.WithEmitter(&recordingEmitter{}),
		appmodel.WithLogger(zerolog.New(&logs)),
		appmodel.AppModelOption{LayoutRepository: &workspaceLayoutFixture{values: []bool{false}}},
	)
	source := filepath.Join(root, "source.md")
	opened := service.OpenPath(ctx, source, 0)
	if opened.Status != apperr.OpenStatusOpened {
		t.Fatalf("open source = %+v", opened)
	}
	beforeFolder := service.OpenPreviewLink(ctx, opened.DocumentID, "./sub/target.md")
	assertPreviewTreePath(t, beforeFolder, "")
	if result := service.OpenWorkspace(ctx, root); result.Status != apperr.WorkspaceStatusOpened {
		t.Fatalf("open workspace = %+v", result)
	}
	visible := service.OpenPreviewLink(ctx, opened.DocumentID, "./sub/target.md")
	assertPreviewTreePath(t, visible, filepath.Join(root, "sub", "target.md"))
	// The same document is focused on a second request and must still carry its row.
	focused := service.OpenPreviewLink(ctx, opened.DocumentID, "./sub/target.md")
	if focused.Status != apperr.OpenStatusFocused {
		t.Fatalf("second link status = %q, want focused", focused.Status)
	}
	assertPreviewTreePath(t, focused, filepath.Join(root, "sub", "target.md"))
	assertPreviewTreePath(t, service.OpenPreviewLink(ctx, opened.DocumentID, filepath.Join(outside, "outside.md")), "")
	assertPreviewTreePath(t, service.OpenPreviewLink(ctx, opened.DocumentID, "./.hidden/secret.md"), "")
	unsupported := service.OpenPreviewLink(ctx, opened.DocumentID, "./report.pdf")
	if unsupported.Status != apperr.OpenStatusRefused || unsupported.RevealPath != filepath.Join(root, "report.pdf") || unsupported.TreePath != "" {
		t.Fatalf("unsupported link = %+v, want RevealPath without TreePath", unsupported)
	}
	if strings.Contains(logs.String(), root) || strings.Contains(logs.String(), outside) {
		t.Fatalf("preview link logged a local path: %q", logs.String())
	}
}

func TestPreviewLinkMapsSymlinkToItsVisibleTargetRow(t *testing.T) {
	ctx := context.Background()
	root := previewTreeCanonicalTempDir(t)
	source := filepath.Join(root, "source.md")
	target := filepath.Join(root, "target.md")
	alias := filepath.Join(root, "alias.md")
	for _, path := range []string{source, target} {
		if err := os.WriteFile(path, []byte("# document\n"), 0o644); err != nil {
			t.Fatal(err)
		}
	}
	if err := os.Symlink(target, alias); err != nil {
		t.Skipf("symlinks unavailable: %v", err)
	}
	service := appmodel.NewAppModelServiceForHost(appmodel.WithEmitter(&recordingEmitter{}), appmodel.AppModelOption{LayoutRepository: &workspaceLayoutFixture{values: []bool{false}}})
	opened := service.OpenPath(ctx, source, 0)
	if opened.Status != apperr.OpenStatusOpened {
		t.Fatalf("open source = %+v", opened)
	}
	if result := service.OpenWorkspace(ctx, root); result.Status != apperr.WorkspaceStatusOpened {
		t.Fatalf("open workspace = %+v", result)
	}
	assertPreviewTreePath(t, service.OpenPreviewLink(ctx, opened.DocumentID, "./alias.md"), target)
}

func TestPreviewLinkDoesNotInventARowBeyondTheWorkspaceLimit(t *testing.T) {
	ctx := context.Background()
	root := previewTreeCanonicalTempDir(t)
	source := filepath.Join(root, "source.md")
	if err := os.WriteFile(source, []byte("# source\n"), 0o644); err != nil {
		t.Fatal(err)
	}
	for index := 0; index < 20_000; index++ {
		path := filepath.Join(root, fmt.Sprintf("note-%05d.md", index))
		if err := os.WriteFile(path, nil, 0o644); err != nil {
			t.Fatal(err)
		}
	}
	service := appmodel.NewAppModelServiceForHost(appmodel.WithEmitter(&recordingEmitter{}), appmodel.AppModelOption{LayoutRepository: &workspaceLayoutFixture{values: []bool{false}}})
	opened := service.OpenPath(ctx, source, 0)
	if opened.Status != apperr.OpenStatusOpened {
		t.Fatalf("open source = %+v", opened)
	}
	workspace := service.OpenWorkspace(ctx, root)
	if workspace.Workspace == nil || !workspace.Workspace.Truncated {
		t.Fatalf("workspace = %+v, want truncated snapshot", workspace)
	}
	assertPreviewTreePath(t, service.OpenPreviewLink(ctx, opened.DocumentID, "./source.md"), "")
}

func TestPreviewLinkMatchesCaseOnlyFolderAndFileAliasesByFilesystemIdentity(t *testing.T) {
	ctx := context.Background()
	root := previewTreeCanonicalTempDir(t)
	folder := filepath.Join(root, "Mixed")
	if err := os.Mkdir(folder, 0o755); err != nil {
		t.Fatal(err)
	}
	source := filepath.Join(root, "source.md")
	target := filepath.Join(folder, "Target.md")
	for _, path := range []string{source, target} {
		if err := os.WriteFile(path, []byte("# document\n"), 0o644); err != nil {
			t.Fatal(err)
		}
	}
	alias := filepath.Join(root, "mIXED", "tARGET.md")
	actualInfo, actualErr := os.Stat(target)
	aliasInfo, aliasErr := os.Stat(alias)
	if actualErr != nil || aliasErr != nil || !os.SameFile(actualInfo, aliasInfo) {
		t.Skip("case-only aliases are unavailable on this volume")
	}
	service := appmodel.NewAppModelServiceForHost(appmodel.WithEmitter(&recordingEmitter{}), appmodel.AppModelOption{LayoutRepository: &workspaceLayoutFixture{values: []bool{false}}})
	opened := service.OpenPath(ctx, source, 0)
	if opened.Status != apperr.OpenStatusOpened {
		t.Fatalf("open source = %+v", opened)
	}
	if result := service.OpenWorkspace(ctx, root); result.Status != apperr.WorkspaceStatusOpened {
		t.Fatalf("open workspace = %+v", result)
	}
	assertPreviewTreePath(t, service.OpenPreviewLink(ctx, opened.DocumentID, "./mIXED/tARGET.md"), target)
}

func TestPreviewLinkMatchesCaseOnlyWorkspaceRootByFilesystemIdentity(t *testing.T) {
	ctx := context.Background()
	parent := previewTreeCanonicalTempDir(t)
	root := filepath.Join(parent, "MixedRoot")
	if err := os.Mkdir(root, 0o755); err != nil {
		t.Fatal(err)
	}
	aliasRoot := filepath.Join(parent, "mIXEDrOOT")
	rootInfo, rootErr := os.Stat(root)
	aliasInfo, aliasErr := os.Stat(aliasRoot)
	if rootErr != nil || aliasErr != nil || !os.SameFile(rootInfo, aliasInfo) {
		t.Skip("case-only workspace root alias is unavailable on this volume")
	}
	source := filepath.Join(root, "source.md")
	target := filepath.Join(root, "target.md")
	for _, path := range []string{source, target} {
		if err := os.WriteFile(path, []byte("# document\n"), 0o644); err != nil {
			t.Fatal(err)
		}
	}
	service := appmodel.NewAppModelServiceForHost(appmodel.WithEmitter(&recordingEmitter{}), appmodel.AppModelOption{LayoutRepository: &workspaceLayoutFixture{values: []bool{false}}})
	opened := service.OpenPath(ctx, source, 0)
	if opened.Status != apperr.OpenStatusOpened {
		t.Fatalf("open source = %+v", opened)
	}
	if result := service.OpenWorkspace(ctx, root); result.Status != apperr.WorkspaceStatusOpened {
		t.Fatalf("open workspace = %+v", result)
	}
	assertPreviewTreePath(t, service.OpenPreviewLink(ctx, opened.DocumentID, filepath.Join(aliasRoot, "target.md")), target)
}

func assertPreviewTreePath(t *testing.T, result apperr.OpenResult, want string) {
	t.Helper()
	if result.Status != apperr.OpenStatusOpened && result.Status != apperr.OpenStatusFocused {
		t.Fatalf("link result = %+v, want opened/focused", result)
	}
	encoded, err := json.Marshal(result)
	if err != nil {
		t.Fatalf("marshal link result: %v", err)
	}
	var fields map[string]json.RawMessage
	if err := json.Unmarshal(encoded, &fields); err != nil {
		t.Fatalf("decode link result: %v", err)
	}
	var got string
	if raw, present := fields["treePath"]; present {
		if err := json.Unmarshal(raw, &got); err != nil {
			t.Fatalf("decode treePath: %v", err)
		}
	}
	if got != want {
		t.Fatalf("treePath = %q, want %q; result = %+v", got, want, result)
	}
	if result.TreePath != want {
		t.Fatalf("typed TreePath = %q, want %q", result.TreePath, want)
	}
	if want == "" && fields["treePath"] != nil {
		t.Fatalf("empty treePath must be omitted: %s", encoded)
	}
}

func previewTreeCanonicalTempDir(t *testing.T) string {
	t.Helper()
	path, err := filepath.EvalSymlinks(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	return path
}
