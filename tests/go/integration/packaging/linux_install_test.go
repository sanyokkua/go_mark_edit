package packaging_test

import (
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
	"testing"
)

func repoPath(parts ...string) string {
	return filepath.Join(append([]string{"..", "..", "..", ".."}, parts...)...)
}

func readFile(t *testing.T, path string) string {
	t.Helper()
	raw, err := os.ReadFile(path)
	if err != nil {
		t.Fatalf("read %s: %v", path, err)
	}
	return string(raw)
}

func copyFile(t *testing.T, from, to string, mode os.FileMode) {
	t.Helper()
	if err := os.WriteFile(to, []byte(readFile(t, from)), mode); err != nil {
		t.Fatalf("write %s: %v", to, err)
	}
}

// linuxInstall is a temporary build-output directory, HOME and stub PATH.
type linuxInstall struct {
	t       *testing.T
	out     string
	home    string
	stubs   string
	callLog string
}

func newLinuxInstall(t *testing.T) *linuxInstall {
	t.Helper()
	if runtime.GOOS == "windows" {
		t.Skip("the Linux install script needs a POSIX shell")
	}
	root := t.TempDir()
	env := &linuxInstall{
		t:       t,
		out:     filepath.Join(root, "bin"),
		home:    filepath.Join(root, "home"),
		stubs:   filepath.Join(root, "stubs"),
		callLog: filepath.Join(root, "calls.log"),
	}
	for _, dir := range []string{env.out, env.home, env.stubs} {
		if err := os.MkdirAll(dir, 0o755); err != nil {
			t.Fatal(err)
		}
	}
	entries, err := os.ReadDir(repoPath("build", "linux"))
	if err != nil {
		t.Fatalf("read build/linux: %v", err)
	}
	for _, entry := range entries {
		copyFile(t, repoPath("build", "linux", entry.Name()), filepath.Join(env.out, entry.Name()), 0o755)
	}
	copyFile(t, repoPath("build", "appicon.png"), filepath.Join(env.out, "appicon.png"), 0o644)
	if err := os.WriteFile(filepath.Join(env.out, "GoMarkEdit"), []byte("#!/bin/sh\nexit 0\n"), 0o755); err != nil {
		t.Fatal(err)
	}
	for _, name := range []string{"update-desktop-database", "update-mime-database", "xdg-mime"} {
		stub := "#!/bin/sh\necho \"" + name + " $*\" >> '" + env.callLog + "'\n"
		if err := os.WriteFile(filepath.Join(env.stubs, name), []byte(stub), 0o755); err != nil {
			t.Fatal(err)
		}
	}
	return env
}

func (e *linuxInstall) run(args ...string) (string, error) {
	e.t.Helper()
	cmd := exec.Command("/bin/sh", append([]string{filepath.Join(e.out, "install.sh")}, args...)...)
	cmd.Env = []string{
		"HOME=" + e.home,
		"PATH=" + e.stubs + ":/usr/bin:/bin",
	}
	output, err := cmd.CombinedOutput()
	return string(output), err
}

func (e *linuxInstall) mustRun(args ...string) {
	e.t.Helper()
	if output, err := e.run(args...); err != nil {
		e.t.Fatalf("install.sh %v: %v\n%s", args, err, output)
	}
}

func (e *linuxInstall) calls() string {
	raw, _ := os.ReadFile(e.callLog)
	return string(raw)
}

func (e *linuxInstall) files() map[string]string {
	e.t.Helper()
	data := filepath.Join(e.home, ".local", "share")
	return map[string]string{
		"binary":  filepath.Join(e.home, ".local", "bin", "GoMarkEdit"),
		"icon":    filepath.Join(data, "gomarkedit", "gomarkedit.png"),
		"desktop": filepath.Join(data, "applications", "gomarkedit.desktop"),
		"mime":    filepath.Join(data, "mime", "packages", "gomarkedit.xml"),
	}
}

func (e *linuxInstall) snapshot() map[string]string {
	e.t.Helper()
	got := map[string]string{}
	err := filepath.WalkDir(e.home, func(path string, d os.DirEntry, err error) error {
		if err != nil || d.IsDir() {
			return err
		}
		got[path] = readFile(e.t, path)
		return nil
	})
	if err != nil {
		e.t.Fatal(err)
	}
	return got
}

