package file

import (
	"fmt"
	"io"
	"os"
	"path/filepath"
	"testing"
)

const (
	fixtureSize2MiB       int64 = 2_097_152
	fixtureSize2MiBPlus1  int64 = 2_097_153
	fixtureSize10MiB      int64 = 10_485_760
	fixtureSize10MiBPlus1 int64 = 10_485_761
	fixtureSize50MiB      int64 = 52_428_800
	fixtureSize50MiBPlus1 int64 = 52_428_801
)

// documentFixture describes a temporary input shared by the file-package tests. The fixture
// builders deliberately retain paths and metadata rather than large byte slices so size cases do
// not multiply their memory footprint when a later test requests the complete set.
type documentFixture struct {
	Name        string
	Path        string
	Size        int64
	LineEnding  string
	Encoding    string
	Mode        os.FileMode
	SymlinkPath string
}

type documentFixtureSet struct {
	Root  string
	Files map[string]documentFixture
	Sizes map[int64]documentFixture
}

// buildDocumentFixtures creates all bounded, temporary inputs required by real-file tests. The
// returned paths are valid only for the current test and are removed by testing.T.TempDir.
func buildDocumentFixtures(t *testing.T) documentFixtureSet {
	t.Helper()
	root := t.TempDir()
	set := documentFixtureSet{
		Root:  root,
		Files: make(map[string]documentFixture),
		Sizes: make(map[int64]documentFixture),
	}

	write := func(name string, data []byte, mode os.FileMode, lineEnding, encoding string) documentFixture {
		t.Helper()
		path := filepath.Join(root, name)
		if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
			t.Fatalf("create fixture directory for %q: %v", name, err)
		}
		if err := os.WriteFile(path, data, mode); err != nil {
			t.Fatalf("write fixture %q: %v", name, err)
		}
		if err := os.Chmod(path, mode); err != nil {
			t.Fatalf("chmod fixture %q: %v", name, err)
		}
		return documentFixture{
			Name:       name,
			Path:       path,
			Size:       int64(len(data)),
			LineEnding: lineEnding,
			Encoding:   encoding,
			Mode:       mode,
		}
	}

	add := func(fixture documentFixture) {
		set.Files[fixture.Name] = fixture
	}

	add(write("line-endings/uniform-lf.md", []byte("first\nsecond\n"), 0o644, "lf", "utf-8"))
	add(write("line-endings/uniform-crlf.md", []byte("first\r\nsecond\r\n"), 0o644, "crlf", "utf-8"))
	add(write("line-endings/mixed-dominant-lf.md", []byte("first\nsecond\nthird\r\n"), 0o644, "mixed-lf-dominant", "utf-8"))
	add(write("line-endings/mixed-tie-first-crlf.md", []byte("first\r\nsecond\n"), 0o644, "mixed-tie-first-crlf", "utf-8"))
	add(write("line-endings/none.md", []byte("one line without a terminator"), 0o644, "none", "utf-8"))
	add(write("line-endings/lone-cr.md", []byte("first\rsecond"), 0o644, "lone-cr", "utf-8"))
	add(write("line-endings/unicode-separators.md", []byte("NEL\xC2\x85LS\xE2\x80\xA8PS\xE2\x80\xA9"), 0o644, "none", "utf-8"))

	utf8BOM := append([]byte{0xEF, 0xBB, 0xBF}, []byte("bom\n")...)
	add(write("encoding/utf8-bom.md", utf8BOM, 0o644, "lf", "utf-8-bom"))
	add(write("encoding/utf8.md", []byte("plain utf-8\n"), 0o644, "lf", "utf-8"))
	add(write("encoding/invalid-utf8.md", []byte{'i', 'n', 'v', 0xff, 0xfe, 'l', 'i', 'd'}, 0o644, "none", "invalid-utf8"))
	add(write("encoding/nul-bearing.md", []byte{'a', 0, 'b', '\n'}, 0o644, "lf", "nul"))
	add(write("permissions/non-default-mode.md", []byte("mode\n"), 0o640, "lf", "utf-8"))

	duplicateA := write("duplicates/one/note.md", []byte("one\n"), 0o644, "lf", "utf-8")
	duplicateB := write("duplicates/two/note.md", []byte("two\n"), 0o644, "lf", "utf-8")
	add(duplicateA)
	add(duplicateB)
	add(write("parents/alpha/shared/note.md", []byte("alpha\n"), 0o644, "lf", "utf-8"))
	add(write("parents/beta/shared/note.md", []byte("beta\n"), 0o644, "lf", "utf-8"))

	hostileName := "hostile-\x01-\x1f-\x7f-\u202a-\u202e-\u2066-\u2069.md"
	add(write(filepath.Join("path-shapes", hostileName), []byte("hostile\n"), 0o644, "lf", "utf-8"))

	for _, size := range []int64{
		fixtureSize2MiB,
		fixtureSize2MiBPlus1,
		fixtureSize10MiB,
		fixtureSize10MiBPlus1,
		fixtureSize50MiB,
		fixtureSize50MiBPlus1,
	} {
		name := fmt.Sprintf("sizes/%d-bytes.md", size)
		path := filepath.Join(root, name)
		if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
			t.Fatalf("create size fixture directory for %d: %v", size, err)
		}
		if err := writeSizedFixture(path, size, 0o644); err != nil {
			t.Fatalf("write size fixture %d: %v", size, err)
		}
		fixture := documentFixture{Name: name, Path: path, Size: size, Mode: 0o644, Encoding: "binary"}
		set.Sizes[size] = fixture
		set.Files[name] = fixture
	}

	aliasTarget := filepath.Join(root, duplicateA.Name)
	aliasPath := filepath.Join(root, "path-shapes", "symlink-alias.md")
	if err := os.Symlink(aliasTarget, aliasPath); err != nil {
		t.Fatalf("create symlink alias: %v", err)
	}
	alias := set.Files[duplicateA.Name]
	alias.SymlinkPath = aliasPath
	set.Files["path-shapes/symlink-alias.md"] = alias

	return set
}

