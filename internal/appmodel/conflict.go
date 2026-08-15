package appmodel

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"
	"io/fs"
	"strings"
	"unicode/utf8"

	"github.com/sanyokkua/go_mark_edit/internal/apperr"
	"github.com/sanyokkua/go_mark_edit/internal/file"
)

const (
	maxConflictPreviewLines = 12
	maxConflictPreviewBytes = 4096
)

var errConflictRevisionChanged = errors.New("document changed during external check")

type documentConflict struct {
	preview   apperr.ConflictPreview
	version   file.DiskVersion
	rawHash   string
	read      file.ClassifiedRead
	createdAt uint64
}

type keepMineAuthorization struct {
	documentID      string
	contentRevision uint64
	path            string
	version         file.DiskVersion
	rawHash         string
	characteristics file.FileCharacteristics
}

type diskInspectionKind string

const (
	diskUnchanged  diskInspectionKind = "unchanged"
	diskDetached   diskInspectionKind = "detached"
	diskConflict   diskInspectionKind = "conflict"
	diskUnstable   diskInspectionKind = "unstable"
	diskAuthorized diskInspectionKind = "authorized"
)

type diskInspection struct {
	kind            diskInspectionKind
	version         file.DiskVersion
	rawHash         string
	characteristics file.FileCharacteristics
	preview         *apperr.ConflictPreview
	classified      *apperr.ClassifiedError
}

// CheckExternalChanges performs the only supported foreground filesystem
// check. It is intentionally explicit: there is no watcher or polling loop.
func (service *AppModelService) CheckExternalChanges(ctx context.Context, documentID string) apperr.ConflictResult {
	service.mu.RLock()
	document, ok := service.state.documents[documentID]
	if !ok {
		service.mu.RUnlock()
		return service.conflictRefused(documentID, apperr.ClassifiedNotFound, "The document is no longer open.", apperr.RemediationCancel)
	}
	revision := document.metadata.ContentRevision
	service.mu.RUnlock()

	inspection := service.inspectDocument(ctx, documentID, revision, "")
	return service.conflictResultForInspection(documentID, revision, inspection)
}

// ForegroundCheck and CheckDocumentDisk are descriptive aliases used by
// callers that model focus/resume and tab activation as separate events.
func (service *AppModelService) ForegroundCheck(ctx context.Context, documentID string) apperr.ConflictResult {
	return service.CheckExternalChanges(ctx, documentID)
}

func (service *AppModelService) CheckDocumentDisk(ctx context.Context, documentID string) apperr.ConflictResult {
	return service.CheckExternalChanges(ctx, documentID)
}

// ReloadFromDisk reclassifies the compared file and replaces the canonical
// buffer only when the caller still refers to the same document revision and
// detected disk version.
func (service *AppModelService) ReloadFromDisk(ctx context.Context, documentID string, expectedContentRevision uint64, detectedVersion apperr.DiskVersion) apperr.ConflictResult {
	service.mu.RLock()
	document, ok := service.state.documents[documentID]
	if !ok {
		service.mu.RUnlock()
		return service.conflictRefused(documentID, apperr.ClassifiedNotFound, "The document is no longer open.", apperr.RemediationCancel)
	}
	path := document.metadata.Path
	currentRevision := document.metadata.ContentRevision
	service.mu.RUnlock()
	if currentRevision != expectedContentRevision {
		return service.conflictRefused(documentID, apperr.ClassifiedConflict, "The external-change decision is no longer current.", apperr.RemediationRetry)
	}
	if path == "" {
		return service.conflictRefused(documentID, apperr.ClassifiedUnsupportedInput, "This document does not have a file path.", apperr.RemediationNone)
	}
	current, err := service.currentDiskVersion(path)
	if err != nil {
		return service.conflictRefused(documentID, apperr.ClassifiedIOFailure, "The document could not be inspected.", apperr.RemediationRetry)
	}
	if !current.Equal(fileVersionFromWire(detectedVersion)) {
		service.invalidateConflict(ctx, documentID)
		return service.conflictRefused(documentID, apperr.ClassifiedConflict, "The file changed again; refresh the comparison.", apperr.RemediationRetry)
	}
	stable, readErr := service.readStable(path)
	if readErr != nil {
		service.invalidateConflict(ctx, documentID)
		if errors.Is(readErr, file.ErrUnstableRead) {
			return service.conflictResultUnstable(documentID, expectedContentRevision)
		}
		return service.conflictRefused(documentID, apperr.ClassifiedIOFailure, "The document could not be reloaded.", apperr.RemediationRetry)
	}
	if !stable.Version.Exists || stable.Read.Error != nil {
		return service.conflictRefused(documentID, apperr.ClassifiedNotFound, "The document could not be found.", apperr.RemediationSaveToRecreate)
	}
	if err := service.applyReload(ctx, documentID, expectedContentRevision, detectedVersion, stable); err != nil {
		if errors.Is(err, errConflictRevisionChanged) {
			return service.conflictRefused(documentID, apperr.ClassifiedConflict, "The document changed before reload completed.", apperr.RemediationRetry)
		}
		return service.conflictRefused(documentID, apperr.ClassifiedIOFailure, "The reloaded document could not be published.", apperr.RemediationRetry)
	}
	service.conflictQueue.Remove(documentID)
	projectionRevision, activeBuffer := service.activeBufferFor(documentID)
	return apperr.ConflictResult{Status: apperr.ConflictStatusReloaded, DocumentID: documentID, DocumentRevision: expectedContentRevision, ProjectionRevision: projectionRevision, ActiveBuffer: activeBuffer}
}

