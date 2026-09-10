package appmodel

import (
	"github.com/rs/zerolog"
	"github.com/sanyokkua/go_mark_edit/internal/file"
)

// AppModelOption configures one AppModelService at construction time.
//
// Options keep deterministic test dependencies at the composition boundary
// while leaving the appmodel package independent of Wails and bootstrap.
type AppModelOption func(*AppModelService)

// WithClock supplies the layout debounce clock.
func WithClock(clock LayoutTimer) AppModelOption {
	return func(service *AppModelService) {
		if clock != nil {
			service.timer = clock
		}
	}
}

// WithAutosaveTimer supplies the autosave debounce timer factory.
func WithAutosaveTimer(timer AutosaveTimerFactory) AppModelOption {
	return func(service *AppModelService) {
		if timer != nil {
			service.autosaveTimer = timer
		}
	}
}

// WithWriteExecutor supplies the document replacement executor.
func WithWriteExecutor(executor WriteExecutor) AppModelOption {
	return func(service *AppModelService) {
		if executor != nil {
			service.writeExecutor = executor
		}
	}
}

// WithConflictReaders supplies disk-version and stable-read readers.
func WithConflictReaders(stableRead func(string, int64) (file.StableClassifiedRead, error), diskVersion func(string) (file.DiskVersion, error)) AppModelOption {
	return func(service *AppModelService) {
		if stableRead != nil {
			service.stableRead = stableRead
		}
		if diskVersion != nil {
			service.diskVersion = diskVersion
		}
	}
}

// WithDialogs supplies the open and save dialog ports.
func WithDialogs(open DocumentOpenDialog, save DocumentSaveDialog) AppModelOption {
	return func(service *AppModelService) {
		service.openDialog = open
		service.saveDialog = save
	}
}

// WithEmitter supplies the state and asynchronous-error event port.
func WithEmitter(emitter StatePatchEmitter) AppModelOption {
	return func(service *AppModelService) { service.emitter = emitter }
}

// WithVersion supplies the application version projected by GetState.
func WithVersion(version string) AppModelOption {
	return func(service *AppModelService) { service.applicationVersion = version }
}

// WithLogger supplies the local diagnostic logger used when an asynchronous
// failure cannot be delivered to the event port.
func WithLogger(logger zerolog.Logger) AppModelOption {
	return func(service *AppModelService) { service.logger = logger }
}

// WithLayoutRepository supplies layout persistence before the first command.
func WithLayoutRepository(repository LayoutRepositoryAPI) AppModelOption {
	return func(service *AppModelService) { service.layout = repository }
}

// WithFileMetadataRepository supplies per-file view persistence.
func WithFileMetadataRepository(repository FileMetadataRepository) AppModelOption {
	return func(service *AppModelService) { service.metadata = repository }
}

// WithRecentFilesRepository supplies durable recent-file persistence.
func WithRecentFilesRepository(repository RecentFilesRepository) AppModelOption {
	return func(service *AppModelService) { service.recentFiles = repository }
}

// WithClipboardWriter supplies the host clipboard port.
func WithClipboardWriter(writer file.ClipboardWriter) AppModelOption {
	return func(service *AppModelService) { service.clipboard = writer }
}

// WithRevealPort supplies the host file-manager reveal port.
func WithRevealPort(port file.RevealPort) AppModelOption {
	return func(service *AppModelService) { service.reveal = port }
}

// WithWriteCommitObserver supplies an optional composition-root observer for
// committed writes, such as the native-evidence measurement host.
func WithWriteCommitObserver(observer WriteCommitObserver) AppModelOption {
	return func(service *AppModelService) {
		if observer != nil {
			service.writeCommitObserver = observer
		}
	}
}
