package file

import (
	"errors"
	"io/fs"
	"os"
	"syscall"
)

// atomicCreateOps are the system calls that move a prepared temporary file onto
// an absent target without replacing a file that appeared after the preceding
// disk check.
type atomicCreateOps struct {
	exclusive func(string, string) error
	link      func(string, string) error
	remove    func(string) error
	lstat     func(string) (fs.FileInfo, error)
	rename    func(string, string) error
}

func defaultAtomicCreateOps() atomicCreateOps {
	return atomicCreateOps{
		exclusive: createAtomicFileExclusive,
		link:      os.Link,
		remove:    os.Remove,
		lstat:     os.Lstat,
		rename:    os.Rename,
	}
}

// createAtomicFile moves a prepared temporary file onto an absent target and
// fails with fs.ErrExist instead of replacing a file that appeared after the
// preceding disk check.
func createAtomicFile(temporary, target string) error {
	return createAtomicFileWithOps(temporary, target, defaultAtomicCreateOps())
}

// createAtomicFileWithOps uses the platform's no-replace move. A filesystem
// without it falls back to link(2), which never replaces an existing name, and
// a filesystem without hard links falls back to an existence check plus
// rename, the narrowest guard it permits. Any other failure, including a
// permission refusal, is returned without another attempt.
func createAtomicFileWithOps(temporary, target string, ops atomicCreateOps) error {
	err := ops.exclusive(temporary, target)
	if err == nil || !filesystemLacksExclusiveRename(err) {
		return err
	}
	linkErr := ops.link(temporary, target)
	if linkErr == nil {
		// The target already holds the new content, so the write is
		// committed. A temporary name that cannot be removed is only a
		// second name for the same file and is left behind.
		_ = ops.remove(temporary)
		return nil
	}
	if !filesystemLacksHardLinks(linkErr) {
		return linkErr
	}
	if _, statErr := ops.lstat(target); statErr == nil {
		return &os.LinkError{Op: "rename", Old: temporary, New: target, Err: fs.ErrExist}
	} else if !errors.Is(statErr, fs.ErrNotExist) {
		return statErr
	}
	return ops.rename(temporary, target)
}

// filesystemLacksExclusiveRename reports that the no-replace move is not
// available on the target's filesystem. EPERM is a permission refusal there,
// not a missing capability.
func filesystemLacksExclusiveRename(err error) bool {
	return errors.Is(err, syscall.ENOSYS) || errors.Is(err, syscall.EINVAL) || errors.Is(err, syscall.ENOTSUP)
}

// filesystemLacksHardLinks reports that link(2) is not available on the
// target's filesystem. link(2) documents EPERM as "the filesystem does not
// support hard links"; a real permission refusal also fails the rename that
// follows, so it is still reported.
func filesystemLacksHardLinks(err error) bool {
	return filesystemLacksExclusiveRename(err) || errors.Is(err, syscall.EPERM)
}
