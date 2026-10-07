package packaging_test

import (
	"encoding/xml"
	"io"
	"os"
	"path/filepath"
	"slices"
	"strings"
	"testing"

	"github.com/sanyokkua/go_mark_edit/internal/file"
)

// plistNode is a generic element tree; Wails template lines ({{...}}) are
// character data and never appear as elements, so the walk ignores them.
type plistNode struct {
	Name     string
	Text     string
	Children []*plistNode
}

func parsePlist(t *testing.T, path string) *plistNode {
	t.Helper()
	raw, err := os.ReadFile(path)
	if err != nil {
		t.Fatalf("read %s: %v", path, err)
	}
	decoder := xml.NewDecoder(strings.NewReader(string(raw)))
	decoder.Strict = false
	root := &plistNode{}
	stack := []*plistNode{root}
	for {
		token, err := decoder.Token()
		if err == io.EOF {
			break
		}
		if err != nil {
			t.Fatalf("parse %s: %v", path, err)
		}
		top := stack[len(stack)-1]
		switch value := token.(type) {
		case xml.StartElement:
			node := &plistNode{Name: value.Name.Local}
			top.Children = append(top.Children, node)
			stack = append(stack, node)
		case xml.EndElement:
			stack = stack[:len(stack)-1]
		case xml.CharData:
			top.Text += strings.TrimSpace(string(value))
		}
	}
	return root
}

// dictValue returns the value element that follows the named key in a dict.
func dictValue(dict *plistNode, key string) *plistNode {
	for index, child := range dict.Children {
		if child.Name == "key" && child.Text == key && index+1 < len(dict.Children) {
			return dict.Children[index+1]
		}
	}
	return nil
}

func strings_(array *plistNode) []string {
	var values []string
	if array == nil {
		return values
	}
	for _, child := range array.Children {
		values = append(values, child.Text)
	}
	return values
}

func plists() []string {
	return []string{
		filepath.Join("..", "..", "..", "..", "build", "darwin", "Info.plist"),
		filepath.Join("..", "..", "..", "..", "build", "darwin", "Info.dev.plist"),
	}
}

func rootDict(t *testing.T, path string) *plistNode {
	t.Helper()
	root := parsePlist(t, path)
	plist := root.Children[len(root.Children)-1]
	if len(plist.Children) == 0 || plist.Children[0].Name != "dict" {
		t.Fatalf("%s has no top-level dict", path)
	}
	return plist.Children[0]
}

func TestMacOSBundlesDeclareExactlyTheSupportedSuffixesAndFolders(t *testing.T) {
	for _, path := range plists() {
		dict := rootDict(t, path)

		var suffixes []string
		folder := false
		documentTypes := dictValue(dict, "CFBundleDocumentTypes")
		if documentTypes == nil || len(documentTypes.Children) == 0 {
			t.Fatalf("%s declares no CFBundleDocumentTypes", path)
		}
		for _, entry := range documentTypes.Children {
			suffixes = append(suffixes, strings_(dictValue(entry, "CFBundleTypeExtensions"))...)
			if slices.Contains(strings_(dictValue(entry, "LSItemContentTypes")), "public.folder") {
				folder = true
			}
			if rank := dictValue(entry, "LSHandlerRank"); rank == nil || rank.Text != "Alternate" {
				t.Errorf("%s: a document type does not use LSHandlerRank Alternate (would claim a default)", path)
			}
		}

		imported := dictValue(dict, "UTImportedTypeDeclarations")
		if imported == nil || len(imported.Children) == 0 {
			t.Fatalf("%s declares no UTImportedTypeDeclarations", path)
		}
		for _, declaration := range imported.Children {
			if id := dictValue(declaration, "UTTypeIdentifier"); id == nil || id.Text != "net.daringfireball.markdown" {
				continue
			}
			spec := dictValue(declaration, "UTTypeTagSpecification")
			suffixes = append(suffixes, strings_(dictValue(spec, "public.filename-extension"))...)
		}

		got := map[string]bool{}
		for _, suffix := range suffixes {
			got["."+strings.TrimPrefix(suffix, ".")] = true
		}
		want := file.SupportedDocumentSuffixes()
		if len(got) != len(want) {
			t.Errorf("%s: declared suffixes %v, want %v", path, got, want)
		}
		for _, suffix := range want {
			if !got[suffix] {
				t.Errorf("%s: suffix %s is not declared", path, suffix)
			}
		}
		if !folder {
			t.Errorf("%s: no public.folder document type", path)
		}
		if minimum := dictValue(dict, "LSMinimumSystemVersion"); minimum == nil || minimum.Text != "11.0" {
			t.Errorf("%s: LSMinimumSystemVersion = %v, want 11.0", path, minimum)
		}
	}
}
