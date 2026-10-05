package application_test

import (
	"context"
	"encoding/json"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"testing"

	"github.com/sanyokkua/go_mark_edit/internal/apperr"
	"github.com/sanyokkua/go_mark_edit/internal/appmodel"
)

func TestOpenPreviewLinkResolvesLocalTargetsThroughOpen(t *testing.T) {
	root := t.TempDir()
	outside := t.TempDir()
	source := filepath.Join(root, "source.md")
	child := filepath.Join(root, "My Notes.markdown")
	unsupported := filepath.Join(root, "child.pdf")
	missing := filepath.Join(root, "missing.pdf")
	folder := filepath.Join(root, "folder.md")
	large := filepath.Join(root, "large.md")
	escaping := filepath.Join(root, "escaping.md")
	hardLink := filepath.Join(root, "hard-link.md")
	symlinkAlias := filepath.Join(root, "symlink-alias.md")
	outsideFile := filepath.Join(outside, "outside.md")

	for path, content := range map[string]string{
		source:      "# source\n",
		child:       "# child\n",
		unsupported: "not markdown\n",
		outsideFile: "# outside\n",
	} {
		if err := os.WriteFile(path, []byte(content), 0o644); err != nil {
			t.Fatalf("write %s: %v", path, err)
		}
	}
	if err := os.Symlink(outsideFile, escaping); err != nil {
		t.Fatalf("create escaping symlink: %v", err)
	}
	if err := os.Link(child, hardLink); err != nil {
		t.Fatalf("create hard link: %v", err)
	}
	if err := os.Symlink(child, symlinkAlias); err != nil {
		t.Fatalf("create symlink alias: %v", err)
	}
	if err := os.Mkdir(folder, 0o755); err != nil {
		t.Fatalf("create folder: %v", err)
	}
	if err := os.Truncate(large, 50*1024*1024+1); err != nil {
		if err := os.WriteFile(large, nil, 0o644); err != nil {
			t.Fatalf("create large file: %v", err)
		}
		if err := os.Truncate(large, 50*1024*1024+1); err != nil {
			t.Fatalf("size large file: %v", err)
		}
	}

	service := appmodel.NewAppModelServiceForHost(appmodel.WithEmitter(previewLinkEmitter{}))
	initial, err := service.GetState(context.Background())
	if err != nil {
		t.Fatalf("initial state: %v", err)
	}
	untitled := service.OpenPreviewLink(
		context.Background(),
		initial.Snapshot.ActiveDocumentID,
		"./My Notes.markdown",
	)
	if untitled.Status != appmodel.OpenStatusRefused || untitled.Error == nil {
		t.Fatalf("untitled preview link = %+v, want refusal", untitled)
	}
	absolute := service.OpenPreviewLink(context.Background(), initial.Snapshot.ActiveDocumentID, child)
	if absolute.Status != appmodel.OpenStatusOpened {
		t.Fatalf("absolute link from untitled = %+v, want opened", absolute)
	}

	afterAbsolute, err := service.GetState(context.Background())
	if err != nil {
		t.Fatalf("state after absolute open: %v", err)
	}
	opened := service.OpenPath(context.Background(), source, afterAbsolute.Snapshot.TabSetRevision)
	if opened.Status != appmodel.OpenStatusOpened {
		t.Fatalf("open source = %+v, want opened", opened)
	}

	for name, href := range map[string]string{
		"outside folder": filepath.Join("..", filepath.Base(outside), "outside.md"),
		"symlink escape": "./escaping.md",
	} {
		t.Run(name, func(t *testing.T) {
			result := service.OpenPreviewLink(context.Background(), opened.DocumentID, href)
			if result.Status != appmodel.OpenStatusOpened && result.Status != appmodel.OpenStatusFocused {
				t.Fatalf("OpenPreviewLink(%q) = %+v, want opened/focused", href, result)
			}
		})
	}

	for _, href := range []string{"./My%20Notes.markdown?view=1#section", "./My Notes.markdown", "./hard-link.md", "./symlink-alias.md"} {
		focused := service.OpenPreviewLink(context.Background(), opened.DocumentID, href)
		if focused.Status != appmodel.OpenStatusFocused || focused.DocumentID != absolute.DocumentID {
			t.Fatalf("alias link %q = %+v, want focus of %q", href, focused, absolute.DocumentID)
		}
	}
	caseAlias := filepath.Join(root, "MY NOTES.MARKDOWN")
	if info, statErr := os.Stat(caseAlias); statErr == nil {
		originalInfo, originalErr := os.Stat(child)
		if originalErr != nil {
			t.Fatalf("stat original: %v", originalErr)
		}
		if os.SameFile(info, originalInfo) {
			focused := service.OpenPreviewLink(context.Background(), opened.DocumentID, "./MY NOTES.MARKDOWN")
			if focused.Status != appmodel.OpenStatusFocused || focused.DocumentID != absolute.DocumentID {
				t.Fatalf("case alias = %+v, want existing document %q", focused, absolute.DocumentID)
			}
		} else {
			t.Log("case-only alias unavailable on this volume")
		}
	} else {
		t.Log("case-only alias unavailable on this volume")
	}

	beforeRefusals, err := service.GetState(context.Background())
	if err != nil {
		t.Fatalf("state before refused links: %v", err)
	}
	unsupportedResult := service.OpenPreviewLink(context.Background(), opened.DocumentID, "./child.pdf")
	assertLinkRefusal(t, unsupportedResult, apperr.ClassifiedUnsupportedInput, "child.pdf", root)
	canonicalUnsupported, err := filepath.EvalSymlinks(unsupported)
	if err != nil {
		t.Fatalf("canonicalize unsupported file: %v", err)
	}
	if unsupportedResult.RevealPath != canonicalUnsupported {
		t.Fatalf("unsupported RevealPath = %q, want %q", unsupportedResult.RevealPath, canonicalUnsupported)
	}
	for _, tc := range []struct {
		href, subject string
		category      apperr.ClassifiedErrorCategory
	}{
		{"./missing.pdf", filepath.Base(missing), apperr.ClassifiedNotFound},
		{"./folder.md", filepath.Base(folder), apperr.ClassifiedNotFound},
		{"./large.md", filepath.Base(large), apperr.ClassifiedCapacityLimit},
	} {
		result := service.OpenPreviewLink(context.Background(), opened.DocumentID, tc.href)
		assertLinkRefusal(t, result, tc.category, tc.subject, root)
		if result.RevealPath != "" {
			t.Fatalf("%q RevealPath = %q, want empty", tc.href, result.RevealPath)
		}
	}
	for _, href := range []string{`\\server\share\a.md`, `//server/share/a.md`, `%5C%5C?%5CC:%5Ca.md`, `/\server/share/a.md`} {
		result := service.OpenPreviewLink(context.Background(), opened.DocumentID, href)
		if result.Status != appmodel.OpenStatusRefused || result.Error == nil || result.Error.Category != apperr.ClassifiedUnsupportedInput || !strings.Contains(result.Error.Message, "not a local document target") {
			t.Fatalf("network link %q = %+v, want early link refusal", href, result)
		}
	}
	if runtime.GOOS != "windows" {
		for _, href := range []string{`C:\docs\a.md`, `sub\b.md`} {
			result := service.OpenPreviewLink(context.Background(), opened.DocumentID, href)
			assertLinkRefusal(t, result, apperr.ClassifiedNotFound, filepath.Base(strings.ReplaceAll(href, `\`, "/")), root)
		}
	}
	afterRefusals, err := service.GetState(context.Background())
	if err != nil {
		t.Fatalf("state after refused links: %v", err)
	}
	if afterRefusals.Snapshot.ActiveDocumentID != beforeRefusals.Snapshot.ActiveDocumentID ||
		len(afterRefusals.Snapshot.Documents) != len(beforeRefusals.Snapshot.Documents) {
		t.Fatalf("refused links changed the active tab or document count: before=%q/%d after=%q/%d",
			beforeRefusals.Snapshot.ActiveDocumentID, len(beforeRefusals.Snapshot.Documents),
			afterRefusals.Snapshot.ActiveDocumentID, len(afterRefusals.Snapshot.Documents))
	}
}

func TestOpenPreviewLinkUsesOpenPermissionAndCapacityClassifications(t *testing.T) {
	root := t.TempDir()
	source := filepath.Join(root, "source.md")
	target := filepath.Join(root, "target.md")
	for _, path := range []string{source, target} {
		if err := os.WriteFile(path, []byte("# document\n"), 0o644); err != nil {
			t.Fatalf("write document: %v", err)
		}
	}
	service := appmodel.NewAppModelServiceForHost(appmodel.WithEmitter(previewLinkEmitter{}))
	initial, err := service.GetState(context.Background())
	if err != nil {
		t.Fatalf("initial state: %v", err)
	}
	opened := service.OpenPath(context.Background(), source, initial.Snapshot.TabSetRevision)
	if opened.Status != appmodel.OpenStatusOpened {
		t.Fatalf("open source = %+v", opened)
	}
	if err := os.Chmod(target, 0); err != nil {
		t.Fatalf("remove read permission: %v", err)
	}
	t.Cleanup(func() { _ = os.Chmod(target, 0o644) })
	if handle, err := os.Open(target); err == nil {
		_ = handle.Close()
		t.Log("unreadable-file assertion skipped: host can still read mode-000 files")
	} else {
		result := service.OpenPreviewLink(context.Background(), opened.DocumentID, "./target.md")
		assertLinkRefusal(t, result, apperr.ClassifiedIOFailure, "target.md", root)
		if result.RevealPath != "" {
			t.Fatalf("unreadable file RevealPath = %q, want empty", result.RevealPath)
		}
	}
	if err := os.Chmod(target, 0o644); err != nil {
		t.Fatalf("restore read permission: %v", err)
	}
	for count := 0; count < 40; count++ {
		state, stateErr := service.GetState(context.Background())
		if stateErr != nil {
			t.Fatalf("state before New %d: %v", count, stateErr)
		}
		if len(state.Snapshot.Documents) == 40 {
			break
		}
		created := service.NewDocument(context.Background(), state.Snapshot.TabSetRevision)
		if created.Error != nil || created.Data == nil {
			t.Fatalf("New %d = %+v", count, created)
		}
	}
	fullState, err := service.GetState(context.Background())
	if err != nil {
		t.Fatalf("state at capacity: %v", err)
	}
	if len(fullState.Snapshot.Documents) != 40 {
		t.Fatalf("document count at capacity = %d, want 40", len(fullState.Snapshot.Documents))
	}
	capacity := service.OpenPreviewLink(context.Background(), opened.DocumentID, "./target.md")
	if capacity.Status != appmodel.OpenStatusRefused {
		t.Fatalf("capacity link status = %q, want refused; result=%+v", capacity.Status, capacity)
	}
	assertLinkRefusal(t, capacity, apperr.ClassifiedCapacityLimit, "target.md", root)
	if capacity.RevealPath != "" {
		t.Fatalf("capacity RevealPath = %q, want empty", capacity.RevealPath)
	}
}

func assertLinkRefusal(t *testing.T, result apperr.OpenResult, category apperr.ClassifiedErrorCategory, subject, secretRoot string) {
	t.Helper()
	if result.Status != appmodel.OpenStatusRefused || result.Error == nil || result.Error.Category != category || result.Category != category {
		t.Fatalf("link refusal = %+v, want %q", result, category)
	}
	if result.Error.SafeSubject != subject || result.Subject != subject {
		t.Fatalf("subjects = %q, %q; want %q", result.Error.SafeSubject, result.Subject, subject)
	}
	encoded, err := json.Marshal(struct {
		Error   *apperr.ClassifiedError `json:"error"`
		Failure apperr.Failure          `json:"failure"`
	}{result.Error, result.Failure})
	if err != nil || strings.Contains(string(encoded), secretRoot) {
		t.Fatalf("unsafe error serialization: %s (%v)", encoded, err)
	}
}

type previewLinkEmitter struct{}

func (previewLinkEmitter) EmitStatePatch(context.Context, apperr.AppStatePatch) error {
	return nil
}
