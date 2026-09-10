package application_test

import (
	"context"
	"os"
	"path/filepath"
	"testing"

	"github.com/sanyokkua/go_mark_edit/internal/apperr"
	"github.com/sanyokkua/go_mark_edit/internal/appmodel"
)

// Proves: FR-014
func TestOpenPreviewLinkEnforcesFolderAndDocumentPolicies(t *testing.T) {
	root := t.TempDir()
	outside := t.TempDir()
	source := filepath.Join(root, "source.md")
	child := filepath.Join(root, "child.markdown")
	unsupported := filepath.Join(root, "child.pdf")
	escaping := filepath.Join(root, "escaping.md")
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

	service := appmodel.NewAppModelServiceForHost(appmodel.WithEmitter(previewLinkEmitter{}))
	initial, err := service.GetState(context.Background())
	if err != nil {
		t.Fatalf("initial state: %v", err)
	}
	untitled := service.OpenPreviewLink(
		context.Background(),
		initial.Snapshot.ActiveDocumentID,
		"./child.markdown",
	)
	if untitled.Status != appmodel.OpenStatusRefused || untitled.Error == nil {
		t.Fatalf("untitled preview link = %+v, want refusal", untitled)
	}

	opened := service.OpenPath(context.Background(), source, initial.Snapshot.TabSetRevision)
	if opened.Status != appmodel.OpenStatusOpened {
		t.Fatalf("open source = %+v, want opened", opened)
	}

	for name, href := range map[string]string{
		"outside folder":  "../" + filepath.Base(filepath.Dir(outside)) + "/" + filepath.Base(outsideFile),
		"unsupported type": "./child.pdf",
		"symlink escape":   "./escaping.md",
	} {
		t.Run(name, func(t *testing.T) {
			result := service.OpenPreviewLink(context.Background(), opened.DocumentID, href)
			if result.Status != appmodel.OpenStatusRefused || result.Error == nil {
				t.Fatalf("OpenPreviewLink(%q) = %+v, want refusal", href, result)
			}
		})
	}

	valid := service.OpenPreviewLink(context.Background(), opened.DocumentID, "./child.markdown#section")
	if valid.Status != appmodel.OpenStatusOpened || valid.DocumentID == "" {
		t.Fatalf("valid preview link = %+v, want a new opened document", valid)
	}
}

type previewLinkEmitter struct{}

func (previewLinkEmitter) EmitStatePatch(context.Context, apperr.AppStatePatch) error {
	return nil
}
