//go:build !windows

package file

import (
	"fmt"
	"os"
	"reflect"
)

func diskFileIdentity(identity Identity) string {
	if identity.Path != "" {
		return ""
	}
	return fmt.Sprintf("device:%d:inode:%d", identity.Device, identity.Inode)
}

func statWithIdentity(path string) (os.FileInfo, Identity, error) {
	info, err := os.Stat(path)
	if err != nil {
		return nil, Identity{}, err
	}
	return info, filesystemIdentity(path, info), nil
}

func filesystemIdentity(path string, info os.FileInfo) Identity {
	value := reflect.ValueOf(info.Sys())
	if value.IsValid() {
		if value.Kind() == reflect.Pointer {
			if value.IsNil() {
				value = reflect.Value{}
			} else {
				value = value.Elem()
			}
		}
		if value.IsValid() && value.Kind() == reflect.Struct {
			dev, hasDev := integerField(value, "Dev")
			ino, hasIno := uintField(value, "Ino")
			if hasDev && hasIno {
				return Identity{Device: dev, Inode: ino}
			}
		}
	}
	return Identity{Path: "path:" + path}
}

func integerField(value reflect.Value, name string) (int64, bool) {
	field := value.FieldByName(name)
	if !field.IsValid() {
		return 0, false
	}
	if field.CanInt() {
		return field.Int(), true
	}
	if field.CanUint() {
		unsigned := field.Uint()
		if unsigned > ^uint64(0)>>1 {
			return 0, false
		}
		return int64(unsigned), true
	}
	return 0, false
}

func uintField(value reflect.Value, name string) (uint64, bool) {
	field := value.FieldByName(name)
	if !field.IsValid() || !field.CanUint() {
		return 0, false
	}
	return field.Uint(), true
}
