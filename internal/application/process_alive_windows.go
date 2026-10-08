//go:build windows

package application

import "os"

// processAlive reports whether a process with pid exists: on Windows
// FindProcess fails for a pid that is not running.
func processAlive(pid int) bool {
	process, err := os.FindProcess(pid)
	if err != nil {
		return false
	}
	_ = process.Release()
	return true
}