func TestLinuxInstallPlacesFilesAndRefreshesDatabases(t *testing.T) {
	env := newLinuxInstall(t)
	env.mustRun()

	files := env.files()
	for name, path := range files {
		if _, err := os.Stat(path); err != nil {
			t.Errorf("%s not installed: %v", name, err)
		}
	}
	info, err := os.Stat(files["binary"])
	if err == nil && info.Mode()&0o100 == 0 {
		t.Errorf("installed binary is not executable")
	}

	desktop := readFile(t, files["desktop"])
	if !strings.Contains(desktop, "\nExec=\""+files["binary"]+"\" %f\n") {
		t.Errorf("Exec is not the absolute installed binary with %%f:\n%s", desktop)
	}
	if !strings.Contains(desktop, "\nIcon="+files["icon"]+"\n") {
		t.Errorf("Icon is not the absolute installed icon:\n%s", desktop)
	}

	calls := env.calls()
	if !strings.Contains(calls, "update-desktop-database "+filepath.Dir(files["desktop"])) {
		t.Errorf("update-desktop-database was not run on the applications directory; calls:\n%s", calls)
	}
	if !strings.Contains(calls, "update-mime-database "+filepath.Dir(filepath.Dir(files["mime"]))) {
		t.Errorf("update-mime-database was not run on the mime directory; calls:\n%s", calls)
	}
	if strings.Contains(calls, "xdg-mime") {
		t.Errorf("xdg-mime must never be called (no default may be set); calls:\n%s", calls)
	}
	if _, err := os.Stat(filepath.Join(env.home, ".config", "mimeapps.list")); err == nil {
		t.Errorf("mimeapps.list must not be created")
	}
}

func TestLinuxInstallIsIdempotent(t *testing.T) {
	env := newLinuxInstall(t)
	env.mustRun()
	first := env.snapshot()
	env.mustRun()
	second := env.snapshot()
	if len(first) != len(second) {
		t.Fatalf("file set changed: %d then %d files", len(first), len(second))
	}
	for path, content := range first {
		if second[path] != content {
			t.Errorf("%s changed on the second install", path)
		}
	}
}

func TestLinuxUninstallRemovesEveryInstalledFile(t *testing.T) {
	env := newLinuxInstall(t)
	env.mustRun()
	if err := os.Remove(env.callLog); err != nil {
		t.Fatal(err)
	}
	env.mustRun("--uninstall")

	for name, path := range env.files() {
		if _, err := os.Stat(path); err == nil {
			t.Errorf("%s still installed after --uninstall", name)
		}
	}
	if left := env.snapshot(); len(left) != 0 {
		t.Errorf("files left after --uninstall: %v", left)
	}
	calls := env.calls()
	if !strings.Contains(calls, "update-desktop-database") || !strings.Contains(calls, "update-mime-database") {
		t.Errorf("databases were not refreshed on uninstall; calls:\n%s", calls)
	}
	env.mustRun("--uninstall")
}

func TestLinuxInstallRejectsUnknownOption(t *testing.T) {
	env := newLinuxInstall(t)
	_, err := env.run("--bogus")
	exitErr, ok := err.(*exec.ExitError)
	if !ok || exitErr.ExitCode() != 2 {
		t.Errorf("unknown option: err = %v, want exit status 2", err)
	}
}

func TestLinuxDesktopEntryListsTheSupportedMimeTypes(t *testing.T) {
	desktop := readFile(t, repoPath("build", "linux", "gomarkedit.desktop"))
	var mimeLine string
	for _, line := range strings.Split(desktop, "\n") {
		if strings.HasPrefix(line, "MimeType=") {
			mimeLine = line
		}
	}
	for _, mime := range []string{"text/markdown", "text/x-markdown", "text/plain", "inode/directory"} {
		if !strings.Contains(mimeLine, mime+";") {
			t.Errorf("MimeType= %q does not list %s", mimeLine, mime)
		}
	}
}

func TestLinuxMimeFileGlobsMarkdownSuffixes(t *testing.T) {
	xmlText := readFile(t, repoPath("build", "linux", "gomarkedit-mime.xml"))
	for _, glob := range []string{`pattern="*.md"`, `pattern="*.markdown"`, `pattern="*.mdown"`} {
		if !strings.Contains(xmlText, glob) {
			t.Errorf("MIME XML lacks %s", glob)
		}
	}
}

func TestLinuxInstallHandlesAHomeWithSpacesAndSpecialCharacters(t *testing.T) {
	env := newLinuxInstall(t)
	env.home = filepath.Join(filepath.Dir(env.home), "h a&b|c%d")
	if err := os.MkdirAll(env.home, 0o755); err != nil {
		t.Fatal(err)
	}
	env.mustRun()

	files := env.files()
	desktop := readFile(t, files["desktop"])
	if !strings.Contains(desktop, "\nExec=\""+strings.ReplaceAll(files["binary"], "%", "%%")+"\" %f\n") {
		t.Errorf("desktop entry does not quote and escape the Exec path:\n%s", desktop)
	}
	if !strings.Contains(desktop, "\nIcon="+files["icon"]+"\n") {
		t.Errorf("desktop entry has the wrong Icon:\n%s", desktop)
	}
	env.mustRun("--uninstall")
	if left := env.snapshot(); len(left) != 0 {
		t.Errorf("uninstall left files behind: %v", left)
	}
}