// AuthorizeKeepMine creates one single-use authorization. The write itself is
// resumed by Save with the returned token, keeping the exact write intent in
// the normal revision-bound write path.
func (service *AppModelService) AuthorizeKeepMine(ctx context.Context, documentID string, contentRevision uint64, path string, detectedVersion apperr.DiskVersion) apperr.ConflictResult {
	service.mu.RLock()
	document, ok := service.state.documents[documentID]
	if !ok {
		service.mu.RUnlock()
		return service.conflictRefused(documentID, apperr.ClassifiedNotFound, "The document is no longer open.", apperr.RemediationCancel)
	}
	documentPath := document.metadata.Path
	canonicalPath := path
	if candidate, err := file.CanonicalizeCandidateDocumentPath(path); err == nil {
		canonicalPath = candidate.Path
	}
	if document.metadata.ContentRevision != contentRevision || documentPath != canonicalPath {
		service.mu.RUnlock()
		return service.conflictRefused(documentID, apperr.ClassifiedConflict, "The external-change decision is no longer current.", apperr.RemediationRetry)
	}
	service.mu.RUnlock()
	service.mu.RLock()
	reader := service.diskVersion
	service.mu.RUnlock()
	if reader == nil {
		reader = file.CurrentDiskVersion
	}
	current, err := reader(canonicalPath)
	service.mu.Lock()
	defer service.mu.Unlock()
	document, ok = service.state.documents[documentID]
	if !ok {
		return service.conflictRefused(documentID, apperr.ClassifiedNotFound, "The document is no longer open.", apperr.RemediationCancel)
	}
	queued, ok := service.conflicts[documentID]
	if !ok || document.metadata.ContentRevision != contentRevision || document.metadata.Path != canonicalPath || !queued.version.Equal(fileVersionFromWire(detectedVersion)) || queued.preview.ContentRevision != contentRevision || queued.preview.Path != canonicalPath {
		return service.conflictRefused(documentID, apperr.ClassifiedConflict, "The external-change decision is no longer current.", apperr.RemediationRetry)
	}
	if queued.preview.ReadOnly {
		return service.conflictRefused(documentID, apperr.ClassifiedPermissionDenied, "The document is read-only and cannot be overwritten.", apperr.RemediationNone)
	}
	if err != nil || !current.Equal(queued.version) {
		before := service.snapshotLocked()
		service.removeConflictLocked(documentID)
		patch := service.documentPatchLocked(documentID)
		_ = service.publishLocked(ctx, before, patch)
		return service.conflictRefused(documentID, apperr.ClassifiedConflict, "The file changed again; refresh the comparison.", apperr.RemediationRetry)
	}
	token := mintDocumentID()
	service.keepMine[token] = &keepMineAuthorization{documentID: documentID, contentRevision: contentRevision, path: canonicalPath, version: queued.version, rawHash: queued.rawHash, characteristics: queued.read.Characteristics}
	return apperr.ConflictResult{Status: apperr.ConflictStatusAuthorized, DocumentID: documentID, DocumentRevision: contentRevision, DecisionToken: token, Preview: &queued.preview}
}

