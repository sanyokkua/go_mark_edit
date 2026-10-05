package file_test

import (
	"testing"

	"github.com/sanyokkua/go_mark_edit/internal/file"
)

func TestDecodeLinkTarget(t *testing.T) {
	cases := []struct {
		name, href, wantPath, wantReason string
		windows                          bool
	}{
		{"query and fragment", "./a.md?view=1#intro", "./a.md", "", false},
		{"encoded space", "My%20Notes.md#intro", "My Notes.md", "", false},
		{"encoded percent once", "a%2520b.md", "a%20b.md", "", false},
		{"bad short escape", "%", "", "decode", false},
		{"bad incomplete escape", "%2", "", "decode", false},
		{"bad hex escape", "%GG", "", "decode", false},
		{"empty", "", "", "empty", false},
		{"query only", "?view=1", "", "empty", false},
		{"fragment only", "#intro", "", "empty", false},
		{"slash UNC", "//server/share/a.md", "", "network", false},
		{"encoded slash UNC", "%2F%2Fserver/share/a.md", "", "network", true},
		{"backslash UNC", `\\server\share\a.md`, "", "network", false},
		{"encoded backslash UNC", `%5C%5Cserver%5Cshare%5Ca.md`, "", "network", true},
		{"mixed UNC slash backslash", `/\server/share/a.md`, "", "network", false},
		{"mixed UNC backslash slash", `\/server/share/a.md`, "", "network", true},
		{"device question", `\\?\C:\a.md`, "", "network", false},
		{"encoded device question", `%5C%5C%3F%5CC:%5Ca.md`, "", "network", true},
		{"device dot", `\\.\device\a.md`, "", "network", true},
		{"file scheme", "file:a.md", "", "scheme", false},
		{"mail scheme", "mailto:a@b", "", "scheme", true},
		{"https scheme", "https://example.com/a.md", "", "scheme", false},
		{"windows backslash drive", `C:\docs\a.md`, "C:/docs/a.md", "", true},
		{"windows encoded backslash drive", `C:%5Cdocs%5Ca.md`, "C:/docs/a.md", "", true},
		{"windows slash drive", "C:/docs/a.md", "C:/docs/a.md", "", true},
		{"windows backslash relative", `sub\b.md`, "sub/b.md", "", true},
		{"windows encoded backslash relative", `sub%5Cb.md`, "sub/b.md", "", true},
		{"windows slash relative", "sub/b.md", "sub/b.md", "", true},
		{"posix backslash drive", `C:\docs\a.md`, `C:\docs\a.md`, "", false},
		{"posix encoded backslash drive", `C:%5Cdocs%5Ca.md`, `C:\docs\a.md`, "", false},
		{"posix slash drive", "C:/docs/a.md", "C:/docs/a.md", "", false},
		{"posix backslash relative", `sub\b.md`, `sub\b.md`, "", false},
		{"posix encoded backslash relative", `sub%5Cb.md`, `sub\b.md`, "", false},
		{"local mount", "/Volumes/share/a.md", "/Volumes/share/a.md", "", false},
		{"mapped drive", `Z:\a.md`, "Z:/a.md", "", true},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			path, reason := file.DecodeLinkTarget(tc.href, tc.windows)
			if path != tc.wantPath || reason != tc.wantReason {
				t.Fatalf("DecodeLinkTarget(%q, %v) = (%q, %q), want (%q, %q)", tc.href, tc.windows, path, reason, tc.wantPath, tc.wantReason)
			}
		})
	}
}

func TestDecodeLinkTargetRejectsNetworkPrefixesOnEveryHostFlavor(t *testing.T) {
	for _, href := range []string{
		"//server/share/a.md", "%2F%2Fserver/share/a.md",
		`\\server\share\a.md`, `%5C%5Cserver%5Cshare%5Ca.md`,
		`/\server/share/a.md`, `\/server/share/a.md`,
		`\\?\C:\a.md`, `%5C%5C%3F%5CC:%5Ca.md`,
		`\\.\device\a.md`, `%5C%5C.%5Cdevice%5Ca.md`,
	} {
		for _, windows := range []bool{false, true} {
			path, reason := file.DecodeLinkTarget(href, windows)
			if path != "" || reason != "network" {
				t.Errorf("DecodeLinkTarget(%q, %v) = (%q, %q), want network refusal", href, windows, path, reason)
			}
		}
	}
}
