//go:build darwin || dragonfly || freebsd || linux || netbsd || openbsd || solaris

package file_test

import (
	"os"
	"os/exec"
	"path/filepath"
	"testing"

	"github.com/sanyokkua/go_mark_edit/internal/file"
)

func TestAtomicReplaceNewModeRespectsStartupUmask(t *testing.T) {
	if target := os.Getenv("GOMARKEDIT_MODE_TARGET"); target != "" {
		result, err := file.AtomicReplace(file.AtomicReplaceRequest{TargetPath: target, Data: []byte("saved")})
		if err != nil || !result.Committed {
			t.Fatalf("replace: result=%+v err=%v", result, err)
		}
		info, err := os.Stat(target)
		if err != nil {
			t.Fatal(err)
		}
		if info.Mode().Perm() != result.Version.Mode.Perm() {
			t.Fatalf("committed mode %04o differs from result %04o", info.Mode().Perm(), result.Version.Mode.Perm())
		}
		return
	}
	for _, tc := range []struct {
		mask string
		want os.FileMode
	}{{"000", 0644}, {"002", 0644}, {"022", 0644}, {"027", 0640}, {"077", 0600}} {
		t.Run(tc.mask, func(t *testing.T) {
			target := filepath.Join(t.TempDir(), "new.md")
			cmd := exec.Command("sh", "-c", "umask "+tc.mask+`; exec "$1" -test.run '^TestAtomicReplaceNewModeRespectsStartupUmask$'`, "sh", os.Args[0])
			cmd.Env = append(os.Environ(), "GOMARKEDIT_MODE_TARGET="+target)
			if output, err := cmd.CombinedOutput(); err != nil {
				t.Fatalf("child: %v\n%s", err, output)
			}
			info, err := os.Stat(target)
			if err != nil {
				t.Fatal(err)
			}
			if got := info.Mode().Perm(); got != tc.want {
				t.Errorf("mode = %04o, want %04o", got, tc.want)
			}
		})
	}
}

func TestAtomicReplacePreservesExistingGroupWrite(t *testing.T) {
	target := filepath.Join(t.TempDir(), "existing.md")
	if err := os.WriteFile(target, []byte("before"), 0600); err != nil {
		t.Fatal(err)
	}
	if err := os.Chmod(target, 0664); err != nil {
		t.Fatal(err)
	}
	result, err := file.AtomicReplace(file.AtomicReplaceRequest{TargetPath: target, Data: []byte("after")})
	if err != nil || !result.Committed {
		t.Fatalf("replace: result=%+v err=%v", result, err)
	}
	info, err := os.Stat(target)
	if err != nil {
		t.Fatal(err)
	}
	if got := info.Mode().Perm(); got != 0664 {
		t.Fatalf("mode = %04o, want 0664", got)
	}
	if result.Version.Mode.Perm() != 0664 {
		t.Fatalf("result mode = %04o, want 0664", result.Version.Mode.Perm())
	}
}