// KeepMine is a concise command alias for the bridge and frontend service
// layer. It does not perform a write until Save consumes the returned token.
func (service *AppModelService) KeepMine(documentID string, contentRevision uint64, path string, detectedVersion apperr.DiskVersion) apperr.ConflictResult {
	return service.AuthorizeKeepMine(context.Background(), documentID, contentRevision, path, detectedVersion)
}

// Skip invalidates only the current comparison and does not change content or
// disk state. The next write/foreground check will compare again.
func (service *AppModelService) SkipConflict(ctx context.Context, documentID string, expectedContentRevision uint64, detectedVersion apperr.DiskVersion) apperr.ConflictResult {
	service.mu.Lock()
	defer service.mu.Unlock()
	document, ok := service.state.documents[documentID]
	if !ok {
		return service.conflictRefused(documentID, apperr.ClassifiedNotFound, "The document is no longer open.", apperr.RemediationCancel)
	}
	queued, ok := service.conflicts[documentID]
	if !ok || document.metadata.ContentRevision != expectedContentRevision || !queued.version.Equal(fileVersionFromWire(detectedVersion)) {
		return service.conflictRefused(documentID, apperr.ClassifiedConflict, "The external-change decision is no longer current.", apperr.RemediationRetry)
	}
	if queued.preview.ReadOnly {
		return service.conflictRefused(documentID, apperr.ClassifiedPermissionDenied, "The document is read-only; cancel the foreground check.", apperr.RemediationNone)
	}
	before := service.snapshotLocked()
	service.removeConflictLocked(documentID)
	patch := service.documentPatchLocked(documentID)
	if err := service.publishLocked(ctx, before, patch); err != nil {
		return service.conflictRefused(documentID, apperr.ClassifiedIOFailure, "The conflict decision could not be published.", apperr.RemediationRetry)
	}
	return apperr.ConflictResult{Status: apperr.ConflictStatusSkipped, DocumentID: documentID, DocumentRevision: expectedContentRevision}
}

// CancelConflict dismisses a foreground-only read-only check. It does not
// change the document baseline or disk and permits a fresh check later.
func (service *AppModelService) CancelConflict(ctx context.Context, documentID string, expectedContentRevision uint64, detectedVersion apperr.DiskVersion) apperr.ConflictResult {
	service.mu.Lock()
	defer service.mu.Unlock()
	document, ok := service.state.documents[documentID]
	queued, queuedOK := service.conflicts[documentID]
	if !ok {
		return service.conflictRefused(documentID, apperr.ClassifiedNotFound, "The document is no longer open.", apperr.RemediationCancel)
	}
	if !queuedOK || document.metadata.ContentRevision != expectedContentRevision || !queued.version.Equal(fileVersionFromWire(detectedVersion)) {
		return service.conflictRefused(documentID, apperr.ClassifiedConflict, "The external-change decision is no longer current.", apperr.RemediationRetry)
	}
	before := service.snapshotLocked()
	service.removeConflictLocked(documentID)
	patch := service.documentPatchLocked(documentID)
	if err := service.publishLocked(ctx, before, patch); err != nil {
		return service.conflictRefused(documentID, apperr.ClassifiedIOFailure, "The conflict decision could not be published.", apperr.RemediationRetry)
	}
	return apperr.ConflictResult{Status: apperr.ConflictStatusCancelled, DocumentID: documentID, DocumentRevision: expectedContentRevision}
}

