package appmodel

import "context"

const (
	LayoutWindowWidth       = "window.width"
	LayoutWindowHeight      = "window.height"
	LayoutWindowMaximized   = "window.maximized"
	LayoutWorkspaceVisible  = "workspace.visible"
	LayoutWorkspaceWidth    = "workspace.width"
	LayoutArrangementBackup = "document.arrangementFallback"
)

// VersionedLayoutValue is the durable, per-field layout envelope. Its identity
// is retained when deferred work is flushed so a closing process cannot claim
// a newer write merely by closing later.
type VersionedLayoutValue struct {
	Version           int    `json:"version"`
	Value             any    `json:"value"`
	ChangedAtUnixNano int64  `json:"changedAtUnixNano"`
	WriterID          string `json:"writerId"`
	Sequence          uint64 `json:"sequence"`
}

// LayoutWriteResult distinguishes a committed value from a stale write whose
// successful acknowledgement is the persisted winner.
type LayoutWriteResult struct {
	Applied bool
	Value   VersionedLayoutValue
}

// LayoutRepositoryAPI persists individual durable layout fields.
type LayoutRepositoryAPI interface {
	Write(context.Context, string, VersionedLayoutValue) (LayoutWriteResult, error)
	Read(context.Context, string) (VersionedLayoutValue, bool, error)
}
