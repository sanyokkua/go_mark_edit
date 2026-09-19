package application

import (
	"context"

	"github.com/sanyokkua/go_mark_edit/internal/apperr"
	"github.com/sanyokkua/go_mark_edit/pkg/previewimage"
)

// PreviewImageStateReader is the narrow application-state port needed by the
// local preview image route.
type PreviewImageStateReader interface {
	GetState(context.Context) (apperr.AppState, error)
}

// PreviewImageHandler is the asset-server handler exposed by the application
// composition boundary. Its HTTP adapter lives in the package-level preview
// route package so the internal architecture's no-network rule remains exact.
type PreviewImageHandler = previewimage.Handler

// NewPreviewImageHandler constructs the asset-server fallback for local
// preview images.
func NewPreviewImageHandler(state PreviewImageStateReader) *PreviewImageHandler {
	return previewimage.NewHandler(state)
}
