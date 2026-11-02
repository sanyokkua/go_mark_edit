//go:build darwin || dragonfly || freebsd || linux || netbsd || openbsd || solaris

package file

import (
	"io/fs"
	"os"
	"syscall"
)

// Capture the inherited mask once before application goroutines start.
var startupUmask = func() int {
	mask := syscall.Umask(0)
	syscall.Umask(mask)
	return mask
}()

func atomicReplacementMode(expected DiskVersion) (fs.FileMode, bool) {
	if expected.Exists {
		return expected.Mode, true
	}
	return 0o644 &^ fs.FileMode(startupUmask), true
}

func replaceAtomicFile(temporary, target string) error {
	return os.Rename(temporary, target)
}

func syncParentDirectory(directory string) error {
	directoryFile, err := os.Open(directory)
	if err != nil {
		return err
	}
	syncErr := directoryFile.Sync()
	closeErr := directoryFile.Close()
	if syncErr != nil {
		return syncErr
	}
	return closeErr
}