func writeSizedFixture(path string, size int64, mode os.FileMode) error {
	file, err := os.OpenFile(path, os.O_CREATE|os.O_TRUNC|os.O_WRONLY, mode)
	if err != nil {
		return err
	}
	defer func() {
		_ = file.Close()
	}()

	const chunkSize int64 = 64 * 1024
	chunk := make([]byte, chunkSize)
	for written := int64(0); written < size; {
		want := size - written
		if want > chunkSize {
			want = chunkSize
		}
		n, writeErr := file.Write(chunk[:want])
		written += int64(n)
		if writeErr != nil {
			return writeErr
		}
		if n == 0 {
			return io.ErrShortWrite
		}
	}
	return file.Chmod(mode)
}

// TestDocumentFixtureBytesAndBounds proves every exact binary boundary is generated at the
// requested byte count and remains temporary. The same builder is consumed by later file tests.
func TestDocumentFixtureBytesAndBounds(t *testing.T) {
	fixtures := buildDocumentFixtures(t)
	wantSizes := []int64{
		fixtureSize2MiB,
		fixtureSize2MiBPlus1,
		fixtureSize10MiB,
		fixtureSize10MiBPlus1,
		fixtureSize50MiB,
		fixtureSize50MiBPlus1,
	}
	for _, want := range wantSizes {
		fixture := fixtures.Sizes[want]
		info, err := os.Stat(fixture.Path)
		if err != nil {
			t.Fatalf("stat %d-byte fixture: %v", want, err)
		}
		if info.Size() != want {
			t.Errorf("fixture %q size = %d, want %d", fixture.Name, info.Size(), want)
		}
	}

	if fixtures.Files["line-endings/none.md"].Size == 0 {
		t.Fatal("none fixture must contain valid UTF-8 content")
	}
	if fixtures.Files["permissions/non-default-mode.md"].Mode.Perm() == 0o644 {
		t.Fatal("permission fixture must use a non-default mode")
	}
	permissionInfo, err := os.Stat(fixtures.Files["permissions/non-default-mode.md"].Path)
	if err != nil {
		t.Fatalf("stat permission fixture: %v", err)
	}
	if permissionInfo.Mode().Perm() != 0o640 {
		t.Fatalf("permission fixture mode = %o, want %o", permissionInfo.Mode().Perm(), 0o640)
	}
	if fixtures.Files["path-shapes/symlink-alias.md"].SymlinkPath == "" {
		t.Fatal("symlink alias metadata is missing")
	}
	if _, err := os.Lstat(fixtures.Files["path-shapes/symlink-alias.md"].SymlinkPath); err != nil {
		t.Fatalf("stat symlink alias: %v", err)
	}
}
