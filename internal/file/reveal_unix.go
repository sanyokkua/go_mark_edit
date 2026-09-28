//go:build darwin || linux

package file

import (
	"os/exec"
	"path/filepath"
	"runtime"
)

type platformRevealPort struct{}

func (platformRevealPort) Reveal(path string) error {
	if runtime.GOOS == "darwin" {
		return exec.Command("open", "-R", path).Run()
	}
	return exec.Command("xdg-open", filepath.Dir(path)).Run()
}
