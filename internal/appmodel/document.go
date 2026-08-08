package appmodel

import (
	"context"
	"strings"

	"github.com/sanyokkua/go_mark_edit/internal/apperr"
)

// DocumentSnapshot is one canonical active-document tuple copied under the model lock.
type DocumentSnapshot struct {
	DocumentID string
	Path       string
	Content    string
	Selection  apperr.SelectionRange
	Revision   uint64
}

// DocumentContentAccessor is the stable F2 read seam for canonical active-document state.
type DocumentContentAccessor interface {
	SnapshotActive(ctx context.Context) (DocumentSnapshot, error)
}

// DocumentCommandAPI is the stable F3 command seam for document mutations.
type DocumentCommandAPI interface {
	UpdateBuffer(ctx context.Context, documentID, content string) error
}

type documentContentAccessor struct {
	service *AppModelService
}

func (accessor documentContentAccessor) SnapshotActive(_ context.Context) (DocumentSnapshot, error) {
	accessor.service.mu.RLock()
	defer accessor.service.mu.RUnlock()

	documentID := accessor.service.state.activeDocumentID
	document, ok := accessor.service.state.documents[documentID]
	if !ok {
		return DocumentSnapshot{}, apperr.NotFound("active document")
	}
	return DocumentSnapshot{
		DocumentID: documentID,
		Path:       document.metadata.Path,
		Content:    document.content,
		Selection:  document.metadata.View.Selection,
		Revision:   accessor.service.state.revision,
	}, nil
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
	if document.content != content {
		document.metadata.ContentRevision++
		for token, authorization := range commands.service.normalizations {
			if authorization.documentID == documentID {
				delete(commands.service.normalizations, token)
			}
		}
		deleteTokensForDocument(commands.service.keepMine, documentID)
		commands.service.removeConflictLocked(documentID)
	}
	document.content = content
	document.metadata.Dirty = document.content != document.baseline || document.detached || (document.metadata.Path == "" && document.content != "") || document.failedWrite || document.metadata.ContentRevision > document.committedRevision
	document.metadata.WordCount = len(strings.Fields(content))
	patch := commands.service.documentPatchLocked(documentID)
	if err := commands.service.publishLocked(ctx, before, patch); err != nil {
		commands.service.mu.Unlock()
		return err
	}
	commands.service.mu.Unlock()

	return nil
}
