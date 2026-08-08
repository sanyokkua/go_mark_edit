//go:build windows

package file

import (
	"os/exec"
	"path/filepath"
)

type platformRevealPort struct{}

func (platformRevealPort) Reveal(path string) error {
	return exec.Command("explorer", "/select,", filepath.Clean(path)).Run()
}
