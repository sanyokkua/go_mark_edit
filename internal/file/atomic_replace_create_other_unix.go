//go:build dragonfly || freebsd || netbsd || openbsd || solaris

package file

import "syscall"

func createAtomicFileExclusive(temporary, target string) error {
	return syscall.ENOSYS
}
