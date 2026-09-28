//go:build !dev

package bootstrap

// IsDevBuild reports whether this binary was compiled for wails dev.
func IsDevBuild() bool {
	return false
}