func (service *AppModelService) inspectDocument(ctx context.Context, documentID string, expectedRevision uint64, decisionToken string) diskInspection {
	service.mu.RLock()
	document, ok := service.state.documents[documentID]
	if !ok {
		service.mu.RUnlock()
		return diskInspection{classified: service.classifiedConflictError(documentID, apperr.ClassifiedNotFound, "The document is no longer open.", apperr.RemediationCancel)}
	}
	if document.metadata.ContentRevision != expectedRevision {
		service.mu.RUnlock()
		return diskInspection{classified: service.classifiedConflictError(documentID, apperr.ClassifiedConflict, "The document changed before the disk check completed.", apperr.RemediationRetry)}
	}
	path := document.metadata.Path
	baselineVersion := document.baselineVersion
	baselineHash := document.baselineRawHash
	baselineCharacteristics := document.baselineCharacteristics
	documentSnapshot := *document
	service.mu.RUnlock()
	if path == "" {
		return diskInspection{kind: diskUnchanged}
	}

	if decisionToken != "" {
		service.mu.Lock()
		authorization, authorized := service.keepMine[decisionToken]
		if authorized && authorization.documentID == documentID && authorization.contentRevision == expectedRevision && authorization.path == path {
			delete(service.keepMine, decisionToken)
			before := service.snapshotLocked()
			document.baselineVersion = authorization.version
			document.baselineRawHash = authorization.rawHash
			document.baselineCharacteristics = authorization.characteristics
			document.detached = false
			service.removeConflictLocked(documentID)
			patch := service.documentPatchLocked(documentID)
			if err := service.publishLocked(ctx, before, patch); err != nil {
				service.mu.Unlock()
				return diskInspection{classified: service.classifiedConflictError(documentID, apperr.ClassifiedIOFailure, "The external-change decision could not be published.", apperr.RemediationRetry)}
			}
			service.mu.Unlock()
			return diskInspection{kind: diskAuthorized, version: authorization.version, rawHash: authorization.rawHash, characteristics: authorization.characteristics}
		}
		service.mu.Unlock()
	}

	current, err := service.currentDiskVersion(path)
	if err != nil {
		return diskInspection{classified: service.classifiedConflictError(documentID, apperr.ClassifiedIOFailure, "The document could not be inspected.", apperr.RemediationRetry)}
	}
	if current.Equal(baselineVersion) {
		return diskInspection{kind: diskUnchanged, version: current}
	}
	stable, readErr := service.readStable(path)
	if readErr != nil {
		if errors.Is(readErr, file.ErrUnstableRead) {
			return diskInspection{kind: diskUnstable, version: stable.Version, classified: service.classifiedConflictError(documentID, apperr.ClassifiedConflict, "The file is changing; check again before saving.", apperr.RemediationRetry)}
		}
		return diskInspection{classified: service.classifiedConflictError(documentID, apperr.ClassifiedIOFailure, "The document could not be inspected.", apperr.RemediationRetry)}
	}
	if !stable.Version.Exists {
		if err := service.applyDetached(ctx, documentID, expectedRevision); err != nil {
			return diskInspection{classified: service.classifiedConflictError(documentID, apperr.ClassifiedConflict, "The document changed before detachment completed.", apperr.RemediationRetry)}
		}
		return diskInspection{kind: diskDetached, version: stable.Version}
	}
	if stable.Read.Error != nil {
		return diskInspection{classified: stable.Read.Error}
	}
	if stable.RawHash == baselineHash && characteristicsEqual(stable.Read.Characteristics, baselineCharacteristics) {
		if err := service.refreshDiskVersion(ctx, documentID, expectedRevision, stable.Version); err != nil {
			return diskInspection{classified: service.classifiedConflictError(documentID, apperr.ClassifiedConflict, "The document changed before the disk baseline could be refreshed.", apperr.RemediationRetry)}
		}
		return diskInspection{kind: diskUnchanged, version: stable.Version, rawHash: stable.RawHash, characteristics: stable.Read.Characteristics}
	}
	preview := buildConflictPreview(documentID, &documentSnapshot, stable.Read, stable.Version)
	if err := service.registerConflict(ctx, documentID, expectedRevision, stable, preview); err != nil {
		return diskInspection{classified: service.classifiedConflictError(documentID, apperr.ClassifiedConflict, "The external-change decision could not be queued.", apperr.RemediationRetry)}
	}
	return diskInspection{kind: diskConflict, version: stable.Version, rawHash: stable.RawHash, characteristics: stable.Read.Characteristics, preview: &preview}
}

func (service *AppModelService) prepareWriteDisk(ctx context.Context, documentID string, expectedRevision uint64, decisionToken string) apperr.WriteResult {
	inspection := service.inspectDocument(ctx, documentID, expectedRevision, decisionToken)
	if inspection.classified != nil {
		if inspection.kind == diskUnstable {
			return apperr.WriteResult{Status: apperr.WriteStatusConflict, Error: inspection.classified}
		}
		return apperr.WriteResult{Status: apperr.WriteStatusRefused, Error: inspection.classified}
	}
	if inspection.kind == diskConflict && inspection.preview != nil {
		return apperr.WriteResult{Status: apperr.WriteStatusConflict, Conflict: inspection.preview, Error: service.classifiedConflictError(documentID, apperr.ClassifiedConflict, "The file changed on disk before it could be saved.", apperr.RemediationNone)}
	}
	return apperr.WriteResult{}
}

