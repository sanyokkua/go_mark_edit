//go:build !windows

package file_test

import (
	"context"
	"os"
	"os/exec"
	"path/filepath"
	"syscall"
	"testing"
	"time"

	. "github.com/sanyokkua/go_mark_edit/internal/file"
)

func TestFingerprintRejectsNamedPipeWithoutWaiting(t *testing.T) {
	if path := os.Getenv("GOMARKEDIT_TEST_FIFO"); path != "" {
		if _, err := AtomicReplace(AtomicReplaceRequest{TargetPath: path, Data: []byte("replacement")}); err == nil {
			t.Fatal("named pipe accepted")
		}
		return
	}
	path := filepath.Join(t.TempDir(), "pipe")
	if err := syscall.Mkfifo(path, 0o600); err != nil {
		t.Fatal(err)
	}
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()
	cmd := exec.CommandContext(ctx, os.Args[0], "-test.run=^TestFingerprintRejectsNamedPipeWithoutWaiting$")
	cmd.Env = append(os.Environ(), "GOMARKEDIT_TEST_FIFO="+path)
	output, err := cmd.CombinedOutput()
	if ctx.Err() != nil {
		t.Fatal("fingerprinting a named pipe blocked")
	}
	if err != nil {
		t.Fatalf("fingerprinting subprocess: %v: %s", err, output)
	}
}
