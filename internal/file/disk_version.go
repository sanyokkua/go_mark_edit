package file

import (
	"errors"
	"fmt"
	"io/fs"
	"strings"
)

// DiskVersion is the portable filesystem baseline used to detect external changes.
// FileIdentity is empty when the host does not expose a stable identity through its filesystem metadata.
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

	info, identity, err := statWithIdentity(path)
	if err != nil {
		if errors.Is(err, fs.ErrNotExist) {
			return DiskVersion{}, nil
		}
		return DiskVersion{}, fmt.Errorf("stat disk version %q: %w", path, err)
	}
	return newDiskVersion(info, identity), nil
}

func newDiskVersion(info fs.FileInfo, identity Identity) DiskVersion {
	return DiskVersion{
		Exists:           true,
		Size:             info.Size(),
		ModifiedUnixNano: info.ModTime().UnixNano(),
		Mode:             info.Mode().Perm(),
		FileIdentity:     diskFileIdentity(identity),
	}
}
