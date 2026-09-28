//go:build windows

package file

import (
	"errors"
	"io/fs"
	"os"
	"syscall"
	"unsafe"
)

const replaceFileWriteThrough = 0x00000001
const moveFileWriteThrough = 0x00000008

var (
	kernel32     = syscall.NewLazyDLL("kernel32.dll")
	replaceFileW = kernel32.NewProc("ReplaceFileW")
	moveFileExW  = kernel32.NewProc("MoveFileExW")
)

// replaceAtomicFile uses Windows' replace-existing API for a present target
// and a no-replace move when creating a target. ReplaceFileW takes the replaced
// path first and the replacement path second.
func replaceAtomicFile(temporaryPath, targetPath string) error {
	_, statErr := os.Lstat(targetPath)
	if statErr != nil && !errors.Is(statErr, fs.ErrNotExist) {
		return statErr
	}
	if errors.Is(statErr, fs.ErrNotExist) {
		return moveAtomicFile(temporaryPath, targetPath)
	}
	return replaceExistingAtomicFile(temporaryPath, targetPath)
}

func replaceExistingAtomicFile(temporaryPath, targetPath string) error {
	temporary, err := syscall.UTF16PtrFromString(temporaryPath)
	if err != nil {
		return err
	}
	target, err := syscall.UTF16PtrFromString(targetPath)
	if err != nil {
		return err
	}

	result, _, callErr := replaceFileW.Call(
		uintptr(unsafe.Pointer(target)),
		uintptr(unsafe.Pointer(temporary)),
		0,
		replaceFileWriteThrough,
		0,
		0,
	)
	if result != 0 {
		return nil
	}
	if callErr == syscall.Errno(0) {
		return syscall.EINVAL
	}
	return callErr
}

// moveAtomicFile creates an absent target without replacing one that appears
// after the preceding existence check. Omitting MOVEFILE_REPLACE_EXISTING
// makes the move itself enforce that no-overwrite guarantee.
func moveAtomicFile(temporaryPath, targetPath string) error {
	temporary, err := syscall.UTF16PtrFromString(temporaryPath)
	if err != nil {
		return err
	}
	target, err := syscall.UTF16PtrFromString(targetPath)
	if err != nil {
		return err
	}

	result, _, callErr := moveFileExW.Call(
		uintptr(unsafe.Pointer(temporary)),
		uintptr(unsafe.Pointer(target)),
		moveFileWriteThrough,
	)
	if result != 0 {
		return nil
	}
	if callErr == syscall.Errno(0) {
		return syscall.EINVAL
	}
	return callErr
}

// syncParentDirectory is intentionally a no-op on Windows. ReplaceFileW with
// REPLACEFILE_WRITE_THROUGH supplies the platform commit barrier used by the
// common replacement algorithm; Windows has no portable directory fsync hook.
func syncParentDirectory(_ string) error {
	return nil
}