func (service *AppModelService) conflictResultForInspection(documentID string, revision uint64, inspection diskInspection) apperr.ConflictResult {
	if inspection.classified != nil {
		if inspection.kind == diskUnstable {
			return service.conflictResultUnstable(documentID, revision)
		}
		return apperr.ConflictResult{Status: apperr.ConflictStatusRefused, DocumentID: documentID, DocumentRevision: revision, Error: inspection.classified}
	}
	switch inspection.kind {
	case diskConflict:
		return apperr.ConflictResult{Status: apperr.ConflictStatusDetected, DocumentID: documentID, DocumentRevision: revision, Preview: inspection.preview}
	case diskDetached:
		return apperr.ConflictResult{Status: apperr.ConflictStatusDetached, DocumentID: documentID, DocumentRevision: revision}
	default:
		return apperr.ConflictResult{Status: apperr.ConflictStatusUnchanged, DocumentID: documentID, DocumentRevision: revision}
	}
}

func (service *AppModelService) applyDetached(ctx context.Context, documentID string, expectedRevision uint64) error {
	service.mu.Lock()
	defer service.mu.Unlock()
	document, ok := service.state.documents[documentID]
	if !ok || document.metadata.ContentRevision != expectedRevision {
		return errConflictRevisionChanged
	}
	if document.detached && !document.baselineVersion.Exists {
		return nil
	}
	before := service.snapshotLocked()
	document.detached = true
	document.baselineVersion = file.DiskVersion{}
	document.baselineRawHash = ""
	document.baselineCharacteristics = file.FileCharacteristics{}
	service.removeConflictLocked(documentID)
	patch := service.documentPatchLocked(documentID)
	return service.publishLocked(ctx, before, patch)
}

func (service *AppModelService) refreshDiskVersion(ctx context.Context, documentID string, expectedRevision uint64, version file.DiskVersion) error {
	service.mu.Lock()
	defer service.mu.Unlock()
	document, ok := service.state.documents[documentID]
	if !ok || document.metadata.ContentRevision != expectedRevision {
		return errConflictRevisionChanged
	}
	before := service.snapshotLocked()
	document.baselineVersion = version
	document.detached = false
	patch := service.documentPatchLocked(documentID)
	return service.publishLocked(ctx, before, patch)
}

func (service *AppModelService) applyReload(ctx context.Context, documentID string, expectedRevision uint64, detected apperr.DiskVersion, stable file.StableClassifiedRead) error {
	service.mu.Lock()
	defer service.mu.Unlock()
	document, ok := service.state.documents[documentID]
	if !ok || document.metadata.ContentRevision != expectedRevision {
		return errConflictRevisionChanged
	}
	if !stable.Version.Equal(fileVersionFromWire(detected)) {
		return errConflictRevisionChanged
	}
	before := service.snapshotLocked()
	read := stable.Read
	document.content = read.Content
	document.baseline = read.Content
	document.baselineVersion = stable.Version
	document.baselineRawHash = stable.RawHash
	document.baselineCharacteristics = read.Characteristics
	document.baselineOrigin = SaveOriginReload
	document.committedRevision = document.metadata.ContentRevision
	document.failedWrite = false
	document.detached = false
	document.metadata.Encoding = string(read.Characteristics.Encoding)
	document.metadata.BOM = string(read.Characteristics.BOM)
	document.metadata.LineEnding = string(read.Characteristics.LineEnding)
	document.metadata.Capability = string(read.Capability)
	document.normalizationEnding = normalizationEndingForRead(read)
	document.metadata.SizeClass = "small"
	if read.Capability == file.CapabilityLargeReadOnly {
		document.metadata.SizeClass = "large"
	}
	document.metadata.WordCount = len(strings.Fields(read.Content))
	service.removeConflictLocked(documentID)
	patch := service.documentPatchLocked(documentID)
	return service.publishLocked(ctx, before, patch)
}

