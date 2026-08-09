package appmodel

import (
	"context"

	"github.com/sanyokkua/go_mark_edit/internal/apperr"
)

// refreshRecentFiles is called by the state-display boundary. It performs
// validation only when state is requested, never from a watcher or timer.
func (service *AppModelService) refreshRecentFiles(ctx context.Context) {
	service.mu.RLock()
	repository := service.recentFiles
	service.mu.RUnlock()
	if repository == nil {
		return
	}
	entries, err := repository.List(ctx)
	if err != nil {
		return
	}
	service.mu.Lock()
	service.state.recentFiles = append([]string(nil), entries...)
	service.mu.Unlock()
}

func (service *AppModelService) publishRecentFiles(ctx context.Context, entries []string) {
	service.mu.Lock()
	if !sameRecentFiles(service.state.recentFiles, entries) {
		before := service.snapshotLocked()
		service.state.recentFiles = append([]string(nil), entries...)
		service.state.revision++
		patch := apperr.AppStatePatch{Revision: service.state.revision, RecentFiles: append([]string(nil), entries...)}
		_ = service.publishLocked(ctx, before, patch)
	}
	service.mu.Unlock()
}
