package appmodel

import "context"

// FileMetadataRepository owns durable per-canonical-path arrangement metadata. It never stores
// source content, tab order, or an authorization.
type FileMetadataRepository interface {
	ReadArrangement(ctx context.Context, canonicalPath string) (string, bool, error)
	WriteArrangement(ctx context.Context, canonicalPath, arrangement string) error
}
