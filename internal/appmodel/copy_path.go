package appmodel

import (
	"context"
	"errors"
	"io/fs"
	"os"

	"github.com/sanyokkua/go_mark_edit/internal/apperr"
	"github.com/sanyokkua/go_mark_edit/internal/file"
)

// CopyPath hands the exact canonical path to the injected clipboard port.
// Detached documents retain their path and are intentionally copyable.
func (service *AppModelService) CopyPath(_ context.Context, documentID string) apperr.CopyPathResult {
	service.mu.RLock()
	document, exists := service.state.documents[documentID]
	writer := service.clipboard
	if !exists {
		service.mu.RUnlock()
		return pathCommandFailure(apperr.ClassifiedNotFound, documentID, documentID, "The document is no longer open.", apperr.RemediationCancel)
	}
	path := document.metadata.Path
	subject := document.metadata.DisplayName
	service.mu.RUnlock()

	if path == "" {
		return pathCommandFailure(apperr.ClassifiedUnsupportedInput, documentID, subject, "This document does not have a file path.", apperr.RemediationNone)
	}
	if writer == nil {
		return pathCommandFailure(apperr.ClassifiedSystemCommandFailure, documentID, subject, "The path could not be copied.", apperr.RemediationRetry)
	}
	if err := writer.WriteText(path); err != nil {
		return pathCommandFailure(apperr.ClassifiedSystemCommandFailure, documentID, subject, "The path could not be copied.", apperr.RemediationRetry)
	}
	return apperr.CopyPathResult{Status: apperr.PathCommandCopied}
}

// RevealInFileManager performs one appmodel-owned existence check immediately
// before invoking the host port. It never delegates missing-path classification
// to an OS error string.
func (service *AppModelService) RevealInFileManager(ctx context.Context, documentID string) apperr.RevealResult {
	service.mu.RLock()
	document, exists := service.state.documents[documentID]
	port := service.reveal
	if !exists {
		service.mu.RUnlock()
		return revealFailure(apperr.ClassifiedNotFound, documentID, documentID, "The document is no longer open.", apperr.RemediationCancel)
	}
	path := document.metadata.Path
	subject := document.metadata.DisplayName
	knownDetached := document.detached
	service.mu.RUnlock()

	if path == "" {
		return revealFailure(apperr.ClassifiedUnsupportedInput, documentID, subject, "This document does not have a file path.", apperr.RemediationNone)
	}
	if knownDetached {
		return apperr.RevealResult{Status: apperr.PathCommandUnavailable}
	}
	if _, err := os.Stat(path); err != nil {
		if errors.Is(err, fs.ErrNotExist) {
			service.markDetached(ctx, documentID)
			return apperr.RevealResult{Status: apperr.PathCommandUnavailable}
		}
		return revealFailure(apperr.ClassifiedSystemCommandFailure, documentID, subject, "The file manager could not reveal this document.", apperr.RemediationRetry)
	}
	if port == nil {
		return revealFailure(apperr.ClassifiedSystemCommandFailure, documentID, subject, "The file manager could not reveal this document.", apperr.RemediationRetry)
	}
	if err := port.Reveal(path); err != nil {
		if errors.Is(err, file.ErrRevealUnavailable) {
			return apperr.RevealResult{Status: apperr.PathCommandUnavailable}
		}
		if errors.Is(err, fs.ErrNotExist) || os.IsNotExist(err) {
			service.markDetached(ctx, documentID)
			classified := apperr.NewClassifiedError(apperr.ClassifiedNotFound, subject, "The document could not be found.", apperr.RemediationSaveToRecreate, documentID)
			return apperr.RevealResult{Status: apperr.PathCommandRefused, Error: &classified}
		}
		classified := apperr.NewClassifiedError(apperr.ClassifiedSystemCommandFailure, subject, "The file manager could not reveal this document.", apperr.RemediationRetry, documentID)
		return apperr.RevealResult{Status: apperr.PathCommandRefused, Error: &classified}
	}
	return apperr.RevealResult{Status: apperr.PathCommandRevealed}
}

func (service *AppModelService) markDetached(ctx context.Context, documentID string) {
	service.mu.Lock()
	defer service.mu.Unlock()
	document, exists := service.state.documents[documentID]
	if !exists || document.detached {
		return
	}
	before := service.snapshotLocked()
	document.detached = true
	patch := service.documentPatchLocked(documentID)
	_ = service.publishLocked(ctx, before, patch)
}

func pathCommandFailure(category apperr.ClassifiedErrorCategory, documentID, subject, message string, remediation apperr.ClassifiedRemediation) apperr.PathCommandResult {
	classified := apperr.NewClassifiedError(category, subject, message, remediation, documentID)
	return apperr.PathCommandResult{Status: apperr.PathCommandRefused, Error: &classified}
}

func revealFailure(category apperr.ClassifiedErrorCategory, documentID, subject, message string, remediation apperr.ClassifiedRemediation) apperr.RevealResult {
	classified := apperr.NewClassifiedError(category, subject, message, remediation, documentID)
	return apperr.RevealResult{Status: apperr.PathCommandRefused, Error: &classified}
}
