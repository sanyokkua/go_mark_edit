package application

import (
	"context"
	"fmt"
	"os"
	"os/exec"
	"strings"

	"github.com/sanyokkua/go_mark_edit/internal/apperr"
	"github.com/sanyokkua/go_mark_edit/internal/bridge"
	"github.com/sanyokkua/go_mark_edit/internal/logging"
)

// NewWindowLauncher starts another application process, optionally with a
// folder to open when that process initializes.
type NewWindowLauncher interface {
	Launch(folderPath string) error
}

type processNewWindowLauncher struct {
	logger *logging.Logger
}

const newWindowChildEnv = "GOMARKEDIT_NEW_WINDOW_CHILD"

// NewOSNewWindowLauncher returns the process launcher used by the desktop app.
func NewOSNewWindowLauncher(logger *logging.Logger) NewWindowLauncher {
	return processNewWindowLauncher{logger: logger}
}

func (launcher processNewWindowLauncher) Launch(folderPath string) error {
	executablePath, err := os.Executable()
	if err != nil {
		return err
	}

	var args []string
	if folderPath != "" {
		args = []string{folderPath}
	}
	command := exec.Command(executablePath, args...)
	for _, entry := range os.Environ() {
		if !strings.HasPrefix(entry, newWindowChildEnv+"=") {
			command.Env = append(command.Env, entry)
		}
	}
	command.Env = append(command.Env, newWindowChildEnv+"=1")
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

func newWindowRefusal() apperr.VoidResult {
	return bridge.Refused[apperr.VoidResult](
		apperr.ClassifiedSystemCommandFailure,
		"window",
		"A new window could not be opened.",
		apperr.RemediationRetry,
	)
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

// OpenStartupFolderFromArgs opens only the first startup argument when it
// names an existing directory. The caller invokes this after application
// initialization so startup arguments never restore persisted session state.
func OpenStartupFolderFromArgs(args []string, openWorkspace func(string) apperr.WorkspaceOutcome) apperr.WorkspaceOutcome {
	if len(args) == 0 || args[0] == "" || openWorkspace == nil {
		return apperr.WorkspaceOutcome{}
	}

	info, err := os.Stat(args[0])
	if err != nil || !info.IsDir() {
		return apperr.WorkspaceOutcome{}
	}

	return openWorkspace(args[0])
}

func firstStartupFolderArgument(args []string) string {
	if len(args) == 0 {
		return ""
	}
	return args[0]
}

// OpenPendingStartupFolder consumes and opens the explicit startup argument
// after application initialization. The in-memory argument is never restored
// from persisted state and is consumed even when opening it is refused.
func (holder *ApplicationContextHolder) OpenPendingStartupFolder(ctx context.Context) apperr.WorkspaceOutcome {
	holder.mu.Lock()
	folderPath := holder.pendingStartupFolderPath
	holder.pendingStartupFolderPath = ""
	service := holder.AppModelService
	logger := holder.appLogger
	holder.mu.Unlock()
	if folderPath == "" {
		return apperr.WorkspaceOutcome{}
	}

	result := OpenStartupFolderFromArgs([]string{folderPath}, func(path string) apperr.WorkspaceOutcome {
		return service.OpenWorkspace(ctx, path)
	})
	if result.Status == apperr.WorkspaceStatusRefused && logger != nil {
		zlog := logger.Zerolog()
		zlog.Warn().
			Str("category", string(result.Category)).
			Str("subject", result.Subject).
			Msg("startup folder could not be opened")
	}
	return result
}
