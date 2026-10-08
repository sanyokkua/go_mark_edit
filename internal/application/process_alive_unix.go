//go:build !windows

package application

import (
	"errors"
	"syscall"
)

// processAlive reports whether a process with pid exists. EPERM means it
// exists but belongs to another user.
func processAlive(pid int) bool {
	err := syscall.Kill(pid, 0)
	return err == nil || errors.Is(err, syscall.EPERM)
}
