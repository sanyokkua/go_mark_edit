package packaging_test

import (
	"encoding/xml"
	"io"
	"os"
	"path/filepath"
	"regexp"
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

// nsiCall is one registry instruction of project.nsi: the command and its
// arguments with their quotes removed.
type nsiCall struct {
	Command string
	Args    []string
}

var nsiToken = regexp.MustCompile(`"[^"]*"|'[^']*'|\S+`)

// nsiMacroCalls returns the registry instructions inside the named macro.
func nsiMacroCalls(t *testing.T, lines []string, macro string) []nsiCall {
	t.Helper()
	var calls []nsiCall
	inside := false
	found := false
	for _, line := range lines {
		trimmed := strings.TrimSpace(line)
		switch {
		case trimmed == "!macro "+macro:
			inside, found = true, true
		case trimmed == "!macroend":
			inside = false
		case inside:
			tokens := nsiToken.FindAllString(trimmed, -1)
			if len(tokens) == 0 || strings.HasPrefix(trimmed, "#") {
				continue
			}
			call := nsiCall{Command: tokens[0]}
			for _, token := range tokens[1:] {
				if quote := token[0]; (quote == '"' || quote == '\'') && len(token) >= 2 {
					token = token[1 : len(token)-1]
				}
				call.Args = append(call.Args, token)
			}
			calls = append(calls, call)
		}
	}
	if !found {
		t.Fatalf("project.nsi does not define macro %s", macro)
	}
	return calls
}

func TestWindowsInstallerRegistersOpenWithWithoutTakingDefaults(t *testing.T) {
	path := filepath.Join("..", "..", "..", "..", "build", "windows", "installer", "project.nsi")
	raw, err := os.ReadFile(path)
	if err != nil {
		t.Fatalf("read %s: %v", path, err)
	}
	text := string(raw)
	lines := strings.Split(text, "\n")

	if strings.Contains(text, "wails.associateFiles") || strings.Contains(text, "wails.unassociateFiles") {
		t.Error("project.nsi still uses wails.associateFiles/unassociateFiles, which take the file type defaults")
	}
	for _, macro := range []string{"gomarkedit.register", "gomarkedit.unregister"} {
		if !strings.Contains(text, "!insertmacro "+macro) {
			t.Errorf("project.nsi never inserts %s", macro)
		}
	}
	if !strings.Contains(text, "SHChangeNotify") {
		t.Error("project.nsi does not call SHChangeNotify to refresh Explorer")
	}

	register := nsiMacroCalls(t, lines, "gomarkedit.register")
	unregister := nsiMacroCalls(t, lines, "gomarkedit.unregister")

	progIDs := regexp.MustCompile(`^Software\\Classes\\(\.[^\\]+)\\OpenWithProgids$`)
	var progIDSuffixes, supportedSuffixes []string
	for _, call := range register {
		if call.Command != "WriteRegStr" || len(call.Args) < 3 {
			continue
		}
		key, name := call.Args[1], call.Args[2]
		if match := progIDs.FindStringSubmatch(key); match != nil {
			progIDSuffixes = append(progIDSuffixes, match[1])
		}
		if strings.HasSuffix(key, `\SupportedTypes`) {
			supportedSuffixes = append(supportedSuffixes, name)
		}
		if regexp.MustCompile(`^Software\\Classes\\\.[^\\]+$`).MatchString(key) && name == "" {
			t.Errorf("register writes the default value of %s, which takes the file type default", key)
		}
	}
	want := slices.Clone(file.SupportedDocumentSuffixes())
	slices.Sort(want)
	for label, got := range map[string][]string{"OpenWithProgids": progIDSuffixes, "SupportedTypes": supportedSuffixes} {
		slices.Sort(got)
		if !slices.Equal(got, want) {
			t.Errorf("%s suffixes = %v, want %v", label, got, want)
		}
	}

	verbCommands := map[string]string{
		`Software\Classes\Directory\shell\GoMarkEdit\command`:            `%1`,
		`Software\Classes\Directory\Background\shell\GoMarkEdit\command`: `%V`,
	}
	for key, placeholder := range verbCommands {
		seen := false
		for _, call := range register {
			if call.Command == "WriteRegStr" && len(call.Args) >= 4 && call.Args[1] == key {
				seen = true
				if !strings.HasSuffix(call.Args[3], `"`+placeholder+`"`) {
					t.Errorf("%s = %q, want it to end with %q", key, call.Args[3], `"`+placeholder+`"`)
				}
			}
		}
		if !seen {
			t.Errorf("register does not write %s", key)
		}
	}

	for _, call := range register {
		if call.Command != "WriteRegStr" || len(call.Args) < 3 {
			continue
		}
		key, name := call.Args[1], call.Args[2]
		removed := false
		for _, undo := range unregister {
			if len(undo.Args) < 2 || undo.Args[0] != call.Args[0] {
				continue
			}
			switch undo.Command {
			case "DeleteRegValue":
				removed = removed || (undo.Args[1] == key && len(undo.Args) > 2 && undo.Args[2] == name)
			case "DeleteRegKey":
				removed = removed || key == undo.Args[1] || strings.HasPrefix(key, undo.Args[1]+`\`)
			}
		}
		if !removed {
			t.Errorf("unregister does not remove %s [%q] written by register", key, name)
		}
	}
}