func (service *AppModelService) registerConflict(ctx context.Context, documentID string, expectedRevision uint64, stable file.StableClassifiedRead, preview apperr.ConflictPreview) error {
	service.mu.Lock()
	defer service.mu.Unlock()
	document, ok := service.state.documents[documentID]
	if !ok || document.metadata.ContentRevision != expectedRevision {
		return errConflictRevisionChanged
	}
	before := service.snapshotLocked()
	document.conflictBlocked = true
	service.conflicts[documentID] = &documentConflict{preview: preview, version: stable.Version, rawHash: stable.RawHash, read: stable.Read, createdAt: service.state.revision + 1}
	service.conflictQueue.Enqueue(conflictQueueEntry{DocumentID: documentID, ContentRevision: expectedRevision, DiskVersion: stable.Version, Preview: preview})
	patch := service.documentPatchLocked(documentID)
	return service.publishLocked(ctx, before, patch)
}

func (service *AppModelService) removeConflictLocked(documentID string) {
	delete(service.conflicts, documentID)
	service.conflictQueue.Remove(documentID)
	deleteTokensForDocument(service.keepMine, documentID)
	if document := service.state.documents[documentID]; document != nil {
		document.conflictBlocked = false
	}
}

func (service *AppModelService) invalidateConflict(ctx context.Context, documentID string) {
	service.mu.Lock()
	defer service.mu.Unlock()
	if _, ok := service.conflicts[documentID]; !ok {
		return
	}
	before := service.snapshotLocked()
	service.removeConflictLocked(documentID)
	patch := service.documentPatchLocked(documentID)
	_ = service.publishLocked(ctx, before, patch)
}

func (service *AppModelService) activeBufferFor(documentID string) (uint64, *apperr.ActiveBufferAcknowledgement) {
	service.mu.RLock()
	defer service.mu.RUnlock()
	document, ok := service.state.documents[documentID]
	if !ok {
		return service.state.revision, nil
	}
	if service.state.activeDocumentID != documentID {
		return service.state.revision, nil
	}
	return service.state.revision, &apperr.ActiveBufferAcknowledgement{DocumentID: documentID, DocumentRevision: document.metadata.ContentRevision, ProjectionRevision: service.state.revision, Content: document.content}
}

func (service *AppModelService) currentDiskVersion(path string) (file.DiskVersion, error) {
	service.mu.RLock()
	reader := service.diskVersion
	service.mu.RUnlock()
	if reader == nil {
		reader = file.CurrentDiskVersion
	}
	return reader(path)
}

func (service *AppModelService) readStable(path string) (file.StableClassifiedRead, error) {
	service.mu.RLock()
	reader := service.stableRead
	service.mu.RUnlock()
	if reader == nil {
		reader = file.ReadClassifiedStable
	}
	return reader(path, file.MaxClassifiedReadBytes)
}

func deleteTokensForDocument(tokens map[string]*keepMineAuthorization, documentID string) {
	for token, authorization := range tokens {
		if authorization.documentID == documentID {
			delete(tokens, token)
		}
	}
}

func buildConflictPreview(documentID string, document *openDocument, read file.ClassifiedRead, version file.DiskVersion) apperr.ConflictPreview {
	differences := characteristicsDifferences(document.baselineCharacteristics, read.Characteristics)
	return apperr.ConflictPreview{DocumentID: documentID, Path: document.metadata.Path, DisplayName: document.metadata.DisplayName, ContentRevision: document.metadata.ContentRevision, DetectedDiskVersion: diskVersionFromWire(version), OnDisk: boundedConflictSide(read.Content), Yours: boundedConflictSide(document.content), MetadataDifferences: differences, ReadOnly: document.metadata.Capability != string(file.CapabilityWritable)}
}

func boundedConflictSide(content string) apperr.ConflictPreviewSide {
	if !utf8.ValidString(content) {
		content = strings.ToValidUTF8(content, "\ufffd")
	}
	var builder strings.Builder
	lineCount, byteCount := 0, 0
	for _, line := range strings.SplitAfter(content, "\n") {
		if line == "" {
			continue
		}
		if lineCount == maxConflictPreviewLines {
			return apperr.ConflictPreviewSide{Text: builder.String(), LineCount: lineCount, ByteCount: byteCount, Truncated: true}
		}
		remaining := maxConflictPreviewBytes - byteCount
		if len([]byte(line)) <= remaining {
			builder.WriteString(line)
			byteCount += len([]byte(line))
			lineCount++
			continue
		}
		for _, runeValue := range line {
			runeBytes := utf8.RuneLen(runeValue)
			if runeBytes < 0 || runeBytes > remaining {
				break
			}
			builder.WriteRune(runeValue)
			remaining -= runeBytes
			byteCount += runeBytes
		}
		return apperr.ConflictPreviewSide{Text: builder.String(), LineCount: lineCount + 1, ByteCount: byteCount, Truncated: true}
	}
	return apperr.ConflictPreviewSide{Text: builder.String(), LineCount: lineCount, ByteCount: byteCount}
}

