package appmodel

import "context"

const (
	recentFilesSettingKey  = "recent.files"
	recentFilesSettingType = "recent.files.v1"
	maxRecentFiles         = 6
)

// RecentFilesRepository is the durable metadata seam for the bounded MRU.
// Implementations must return the committed list they observed after each
// mutation; callers project that acknowledgement only after the operation has
// committed.
type RecentFilesRepository interface {
	List(context.Context) ([]string, error)
	Promote(context.Context, string) ([]string, error)
	Remove(context.Context, string) ([]string, error)
}
