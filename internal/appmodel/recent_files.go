package appmodel

import (
	"context"

	"github.com/sanyokkua/go_mark_edit/internal/apperr"
	"github.com/sanyokkua/go_mark_edit/internal/bridge"
)

// refreshRecentItems is the on-demand repository read shared by state hydration
// and the explicit cross-window refresh command.
func (service *AppModelService) refreshRecentItems(ctx context.Context, publish bool) ([]apperr.RecentItem, error) {
	service.mu.RLock()
	repository := service.recentItems
	service.mu.RUnlock()
	if repository == nil {
		service.mu.RLock()
		entries := append([]apperr.RecentItem{}, service.state.recentItems...)
		service.mu.RUnlock()
		return entries, nil
	}
	entries, err := repository.List(ctx)
	if err != nil {
		return nil, err
	}
	if publish {
		if err := service.publishRecentItems(ctx, entries); err != nil {
			return nil, err
		}
		return entries, nil
	}
	service.mu.Lock()
	service.state.recentItems = append([]apperr.RecentItem(nil), entries...)
	service.updateCanReopenLastFileLocked()
	service.mu.Unlock()
	return entries, nil
}

// RefreshRecentItems reads the shared store on demand and publishes only a changed projection.
func (service *AppModelService) RefreshRecentItems(ctx context.Context) apperr.RecentItemsResult {
	entries, err := service.refreshRecentItems(ctx, true)
	if err != nil {
		return recentItemsFailure("Recent Items could not be read.")
	}
	return apperr.RecentItemsResult{RecentItems: append([]apperr.RecentItem{}, entries...)}
}

// ClearRecentItems persists the all-history removal before publishing it.
func (service *AppModelService) ClearRecentItems(ctx context.Context) apperr.VoidResult {
	service.mu.RLock()
	repository := service.recentItems
	service.mu.RUnlock()
	if repository != nil {
		if err := repository.Clear(ctx); err != nil {
			return recentItemsVoidFailure("Recent Items could not be cleared.")
		}
	}
	if err := service.publishRecentItems(ctx, nil); err != nil {
		return recentItemsVoidFailure("Recent Items were cleared, but the updated list could not be published.")
	}
	return apperr.VoidResult{}
}

func recentItemsFailure(message string) apperr.RecentItemsResult {
	classified := bridge.ClassifiedWithID(apperr.ClassifiedIOFailure, "recent-items", message, apperr.RemediationRetry, "")
	return apperr.RecentItemsResult{Failure: bridge.FailureFromClassified(classified), Error: classified}
}

func recentItemsVoidFailure(message string) apperr.VoidResult {
	classified := bridge.ClassifiedWithID(apperr.ClassifiedIOFailure, "recent-items", message, apperr.RemediationRetry, "")
	wire := apperr.ClassifiedToWire(classified)
	return apperr.VoidResult{Failure: bridge.FailureFromClassified(classified), Error: &wire}
}

func (service *AppModelService) updateCanReopenLastFileLocked() {
	service.state.canReopenLastFile = len(service.state.recentlyClosed) > 0 || len(service.state.recentItems) > 0
}

func (service *AppModelService) publishRecentItems(ctx context.Context, entries []apperr.RecentItem) error {
	service.mu.Lock()
	defer service.mu.Unlock()
	if !sameRecentItems(service.state.recentItems, entries) {
		before := service.snapshotLocked()
		service.state.recentItems = append([]apperr.RecentItem(nil), entries...)
		service.updateCanReopenLastFileLocked()
		service.state.revision++
		patch := apperr.AppStatePatch{Revision: service.state.revision, RecentItems: append([]apperr.RecentItem{}, entries...), CanReopenLastFile: pointerTo(service.state.canReopenLastFile)}
		if err := service.publishLocked(ctx, before, patch); err != nil {
			return err
		}
	}
	return nil
}
