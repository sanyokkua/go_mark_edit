package appmodel

import (
	"context"
	"errors"
	"fmt"

	"github.com/sanyokkua/go_mark_edit/internal/apperr"
	"github.com/sanyokkua/go_mark_edit/internal/bridge"
)

var errStalePublication = errors.New("state publication is stale")

type statePublication struct {
	before        applicationState
	patch         apperr.AppStatePatch
	documentID    string
	commitID      uint64
	stateRevision uint64
	rollback      bool
}

// publishLocked is called with service.mu held. It reserves the publication
// commit under that lock, releases the model lock for the emitter, and returns
// with the model lock held so existing mutation callers retain their lock
// discipline. publicationMu serializes the event stream without putting disk
// or bridge work under the model lock.
func (service *AppModelService) publishLocked(ctx context.Context, before applicationState, patch apperr.AppStatePatch) error {
	if service.emitter == nil {
		service.state = before
		err := apperr.Internal(errors.New("state patch emitter is required"))
		service.logPublicationFailure(err, false, true)
		return err
	}

	publication := service.beginPublicationLocked(before, patch, true)
	return service.publishPreparedLocked(ctx, publication)
}

// publishCommittedLocked uses the same publication path for an irreversible
// disk commit. A bridge failure requests resynchronisation but cannot roll back
// bytes that AtomicReplace has already committed.
func (service *AppModelService) publishCommittedLocked(ctx context.Context, before applicationState, patch apperr.AppStatePatch) error {
	if service.emitter == nil {
		err := apperr.Internal(errors.New("state patch emitter is required"))
		service.logPublicationFailure(err, false, false)
		return err
	}
	publication := service.beginPublicationLocked(before, patch, false)
	return service.publishPreparedLocked(ctx, publication)
}

func (service *AppModelService) publishPreparedLocked(ctx context.Context, publication statePublication) error {
	service.mu.Unlock()
	service.publicationMu.Lock()

	service.mu.Lock()
	if !service.publicationCurrentLocked(publication) {
		service.mu.Unlock()
		service.publicationMu.Unlock()
		service.mu.Lock()
		service.logger.Error().Err(errStalePublication).Msg("state publication rejected because its commit identity is stale")
		return apperr.Internal(errStalePublication)
	}
	service.mu.Unlock()

	var emitErr error
	panicked := bridge.Protect(func() {
		emitErr = service.emitter.EmitStatePatch(ctx, publication.patch)
	})

	service.mu.Lock()
	defer service.publicationMu.Unlock()
	if panicked {
		rolledBack := service.publicationCurrentLocked(publication) && publication.rollback
		if rolledBack {
			service.state = publication.before
		}
		service.logPublicationFailure(nil, true, rolledBack)
		return apperr.Internal(errors.New("emit state patch panicked"))
	}
	if emitErr != nil {
		rolledBack := service.publicationCurrentLocked(publication) && publication.rollback
		if rolledBack {
			service.state = publication.before
		}
		service.logPublicationFailure(emitErr, false, rolledBack)
		return apperr.Internal(fmt.Errorf("emit state patch: %w", emitErr))
	}
	return nil
}

func (service *AppModelService) logPublicationFailure(deliveryErr error, panicked, rolledBack bool) {
	event := service.logger.Error().Bool("rolled_back", rolledBack)
	if deliveryErr != nil {
		event = event.Err(deliveryErr)
	}
	switch {
	case panicked:
		event.Msg("state publication rolled back after event delivery panic")
	case rolledBack:
		event.Msg("state publication rolled back after event delivery failure")
	default:
		event.Msg("state publication delivery failed after the state transition was committed")
	}
}

func (service *AppModelService) beginPublicationLocked(before applicationState, patch apperr.AppStatePatch, rollback bool) statePublication {
	documentID := publicationDocumentID(patch)
	commitID := uint64(0)
	if documentID != "" {
		if document := service.state.documents[documentID]; document != nil {
			document.publicationCommitID++
			commitID = document.publicationCommitID
		}
	}
	if commitID == 0 {
		service.applicationPublicationCommitID++
		commitID = service.applicationPublicationCommitID
	}
	service.publicationSequence++
	return statePublication{
		before: before, patch: patch, documentID: documentID,
		commitID: commitID, stateRevision: patch.Revision, rollback: rollback,
	}
}

func publicationDocumentID(patch apperr.AppStatePatch) string {
	if patch.Documents == nil {
		return ""
	}
	if len(patch.Documents.Upsert) == 1 && len(patch.Documents.Remove) == 0 {
		for documentID := range patch.Documents.Upsert {
			return documentID
		}
	}
	return ""
}

func (service *AppModelService) publicationCurrentLocked(publication statePublication) bool {
	if publication.documentID != "" {
		document := service.state.documents[publication.documentID]
		return document != nil && document.publicationCommitID == publication.commitID && service.state.revision == publication.stateRevision
	}
	return service.applicationPublicationCommitID == publication.commitID && service.state.revision == publication.stateRevision
}
