package appmodel

import (
	"context"
	"strings"

	"github.com/sanyokkua/go_mark_edit/internal/apperr"
)

// DocumentContentAccessor is the stable F2 read seam for canonical content.
type DocumentContentAccessor interface {
	Content(ctx context.Context, documentID string) (string, error)
}

// DocumentCommandAPI is the stable F3 command seam for document mutations.
type DocumentCommandAPI interface {
	UpdateBuffer(ctx context.Context, documentID, content string) error
}

type documentContentAccessor struct {
	service *AppModelService
}

func (accessor documentContentAccessor) Content(_ context.Context, documentID string) (string, error) {
	accessor.service.mu.RLock()
	defer accessor.service.mu.RUnlock()

	document, ok := accessor.service.state.documents[documentID]
	if !ok {
		return "", apperr.NotFound(documentID)
	}
	return document.content, nil
}

type documentCommands struct {
	service *AppModelService
}

func (commands documentCommands) UpdateBuffer(ctx context.Context, documentID, content string) error {
	commands.service.mu.Lock()
	before := commands.service.snapshotLocked()
	document, ok := commands.service.state.documents[documentID]
	if !ok {
		commands.service.mu.Unlock()
		return apperr.NotFound(documentID)
	}
	document.content = content
	document.metadata.Dirty = content != document.baseline
	document.metadata.WordCount = len(strings.Fields(content))
	patch := commands.service.documentPatchLocked(documentID)
	if err := commands.service.publishLocked(ctx, before, patch); err != nil {
		commands.service.mu.Unlock()
		return err
	}
	commands.service.mu.Unlock()

	return nil
}
