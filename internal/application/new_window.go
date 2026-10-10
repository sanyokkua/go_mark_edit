package application

import (
	"context"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"time"

	"github.com/sanyokkua/go_mark_edit/internal/apperr"
	"github.com/sanyokkua/go_mark_edit/internal/bridge"
	"github.com/sanyokkua/go_mark_edit/internal/logging"
)

// NewWindowLauncher starts another application process, optionally with a file
// or folder to open when that process initializes.
type NewWindowLauncher interface {
	Launch(targetPath string) error
}

type processNewWindowLauncher struct {
	logger *logging.Logger
}

// NewOSNewWindowLauncher returns the process launcher used by the desktop app.
func NewOSNewWindowLauncher(logger *logging.Logger) NewWindowLauncher {
	return processNewWindowLauncher{logger: logger}
}

func (launcher processNewWindowLauncher) Launch(targetPath string) error {
	executablePath, err := os.Executable()
	if err != nil {
		return err
	}

	var args []string
	if targetPath != "" {
		args = []string{targetPath}
	}
	command := exec.Command(executablePath, args...)
	if err := command.Start(); err != nil {
		return err
	}
	if command.Process != nil {
		// Start has already created the window. A Release error cannot be
		// reported as a launch failure without risking a duplicate on retry.
		if err := command.Process.Release(); err != nil && launcher.logger != nil {
			logger := launcher.logger.Zerolog()
			logger.Warn().Msg("started application process handle could not be released")
		}
	}
	return nil
}

const newWindowFailureMessage = "A new window could not be opened."

func newWindowRefusal() apperr.VoidResult {
	return bridge.Refused[apperr.VoidResult](
		apperr.ClassifiedSystemCommandFailure,
		"window",
		newWindowFailureMessage,
		apperr.RemediationRetry,
	)
}

// newWindowFailureEvent is the state:error payload for a launch that failed
// outside any command: a classified error carries the message and Retry that a
// void result's generic wire error does not.
func newWindowFailureEvent() apperr.WireError {
	return apperr.ClassifiedToWire(bridge.ClassifiedWithID(
		apperr.ClassifiedSystemCommandFailure,
		"window",
		newWindowFailureMessage,
		apperr.RemediationRetry,
		"",
	))
}

// NewWindowServiceAPI is the host capability used by ApplicationHandler to
// start another independent application process.
type NewWindowServiceAPI interface {
	LaunchNewWindow(context.Context, string) error
}

// LaunchNewWindow delegates process creation to the launcher injected at
// construction time.
func (holder *ApplicationContextHolder) LaunchNewWindow(_ context.Context, folderPath string) error {
	if holder.newWindowLauncher == nil {
		return fmt.Errorf("new-window launcher is unavailable")
	}
	return holder.newWindowLauncher.Launch(folderPath)
}

// firstStartupPath returns the first argument that names a path: not empty and
// not a flag such as the -psn_ argument macOS adds. It is made absolute against
// the working directory because the window opens it after startup.
func firstStartupPath(args []string) string {
	for _, arg := range args {
		if arg == "" || strings.HasPrefix(arg, "-") {
			continue
		}
		if absolute, err := filepath.Abs(arg); err == nil {
			return absolute
		}
		return arg
	}
	return ""
}

// AcceptOpenRequest routes a path that arrived from argv or the operating
// system. A window that is still starting keeps the first one for the frontend
// to take; every other path starts a new application process, whatever the
// window currently shows. The launcher and the event emitter run outside the
// holder mutex.
func (holder *ApplicationContextHolder) AcceptOpenRequest(path string) {
	if path == "" {
		return
	}
	holder.mu.Lock()
	if holder.startupOpen && !holder.targetAccepted {
		holder.targetAccepted = true
		holder.launchTarget = path
		holder.ownTarget = path
		holder.mu.Unlock()
		return
	}
	ctx := holder.ctx
	emit := holder.emitEvent
	logger := holder.appLogger
	windows := holder.windows
	suppressed := holder.suppressDuplicateLocked(path)
	holder.mu.Unlock()

	// A window never opens another one for its own path or for a path another
	// live window already shows. macOS reports the path in a spawned window's
	// argv again as a file-open event, so without this check each new window
	// started the next one without end.
	if suppressed || windows.IsOpen(path) {
		return
	}
	if windows.Count() >= MaxWindows {
		if ctx != nil && emit != nil {
			emit(ctx, bridge.EventStateError, windowLimitEvent())
		}
		return
	}

	if err := holder.LaunchNewWindow(ctx, path); err != nil {
		if logger != nil {
			zlog := logger.Zerolog()
			zlog.Warn().
				Str("category", string(apperr.ClassifiedSystemCommandFailure)).
				Msg("new application window could not be opened for an external path")
		}
		if ctx != nil && emit != nil {
			emit(ctx, bridge.EventStateError, newWindowFailureEvent())
		}
	}
}

// recentLaunchWindow is how long a path counts as "being opened" after a window
// was started for it, which covers the time before that window registers.
const recentLaunchWindow = 10 * time.Second

// suppressDuplicateLocked reports whether path is this window's own target or
// was just launched, and otherwise records the launch. The caller holds
// holder.mu.
func (holder *ApplicationContextHolder) suppressDuplicateLocked(path string) bool {
	key := normalizeWindowTarget(path)
	if holder.ownTarget != "" && normalizeWindowTarget(holder.ownTarget) == key {
		return true
	}
	now := time.Now()
	for known, at := range holder.recentLaunches {
		if now.Sub(at) > recentLaunchWindow {
			delete(holder.recentLaunches, known)
		}
	}
	if _, recent := holder.recentLaunches[key]; recent {
		return true
	}
	holder.recentLaunches[key] = now
	return false
}

const windowLimitMessage = "Too many GoMarkEdit windows are open."

// windowLimitEvent is the state:error payload for a window that was not opened
// because MaxWindows windows are already open. Retry would not help.
func windowLimitEvent() apperr.WireError {
	return apperr.ClassifiedToWire(bridge.ClassifiedWithID(
		apperr.ClassifiedSystemCommandFailure,
		"window",
		windowLimitMessage,
		apperr.RemediationNone,
		"",
	))
}

// TakeLaunchTarget removes and returns the path this window accepted at
// startup, or an empty result when there is none or it was already taken.
func (holder *ApplicationContextHolder) TakeLaunchTarget(_ context.Context) apperr.LaunchTargetResult {
	holder.mu.Lock()
	path := holder.launchTarget
	holder.launchTarget = ""
	holder.mu.Unlock()
	if path == "" {
		return apperr.LaunchTargetResult{}
	}

	kind := "file"
	if info, err := os.Stat(path); err == nil && info.IsDir() {
		kind = "folder"
	}
	return apperr.LaunchTargetResult{Path: path, Kind: kind}
}
