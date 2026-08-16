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
// There is no Remove. FR-FT-042's stale-entry rule is "the stale entry is
// removed lazily", and List already does that: it stats every stored path and
// drops the ones that no longer exist, writing the pruned list back. An
// explicit Remove was a second way to reach the same outcome that nothing ever
// called (T137).
type RecentFilesRepository interface {
	List(context.Context) ([]string, error)
	Promote(context.Context, string) ([]string, error)
}
