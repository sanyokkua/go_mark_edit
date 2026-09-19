package appmodel

import (
	"context"
	"path/filepath"
	"strings"

	"github.com/sanyokkua/go_mark_edit/internal/apperr"
	"github.com/sanyokkua/go_mark_edit/internal/bridge"
	"github.com/sanyokkua/go_mark_edit/internal/file"
)

// OpenPreviewLink opens one local preview target through the same reservation
// and publication lifecycle as the native Open command. The frontend performs
// the fast scheme classification; these checks are repeated here because the
// backend is the authority for filesystem access and containment.
func (service *AppModelService) OpenPreviewLink(ctx context.Context, documentID, href string) apperr.OpenResult {
	target, expectedTabSetRevision, classified := service.previewLinkTarget(documentID, href)
	if classified != nil {
		return bridge.FromClassified[apperr.OpenResult](classified, apperr.OpenStatusRefused)
	}
	return service.OpenPath(ctx, target, expectedTabSetRevision)
}

func (service *AppModelService) previewLinkTarget(documentID, href string) (string, uint64, *apperr.ClassifiedError) {
	service.mu.RLock()
	document, exists := service.state.documents[documentID]
	if !exists || document == nil {
		service.mu.RUnlock()
		return "", 0, bridge.ClassifiedWithID(
			apperr.ClassifiedNotFound,
			"document",
			"The source document is no longer open.",
			apperr.RemediationNone,
			documentID,
		)
	}
	subject := documentLabelFromMetadata(document.metadata)
	sourcePath := document.canonicalPath
	expectedTabSetRevision := service.state.tabSetRevision
	service.mu.RUnlock()

	refuse := func(category apperr.ClassifiedErrorCategory, message string) *apperr.ClassifiedError {
		return bridge.ClassifiedWithID(category, subject, message, apperr.RemediationNone, documentID)
	}

	if sourcePath == "" {
		return "", expectedTabSetRevision, refuse(
			apperr.ClassifiedUnsupportedInput,
			"A relative preview link cannot be opened from an untitled document.",
		)
	}

	pathPart, parseReason := previewLinkPath(href)
	if parseReason == "scheme" {
		return "", expectedTabSetRevision, refuse(
			apperr.ClassifiedUnsupportedInput,
			"The preview link is not a local document target.",
		)
	}
	if parseReason == "decode" {
		return "", expectedTabSetRevision, refuse(
			apperr.ClassifiedUnsupportedInput,
			"The preview link target could not be decoded.",
		)
	}

	baseFolder := filepath.Dir(sourcePath)
	targetPath := filepath.FromSlash(pathPart)
	if !filepath.IsAbs(targetPath) {
		targetPath = filepath.Join(baseFolder, targetPath)
	}
	candidate, err := file.CanonicalizeCandidateDocumentPath(targetPath)
	if err != nil {
		return "", expectedTabSetRevision, refuse(
			apperr.ClassifiedUnsupportedInput,
			"The preview link target could not be resolved.",
		)
	}
	if !isWithinDirectory(baseFolder, candidate.Path) {
		return "", expectedTabSetRevision, refuse(
			apperr.ClassifiedUnsupportedInput,
			"The preview link points outside the document's folder.",
		)
	}
	if !file.IsSupportedDocumentSuffix(candidate.Path) {
		return "", expectedTabSetRevision, refuse(
			apperr.ClassifiedUnsupportedInput,
			"The preview link has a file type the Open dialog does not accept.",
		)
	}
	return candidate.Path, expectedTabSetRevision, nil
}

// previewLinkPath parses only the local-path subset accepted by the preview
// policy. net/url is intentionally not used in appmodel: the architecture
// boundary treats that package as a network-path dependency, while this
// parser needs no authority, host, user-info, or network semantics.
func previewLinkPath(href string) (string, string) {
	if strings.HasPrefix(href, "//") {
		return "", "scheme"
	}
	pathEnd := strings.IndexAny(href, "?#")
	if pathEnd >= 0 {
		href = href[:pathEnd]
	}
	if href == "" {
		return "", "scheme"
	}
	colon := strings.IndexByte(href, ':')
	slash := strings.IndexByte(href, '/')
	if colon >= 0 && (slash < 0 || colon < slash) {
		return "", "scheme"
	}
	decoded, ok := percentDecode(href)
	if !ok || decoded == "" {
		return "", "decode"
	}
	return decoded, ""
}

func percentDecode(value string) (string, bool) {
	var decoded strings.Builder
	decoded.Grow(len(value))
	for index := 0; index < len(value); index++ {
		if value[index] != '%' {
			decoded.WriteByte(value[index])
			continue
		}
		if index+2 >= len(value) {
			return "", false
		}
		high, okHigh := hexValue(value[index+1])
		low, okLow := hexValue(value[index+2])
		if !okHigh || !okLow {
			return "", false
		}
		decoded.WriteByte(high<<4 | low)
		index += 2
	}
	return decoded.String(), true
}

func hexValue(value byte) (byte, bool) {
	switch {
	case value >= '0' && value <= '9':
		return value - '0', true
	case value >= 'a' && value <= 'f':
		return value - 'a' + 10, true
	case value >= 'A' && value <= 'F':
		return value - 'A' + 10, true
	default:
		return 0, false
	}
}

func isWithinDirectory(directory, candidate string) bool {
	directory = filepath.Clean(directory)
	candidate = filepath.Clean(candidate)
	relative, err := filepath.Rel(directory, candidate)
	if err != nil || relative == "." || filepath.IsAbs(relative) {
		return false
	}
	return relative != ".." && !strings.HasPrefix(relative, ".."+string(filepath.Separator))
}