func characteristicsEqual(left, right file.FileCharacteristics) bool {
	return left.Encoding == right.Encoding && left.BOM == right.BOM && left.LineEnding == right.LineEnding && left.LFCount == right.LFCount && left.CRLFCount == right.CRLFCount && left.FirstEnding == right.FirstEnding && left.RawSizeBytes == right.RawSizeBytes && left.Mode.Perm() == right.Mode.Perm() && left.Capability == right.Capability && left.Warning == right.Warning
}

func characteristicsDifferences(left, right file.FileCharacteristics) []string {
	differences := make([]string, 0, 4)
	if left.BOM != right.BOM {
		differences = append(differences, fmt.Sprintf("BOM: %s -> %s", left.BOM, right.BOM))
	}
	if left.LineEnding != right.LineEnding {
		differences = append(differences, fmt.Sprintf("line endings: %s -> %s", left.LineEnding, right.LineEnding))
	}
	if left.Mode.Perm() != right.Mode.Perm() {
		differences = append(differences, fmt.Sprintf("permissions: %04o -> %04o", left.Mode.Perm(), right.Mode.Perm()))
	}
	if left.Encoding != right.Encoding || left.Capability != right.Capability {
		differences = append(differences, fmt.Sprintf("encoding/capability: %s/%s -> %s/%s", left.Encoding, left.Capability, right.Encoding, right.Capability))
	}
	return differences
}

func diskVersionFromWire(version file.DiskVersion) apperr.DiskVersion {
	return apperr.DiskVersion{Exists: version.Exists, Size: version.Size, ModifiedUnixNano: version.ModifiedUnixNano, Mode: uint32(version.Mode), FileIdentity: version.FileIdentity}
}

func fileVersionFromWire(version apperr.DiskVersion) file.DiskVersion {
	return file.DiskVersion{Exists: version.Exists, Size: version.Size, ModifiedUnixNano: version.ModifiedUnixNano, Mode: fs.FileMode(version.Mode), FileIdentity: version.FileIdentity}
}

// The external-change path is the other surface T117 made subject-visible, so it
// resolves the document's own label rather than relying on apperr's generic
// fallback. FR-FT-021's prompt and its errors name the same file the tab does.
func (service *AppModelService) classifiedConflictError(documentID string, category apperr.ClassifiedErrorCategory, message string, remediation apperr.ClassifiedRemediation) *apperr.ClassifiedError {
	errorValue := apperr.NewClassifiedError(category, service.safeDocumentLabelLocked(documentID), message, remediation, documentID)
	return &errorValue
}

func (service *AppModelService) conflictRefused(documentID string, category apperr.ClassifiedErrorCategory, message string, remediation apperr.ClassifiedRemediation) apperr.ConflictResult {
	return apperr.ConflictResult{Status: apperr.ConflictStatusRefused, DocumentID: documentID, Error: service.classifiedConflictError(documentID, category, message, remediation)}
}

// The handler's panic-recovery form: it holds the service interface, and the panic
// it is recovering from came from the code that owns the document map. See
// refusedWriteLabelled in save.go for the same reasoning.
func conflictRefusedLabelled(documentID string, category apperr.ClassifiedErrorCategory, message string, remediation apperr.ClassifiedRemediation) apperr.ConflictResult {
	errorValue := apperr.NewClassifiedError(category, "document", message, remediation, documentID)
	return apperr.ConflictResult{Status: apperr.ConflictStatusRefused, DocumentID: documentID, Error: &errorValue}
}

func (service *AppModelService) conflictResultUnstable(documentID string, revision uint64) apperr.ConflictResult {
	return apperr.ConflictResult{Status: apperr.ConflictStatusUnstable, DocumentID: documentID, DocumentRevision: revision, Error: service.classifiedConflictError(documentID, apperr.ClassifiedConflict, "The file is changing; check again before saving.", apperr.RemediationRetry)}
}

func hashBytes(data []byte) string {
	digest := sha256.Sum256(data)
	return hex.EncodeToString(digest[:])
}
