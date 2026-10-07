package application

import (
	"encoding/json"
	"os"
	"path/filepath"
	"runtime"
	"strconv"
	"strings"
)

// MaxWindows is the most GoMarkEdit windows (processes) that may be open at
// once. A new window is refused beyond it, so a defect can never open windows
// faster than the user can react.
const MaxWindows = 50

// WindowRegistry lists the live GoMarkEdit windows of the current user: one
// small file per process, named by its pid, that holds the file or folder the
// window was opened for. Files of processes that are gone are ignored and
// removed, so a crash needs no cleanup. Every method tolerates a nil receiver
// and a missing directory by reporting nothing open.
type WindowRegistry struct {
	dir string
	pid int
}

// NewWindowRegistry returns the registry stored in dir for the window that
// belongs to pid.
func NewWindowRegistry(dir string, pid int) *WindowRegistry {
	return &WindowRegistry{dir: dir, pid: pid}
}

// NewDefaultWindowRegistry returns the per-user registry of this process, or
// nil when the user cache directory is unknown.
func NewDefaultWindowRegistry() *WindowRegistry {
	cache, err := os.UserCacheDir()
	if err != nil || cache == "" {
		return nil
	}
	return NewWindowRegistry(filepath.Join(cache, "GoMarkEdit", "windows"), os.Getpid())
}

type windowEntry struct {
	PID    int    `json:"pid"`
	Target string `json:"target"`
}

// Register records this window with the file or folder it was opened for; an
// empty target registers a window opened for nothing.
func (registry *WindowRegistry) Register(target string) error {
	if registry == nil {
		return nil
	}
	if err := os.MkdirAll(registry.dir, 0o700); err != nil {
		return err
	}
	if target != "" {
		target = normalizeWindowTarget(target)
	}
	payload, err := json.Marshal(windowEntry{PID: registry.pid, Target: target})
	if err != nil {
		return err
	}
	return os.WriteFile(registry.entryPath(registry.pid), payload, 0o600)
}

// Unregister removes this window's entry.
func (registry *WindowRegistry) Unregister() {
	if registry == nil {
		return
	}
	_ = os.Remove(registry.entryPath(registry.pid))
}

// IsOpen reports whether a live window, this one included, was opened for path.
func (registry *WindowRegistry) IsOpen(path string) bool {
	want := normalizeWindowTarget(path)
	for _, entry := range registry.liveEntries() {
		if entry.Target != "" && entry.Target == want {
			return true
		}
	}
	return false
}

// Count returns the number of live windows.
func (registry *WindowRegistry) Count() int {
	return len(registry.liveEntries())
}

func (registry *WindowRegistry) entryPath(pid int) string {
	return filepath.Join(registry.dir, strconv.Itoa(pid)+".json")
}

func (registry *WindowRegistry) liveEntries() []windowEntry {
	if registry == nil {
		return nil
	}
	names, err := os.ReadDir(registry.dir)
	if err != nil {
		return nil
	}
	var live []windowEntry
	for _, name := range names {
		if name.IsDir() || !strings.HasSuffix(name.Name(), ".json") {
			continue
		}
		path := filepath.Join(registry.dir, name.Name())
		raw, err := os.ReadFile(path)
		if err != nil {
			continue
		}
		var entry windowEntry
		if json.Unmarshal(raw, &entry) != nil || entry.PID <= 0 {
			_ = os.Remove(path)
			continue
		}
		if !processAlive(entry.PID) {
			_ = os.Remove(path)
			continue
		}
		live = append(live, entry)
	}
	return live
}

// normalizeWindowTarget makes two spellings of one path compare equal: cleaned,
// symlinks resolved when the path exists, and case-folded where the file
// system is case-insensitive by default.
func normalizeWindowTarget(path string) string {
	path = filepath.Clean(path)
	if resolved, err := filepath.EvalSymlinks(path); err == nil {
		path = resolved
	}
	if runtime.GOOS == "darwin" || runtime.GOOS == "windows" {
		path = strings.ToLower(path)
	}
	return path
}
