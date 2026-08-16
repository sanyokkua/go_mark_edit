package file

import (
	"errors"
	"fmt"
	"io/fs"
	"os"
	"reflect"
	"strings"
)

// DiskVersion is the portable filesystem baseline used to detect external changes.
// FileIdentity is empty when the host does not expose a stable identity through FileInfo.Sys.
type DiskVersion struct {
	Exists           bool
	Size             int64
	ModifiedUnixNano int64
	Mode             fs.FileMode
	FileIdentity     string
}

// Equal compares every characteristic that can affect a safe write or external-change decision.
func (version DiskVersion) Equal(other DiskVersion) bool {
	return version.Exists == other.Exists &&
		version.Size == other.Size &&
		version.ModifiedUnixNano == other.ModifiedUnixNano &&
		version.Mode == other.Mode &&
		version.FileIdentity == other.FileIdentity
}

// CurrentDiskVersion stats path and returns an absent version for a missing target. Other stat
// failures remain errors so permission and I/O failures cannot be mistaken for deletion.
func CurrentDiskVersion(path string) (DiskVersion, error) {
	if strings.TrimSpace(path) == "" {
		return DiskVersion{}, errors.New("disk version path is empty")
	}

	info, err := os.Stat(path)
	if err != nil {
		if errors.Is(err, fs.ErrNotExist) {
			return DiskVersion{}, nil
		}
		return DiskVersion{}, fmt.Errorf("stat disk version %q: %w", path, err)
	}
	return newDiskVersion(info), nil
}

func newDiskVersion(info fs.FileInfo) DiskVersion {
	return DiskVersion{
		Exists:           true,
		Size:             info.Size(),
		ModifiedUnixNano: info.ModTime().UnixNano(),
		Mode:             info.Mode().Perm(),
		FileIdentity:     portableFileIdentity(info),
	}
}

func portableFileIdentity(info fs.FileInfo) string {
	value := reflect.ValueOf(info.Sys())
	for value.IsValid() && (value.Kind() == reflect.Pointer || value.Kind() == reflect.Interface) {
		if value.IsNil() {
			return ""
		}
		value = value.Elem()
	}
	if !value.IsValid() || value.Kind() != reflect.Struct {
		return ""
	}

	if device, hasDevice := uintField(value, "Dev"); hasDevice {
		if inode, hasInode := uintField(value, "Ino"); hasInode {
			return fmt.Sprintf("device:%d:inode:%d", device, inode)
		}
	}

	// Windows exposes the same stable identity as a volume serial plus a 64-bit file index.
	volume, hasVolume := uintField(value, "VolumeSerialNumber")
	high, hasHigh := uintField(value, "FileIndexHigh")
	low, hasLow := uintField(value, "FileIndexLow")
	if hasVolume && hasHigh && hasLow {
		return fmt.Sprintf("volume:%d:index:%d", volume, high<<32|low)
	}
	return ""
}
