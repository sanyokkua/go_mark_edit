//go:build darwin || linux

package file

import (
	"os/exec"
	"path/filepath"
)

type platformRevealPort struct{}

func (platformRevealPort) Reveal(path string) error {
	if filepath.Ext(path) != "" {
		if _, err := exec.LookPath("open"); err == nil {
			return exec.Command("open", "-R", path).Run()
		}
	}
	return exec.Command("xdg-open", filepath.Dir(path)).Run()
}
