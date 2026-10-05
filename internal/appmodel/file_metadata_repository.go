package appmodel

import "context"

// FileViewMetadata is the durable per-path pane state.
type FileViewMetadata struct {
	Arrangement string
	SplitRatio  float64
}

// FileMetadataRepository owns durable per-canonical-path view metadata. It never stores
// source content, tab order, or an authorization.
type FileMetadataRepository interface {
	ReadView(ctx context.Context, canonicalPath string) (FileViewMetadata, bool, error)
	WriteView(ctx context.Context, canonicalPath string, view FileViewMetadata) error
}
