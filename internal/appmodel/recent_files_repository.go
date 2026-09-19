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
//
// There is no Remove. A stale entry is
// removed lazily", and List already does that: it stats every stored path and
// drops the ones that no longer exist, writing the pruned list back. An
// explicit Remove was a second way to reach the same outcome that nothing ever
// removed lazily by List when the path no longer exists.
type RecentFilesRepository interface {
	List(context.Context) ([]string, error)
	Promote(context.Context, string) ([]string, error)
}
