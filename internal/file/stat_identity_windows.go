package file

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"syscall"
)

func statWithIdentity(path string) (os.FileInfo, Identity, error) {
	absolute, err := filepath.Abs(path)
	if err != nil {
		return nil, Identity{}, err
	}
	// CreateFile does not receive os.Stat's long-path normalization. Resolve
	// relative components before adding the extended drive or UNC prefix.
	name := filepath.Clean(absolute)
	if len(name) >= 248 && !strings.HasPrefix(name, `\\?\`) && !strings.HasPrefix(name, `\\.\`) {
		if strings.HasPrefix(name, `\\`) {
			name = `\\?\UNC\` + name[2:]
		} else {
			name = `\\?\` + name
		}
	}
	encoded, err := syscall.UTF16PtrFromString(name)
	if err != nil {
		return nil, Identity{}, &os.PathError{Op: "stat", Path: path, Err: err}
	}
	handle, err := syscall.CreateFile(encoded, 0,
		syscall.FILE_SHARE_READ|syscall.FILE_SHARE_WRITE|syscall.FILE_SHARE_DELETE,
		nil, syscall.OPEN_EXISTING, syscall.FILE_FLAG_BACKUP_SEMANTICS, 0)
	if err != nil {
		return nil, Identity{}, &os.PathError{Op: "stat", Path: path, Err: err}
	}
	file := os.NewFile(uintptr(handle), path)
	defer file.Close()
	info, err := file.Stat()
	if err != nil {
		return nil, Identity{}, err
	}
	var metadata syscall.ByHandleFileInformation
	if err := syscall.GetFileInformationByHandle(handle, &metadata); err != nil {
		return nil, Identity{}, &os.PathError{Op: "file identity", Path: path, Err: err}
	}
	return info, Identity{Device: int64(metadata.VolumeSerialNumber), Inode: uint64(metadata.FileIndexHigh)<<32 | uint64(metadata.FileIndexLow)}, nil
}

func diskFileIdentity(identity Identity) string {
	return fmt.Sprintf("volume:%d:index:%d", identity.Device, identity.Inode)
}
