package appmodel

import (
	"github.com/rs/zerolog"
	"github.com/sanyokkua/go_mark_edit/internal/file"
)

// AppModelOption configures one AppModelService at construction time. The
// constructor is used by the composition root; its value fields also keep
// deterministic test dependencies at that same boundary without exporting
// one helper for every replaceable port.
type AppModelOption struct {
	Clock                  LayoutTimer
	AutosaveTimer          AutosaveTimerFactory
	WriteExecutor          WriteExecutor
	StableRead             func(string, int64) (file.StableClassifiedRead, error)
	DiskVersion            func(string) (file.DiskVersion, error)
	OpenDialog             DocumentOpenDialog
	SaveDialog             DocumentSaveDialog
	Emitter                StatePatchEmitter
	Version                *string
	Logger                 *zerolog.Logger
	LayoutRepository       LayoutRepositoryAPI
	FileMetadataRepository FileMetadataRepository
	RecentFilesRepository  RecentFilesRepository
	ClipboardWriter        file.ClipboardWriter
	RevealPort             file.RevealPort
	WriteCommitObserver    WriteCommitObserver
}

func (option AppModelOption) apply(service *AppModelService) {
	if option.Clock != nil {
		service.timer = option.Clock
	}
	if option.AutosaveTimer != nil {
		service.autosaveTimer = option.AutosaveTimer
	}
	if option.WriteExecutor != nil {
		service.writeExecutor = option.WriteExecutor
	}
	if option.StableRead != nil {
		service.stableRead = option.StableRead
	}
	if option.DiskVersion != nil {
		service.diskVersion = option.DiskVersion
	}
	if option.OpenDialog != nil || option.SaveDialog != nil {
		service.openDialog = option.OpenDialog
		service.saveDialog = option.SaveDialog
	}
	if option.Emitter != nil {
		service.emitter = option.Emitter
	}
	if option.Version != nil {
		service.applicationVersion = *option.Version
	}
	if option.Logger != nil {
		service.logger = *option.Logger
	}
	if option.LayoutRepository != nil {
		service.layout = option.LayoutRepository
	}
	if option.FileMetadataRepository != nil {
		service.metadata = option.FileMetadataRepository
	}
	if option.RecentFilesRepository != nil {
		service.recentFiles = option.RecentFilesRepository
	}
	if option.ClipboardWriter != nil {
		service.clipboard = option.ClipboardWriter
	}
	if option.RevealPort != nil {
		service.reveal = option.RevealPort
	}
	if option.WriteCommitObserver != nil {
		service.writeCommitObserver = option.WriteCommitObserver
	}
}

// WithDialogs supplies the open and save dialog ports.
func WithDialogs(open DocumentOpenDialog, save DocumentSaveDialog) AppModelOption {
	return AppModelOption{OpenDialog: open, SaveDialog: save}
}

// WithEmitter supplies the state and asynchronous-error event port.
func WithEmitter(emitter StatePatchEmitter) AppModelOption {
	return AppModelOption{Emitter: emitter}
}

// WithVersion supplies the application version projected by GetState.
func WithVersion(version string) AppModelOption {
	return AppModelOption{Version: &version}
}

// WithLogger supplies the local diagnostic logger used when an asynchronous
// failure cannot be delivered to the event port.
func WithLogger(logger zerolog.Logger) AppModelOption {
	return AppModelOption{Logger: &logger}
}

// WithClipboardWriter supplies the host clipboard port.
func WithClipboardWriter(writer file.ClipboardWriter) AppModelOption {
	return AppModelOption{ClipboardWriter: writer}
}

// WithRevealPort supplies the host file-manager reveal port.
func WithRevealPort(port file.RevealPort) AppModelOption {
	return AppModelOption{RevealPort: port}
}
