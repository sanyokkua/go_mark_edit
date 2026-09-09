package appmodel

import (
	"context"
	"errors"
	"io/fs"
	"os"

	"github.com/sanyokkua/go_mark_edit/internal/apperr"
	"github.com/sanyokkua/go_mark_edit/internal/bridge"
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
		return bridge.Refused[apperr.PathCommandResult](apperr.ClassifiedNotFound, documentID, documentID, "The document is no longer open.", apperr.RemediationNone)
	}
	path := document.metadata.Path
	subject := document.metadata.DisplayName
	service.mu.RUnlock()

	if path == "" {
		return bridge.Refused[apperr.PathCommandResult](apperr.ClassifiedUnsupportedInput, documentID, subject, "This document does not have a file path.", apperr.RemediationNone)
	}
	if writer == nil {
		return bridge.Refused[apperr.PathCommandResult](apperr.ClassifiedSystemCommandFailure, documentID, subject, "The path could not be copied.", apperr.RemediationRetry)
	}
	if err := writer.WriteText(path); err != nil {
		return bridge.Refused[apperr.PathCommandResult](apperr.ClassifiedSystemCommandFailure, documentID, subject, "The path could not be copied.", apperr.RemediationRetry)
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
		return bridge.Refused[apperr.RevealResult](apperr.ClassifiedNotFound, documentID, documentID, "The document is no longer open.", apperr.RemediationNone)
	}
	path := document.metadata.Path
	subject := document.metadata.DisplayName
	knownDetached := document.detached
	service.mu.RUnlock()

	if path == "" {
		return bridge.Refused[apperr.RevealResult](apperr.ClassifiedUnsupportedInput, documentID, subject, "This document does not have a file path.", apperr.RemediationNone)
	}
	if knownDetached {
		return apperr.RevealResult{Status: apperr.PathCommandUnavailable}
	}
	if _, err := os.Stat(path); err != nil {
		if errors.Is(err, fs.ErrNotExist) {
			// The file was there when the document was opened and is gone now. This
			// collapsed into the known-missing case above and returned no error at
			// all, so a user who chose Reveal saw nothing happen. FR-FT-037 requires
			// it reported: detach, then one classified not-found offering the two
			// actions that can still help.
			service.markDetached(ctx, documentID)
			return revealDetachedFailure(documentID, subject)
		}
		return revealCommandFailure(documentID, subject)
	}
	if port == nil {
		return revealCommandFailure(documentID, subject)
	}
	if err := port.Reveal(path); err != nil {
		if errors.Is(err, file.ErrRevealUnavailable) {
			return apperr.RevealResult{Status: apperr.PathCommandUnavailable}
		}
		if errors.Is(err, fs.ErrNotExist) || os.IsNotExist(err) {
			service.markDetached(ctx, documentID)
			return revealDetachedFailure(documentID, subject)
		}
		return revealCommandFailure(documentID, subject)
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

/*
 * The two Reveal outcomes the contract specifies as pairs, in one place so a third
 * call site cannot offer half of one.
 *
 * `not-found` for a detached document is "Save to recreate plus Copy path"; a Reveal
 * `system-command-failure` is "Retry; a Reveal failure also offers Copy path". Both
 * were previously emitted with a single action because the field could only hold one,
 * so Copy path — the action that still works when the file is gone — was the half
 * that got dropped.
 */
func revealDetachedFailure(documentID, subject string) apperr.RevealResult {
	classified := bridge.ClassifiedWithRemediations(
		apperr.ClassifiedNotFound, subject, "The document could not be found.",
		[]apperr.ClassifiedRemediation{apperr.RemediationSaveToRecreate, apperr.RemediationCopyPath},
		documentID,
	)
	return bridge.FromClassified[apperr.RevealResult](classified, apperr.PathCommandRefused)
}

func revealCommandFailure(documentID, subject string) apperr.RevealResult {
	classified := bridge.ClassifiedWithRemediations(
		apperr.ClassifiedSystemCommandFailure, subject, "The file manager could not reveal this document.",
		[]apperr.ClassifiedRemediation{apperr.RemediationRetry, apperr.RemediationCopyPath},
		documentID,
	)
	return bridge.FromClassified[apperr.RevealResult](classified, apperr.PathCommandRefused)
}
