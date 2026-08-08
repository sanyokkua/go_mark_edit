//go:build windows

package file

import (
	"syscall"
	"unsafe"
)

const replaceFileWriteThrough = 0x00000001

var (
	kernel32     = syscall.NewLazyDLL("kernel32.dll")
	replaceFileW = kernel32.NewProc("ReplaceFileW")
)

// replaceAtomicFile replaces an existing target with the temporary file using
// Windows' replace-existing API. ReplaceFileW takes the replaced path first
// and the replacement path second.
func replaceAtomicFile(temporaryPath, targetPath string) error {
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

// syncParentDirectory is intentionally a no-op on Windows. ReplaceFileW with
// REPLACEFILE_WRITE_THROUGH supplies the platform commit barrier used by the
// common replacement algorithm; Windows has no portable directory fsync hook.
func syncParentDirectory(_ string) error {
	return nil
}
