//go:build darwin

package file

import "golang.org/x/sys/unix"

func createAtomicFileExclusive(temporary, target string) error {
	return unix.RenamexNp(temporary, target, unix.RENAME_EXCL)
}
