//go:build darwin || dragonfly || freebsd || linux || netbsd || openbsd || solaris

package file

import (
	"errors"
	"io/fs"
	"os"
	"syscall"
)

// createAtomicFile moves a prepared temporary file onto an absent target and
// fails with fs.ErrExist instead of replacing a file that appeared after the
// preceding disk check.
func createAtomicFile(temporary, target string) error {
	err := createAtomicFileExclusive(temporary, target)
	if err == nil || !filesystemLacksExclusiveRename(err) {
		return err
	}
	return createAtomicFileByLink(temporary, target)
}

// createAtomicFileByLink uses link(2), which never replaces an existing name.
// Filesystems without hard links fall back to an existence check plus rename,
// the narrowest guard they permit.
func createAtomicFileByLink(temporary, target string) error {
	linkErr := os.Link(temporary, target)
	if linkErr == nil {
		return os.Remove(temporary)
	}
	if !filesystemLacksExclusiveRename(linkErr) {
		return linkErr
	}
	if _, statErr := os.Lstat(target); statErr == nil {
		return &os.LinkError{Op: "rename", Old: temporary, New: target, Err: fs.ErrExist}
	} else if !errors.Is(statErr, fs.ErrNotExist) {
		return statErr
	}
	return os.Rename(temporary, target)
}

func filesystemLacksExclusiveRename(err error) bool {
	return errors.Is(err, syscall.ENOSYS) || errors.Is(err, syscall.EINVAL) ||
		errors.Is(err, syscall.ENOTSUP) || errors.Is(err, syscall.EPERM)
}
