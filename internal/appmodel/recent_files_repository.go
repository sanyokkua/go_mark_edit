package appmodel

import (
	"context"

	"github.com/sanyokkua/go_mark_edit/internal/apperr"
)

const (
	recentItemsSettingKey  = "recent.files"
	recentItemsSettingType = "recent.files.v2"
	maxRecentItems         = 10
)

// RecentItemsRepository is the durable metadata seam for the bounded MRU.
// Implementations must return the committed list they observed after each
// mutation; callers project that acknowledgement only after the operation has
// committed.
//
// There is no per-item removal: List drops paths that no longer exist, and
// Clear is the single explicit all-history removal operation.
type RecentItemsRepository interface {
	List(context.Context) ([]apperr.RecentItem, error)
	Promote(context.Context, string, string) ([]apperr.RecentItem, error)
	Clear(context.Context) error
}
