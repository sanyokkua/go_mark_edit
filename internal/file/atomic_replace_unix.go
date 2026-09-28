//go:build darwin || dragonfly || freebsd || linux || netbsd || openbsd || solaris

package file

import "os"

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
