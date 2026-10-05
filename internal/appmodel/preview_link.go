package appmodel

import (
	"context"
	"os"
	"path/filepath"
	"runtime"

	"github.com/sanyokkua/go_mark_edit/internal/apperr"
	"github.com/sanyokkua/go_mark_edit/internal/bridge"
	"github.com/sanyokkua/go_mark_edit/internal/file"
)

// OpenPreviewLink resolves a local link and uses the ordinary Open lifecycle.
func (service *AppModelService) OpenPreviewLink(ctx context.Context, documentID, href string) apperr.OpenResult {
	target, revision, revealPath, classified := service.previewLinkTarget(documentID, href)
	if classified != nil {
		result := bridge.FromClassified[apperr.OpenResult](classified, apperr.OpenStatusRefused)
		result.RevealPath = revealPath
		return result
	}
	result := service.OpenPath(ctx, target, revision)
	if result.Status == apperr.OpenStatusOpened || result.Status == apperr.OpenStatusFocused {
		result.TreePath = service.workspaceTreePath(target)
	}
	if result.Status == apperr.OpenStatusRefused && result.Error != nil {
		// Match NewClassifiedError's safe basename and identifier sanitization.
		subject := apperr.NewClassifiedError(result.Error.Category, target, result.Error.Message, apperr.RemediationNone, result.Error.DocumentID).SafeSubject
		result.Error.SafeSubject = subject
		result.Subject = subject
	}
	return result
}

func (service *AppModelService) previewLinkTarget(documentID, href string) (string, uint64, string, *apperr.ClassifiedError) {
	service.mu.RLock()
	document, exists := service.state.documents[documentID]
	if !exists || document == nil {
		service.mu.RUnlock()
		return "", 0, "", bridge.ClassifiedWithID(
			apperr.ClassifiedNotFound, "document", "The source document is no longer open.", apperr.RemediationNone, documentID,
		)
	}
	subject := documentLabelFromMetadata(document.metadata)
	sourcePath := document.canonicalPath
	revision := service.state.tabSetRevision
	service.mu.RUnlock()

	refuse := func(message string) *apperr.ClassifiedError {
		return bridge.ClassifiedWithID(apperr.ClassifiedUnsupportedInput, subject, message, apperr.RemediationNone, documentID)
	}
	decoded, reason := file.DecodeLinkTarget(href, runtime.GOOS == "windows")
	switch reason {
	case "empty", "scheme", "network":
		return "", revision, "", refuse("The preview link is not a local document target.")
	case "decode":
		return "", revision, "", refuse("The preview link target could not be decoded.")
	}
	target := filepath.FromSlash(decoded)
	if !filepath.IsAbs(target) {
		if sourcePath == "" {
			return "", revision, "", refuse("A relative preview link cannot be opened from an untitled document.")
		}
		target = filepath.Join(filepath.Dir(sourcePath), target)
	}
	// Candidate resolution preserves Open's existing identity/focus semantics. A
	// folder or unresolved candidate still belongs to Open's classification.
	if candidate, err := file.CanonicalizeCandidateDocumentPath(target); err == nil {
		target = candidate.Path
		if info, statErr := os.Stat(target); statErr == nil && info.Mode().IsRegular() && !file.IsSupportedDocumentSuffix(target) {
			return "", revision, target, bridge.ClassifiedWithID(
				apperr.ClassifiedUnsupportedInput, target,
				"The preview link has a file type the Open dialog does not accept.",
				apperr.RemediationNone, documentID,
			)
		}
	}
	return target, revision, "", nil
}
