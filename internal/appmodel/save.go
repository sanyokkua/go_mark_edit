package appmodel

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"os"
	"path/filepath"
	"strings"

	"github.com/sanyokkua/go_mark_edit/internal/apperr"
	"github.com/sanyokkua/go_mark_edit/internal/bridge"
	"github.com/sanyokkua/go_mark_edit/internal/file"
)

type saveReservation struct {
	id       string
	identity file.Identity
	path     string
}

type normalizationAuthorization struct {
	token           string
	documentID      string
	contentRevision uint64
	proposedEnding  string
}

type writeSnapshot struct {
	documentID        string
	contentRevision   uint64
	content           string
	path              string
	identity          file.Identity
	metadata          apperr.DocumentMetadata
	expectedVersion   file.DiskVersion
	expectedRawHash   string
	targetPathAdopted bool
}

type encodedWrite struct {
	data              []byte
	lineEndingOutcome apperr.LineEndingOutcome
	bomOutcome        apperr.BOMOutcome
}

// Save writes a path-backed document or enters the native Save As flow for an untitled one.
func (service *AppModelService) Save(ctx context.Context, documentID string, expectedContentRevision uint64, decisionToken string) apperr.WriteResult {
	service.mu.RLock()
	if service.shutdownDraining {
		service.mu.RUnlock()
		return bridge.Refused[apperr.WriteResult](apperr.ClassifiedConflict, "application", "The application is finishing an earlier close request.", apperr.RemediationRetry)
	}
	document, ok := service.state.documents[documentID]
	if !ok {
		service.mu.RUnlock()
		return bridge.Refused[apperr.WriteResult](service.documentLabel(documentID), documentID, apperr.ClassifiedNotFound, "The document could not be found.", apperr.RemediationNone)
	}
	if document.metadata.ContentRevision != expectedContentRevision {
		service.mu.RUnlock()
		return bridge.Refused[apperr.WriteResult](service.documentLabel(documentID), documentID, apperr.ClassifiedConflict, "The document changed before it could be saved.", apperr.RemediationRetry)
	}
	if document.metadata.Capability != string(file.CapabilityWritable) {
		service.mu.RUnlock()
		return bridge.Refused[apperr.WriteResult](service.documentLabel(documentID), documentID, apperr.ClassifiedPermissionDenied, "The document is read-only and cannot be saved.", apperr.RemediationNone)
	}
	path := document.metadata.Path
	// FR-FT-011 requires a save to refuse before disk access when it has no
	// matching authorization. prepareWriteDisk below stats the file and can run a
	// full stable re-read through inspectDocument, so the check has to happen
	// here — it used to happen inside snapshotForWrite, one disk inspection too
	// late, which also meant a file that had changed underneath reported the
	// conflict and never mentioned the line endings. SaveAs has always gated
	// here; this is the same gate. An untitled document falls through to SaveAs,
	// which runs it.
	if path != "" && document.metadata.LineEnding == string(file.LineEndingMixed) {
		authorization, authorized := normalizationAuthorizationForLocked(document, decisionToken)
		if !authorized || authorization.documentID != documentID || authorization.contentRevision != expectedContentRevision || authorization.proposedEnding != document.normalizationEnding {
			service.mu.RUnlock()
			return service.RequestNormalization(documentID, expectedContentRevision)
		}
	}
	service.mu.RUnlock()
	if path == "" {
		return service.SaveAs(ctx, documentID, expectedContentRevision, decisionToken)
	}
	service.flushAutosave(documentID)
	if result := service.prepareWriteDisk(ctx, documentID, expectedContentRevision, decisionToken); result.Status != "" {
		return result
	}

	snapshot, result := service.snapshotForWrite(documentID, expectedContentRevision, decisionToken, path, false)
	if result.Status != "" {
		return result
	}
	return service.executeWrite(ctx, snapshot, SaveOriginExplicitSave)
}

// SaveAs chooses and validates a target before any target or model mutation occurs.
func (service *AppModelService) SaveAs(ctx context.Context, documentID string, expectedContentRevision uint64, decisionToken string) apperr.WriteResult {
	service.mu.RLock()
	if service.shutdownDraining {
		service.mu.RUnlock()
		return bridge.Refused[apperr.WriteResult](apperr.ClassifiedConflict, "application", "The application is finishing an earlier close request.", apperr.RemediationRetry)
	}
	document, ok := service.state.documents[documentID]
	if !ok {
		service.mu.RUnlock()
		return bridge.Refused[apperr.WriteResult](service.documentLabel(documentID), documentID, apperr.ClassifiedNotFound, "The document could not be found.", apperr.RemediationNone)
	}
	if document.metadata.ContentRevision != expectedContentRevision {
		service.mu.RUnlock()
		return bridge.Refused[apperr.WriteResult](service.documentLabel(documentID), documentID, apperr.ClassifiedConflict, "The document changed before it could be saved.", apperr.RemediationRetry)
	}
	if document.metadata.Capability != string(file.CapabilityWritable) {
		service.mu.RUnlock()
		return bridge.Refused[apperr.WriteResult](service.documentLabel(documentID), documentID, apperr.ClassifiedPermissionDenied, "The document is read-only and cannot be saved.", apperr.RemediationNone)
	}
	if document.metadata.LineEnding == string(file.LineEndingMixed) {
		authorization, authorized := normalizationAuthorizationForLocked(document, decisionToken)
		if !authorized || authorization.documentID != documentID || authorization.contentRevision != expectedContentRevision || authorization.proposedEnding != document.normalizationEnding {
			service.mu.RUnlock()
			return service.RequestNormalization(documentID, expectedContentRevision)
		}
	}
	sourcePath := document.metadata.Path
	dialog := service.saveDialog
	defaultFilename := document.metadata.DisplayName
	defaultDirectory := filepath.Dir(document.metadata.Path)
	if defaultFilename == "" {
		defaultFilename = "Untitled.md"
	} else if filepath.Ext(defaultFilename) == "" {
		defaultFilename += ".md"
	}
	if defaultDirectory == "." || defaultDirectory == "" {
		defaultDirectory = ""
	}
	service.mu.RUnlock()
	if sourcePath != "" {
		if result := service.prepareWriteDisk(ctx, documentID, expectedContentRevision, decisionToken); result.Status != "" {
			return result
		}
	}
	if dialog == nil {
		return bridge.Refused[apperr.WriteResult](service.documentLabel(documentID), documentID, apperr.ClassifiedSystemCommandFailure, "The Save dialog is unavailable.", apperr.RemediationRetry)
	}
	selected, err := dialog.ChooseSaveFile(ctx, SaveDialogRequest{DefaultDirectory: defaultDirectory, DefaultFilename: defaultFilename, Title: "Save Markdown document"})
	if err != nil {
		return bridge.Refused[apperr.WriteResult](service.documentLabel(documentID), documentID, apperr.ClassifiedSystemCommandFailure, "The Save dialog could not be opened.", apperr.RemediationRetry)
	}
	if strings.TrimSpace(selected) == "" {
		return apperr.WriteResult{Status: apperr.WriteStatusCancelled}
	}
	if filepath.Ext(selected) == "" {
		selected += ".md"
	}
	if !file.IsSupportedDocumentSuffix(selected) {
		return bridge.Refused[apperr.WriteResult](service.documentLabel(documentID), documentID, apperr.ClassifiedUnsupportedInput, "The selected save name has an unsupported suffix.", apperr.RemediationNone)
	}
	candidate, err := file.CanonicalizeCandidateDocumentPath(selected)
	if err != nil {
		return bridge.Refused[apperr.WriteResult](service.documentLabel(documentID), documentID, apperr.ClassifiedIOFailure, "The Save As target could not be resolved.", apperr.RemediationRetry)
	}

	reservationID, conflict := service.reserveSaveTarget(documentID, candidate)
	if conflict != nil {
		return bridge.FromClassified[apperr.WriteResult](conflict, apperr.WriteStatusConflict)
	}
	defer service.releaseSaveTarget(reservationID)

	expectedVersion, versionErr := file.CurrentDiskVersion(candidate.Path)
	if versionErr != nil {
		return bridge.Refused[apperr.WriteResult](service.documentLabel(documentID), documentID, apperr.ClassifiedIOFailure, "The Save As target could not be inspected.", apperr.RemediationRetry)
	}
	expectedHash := ""
	if expectedVersion.Exists {
		confirmed, confirmErr := dialog.ConfirmOverwrite(ctx, candidate.DisplayName)
		if confirmErr != nil {
			return bridge.Refused[apperr.WriteResult](service.documentLabel(documentID), documentID, apperr.ClassifiedSystemCommandFailure, "The overwrite confirmation could not be shown.", apperr.RemediationRetry)
		}
		if !confirmed {
			return apperr.WriteResult{Status: apperr.WriteStatusCancelled}
		}
		expectedVersion, versionErr = file.CurrentDiskVersion(candidate.Path)
		if versionErr != nil {
			return bridge.Refused[apperr.WriteResult](service.documentLabel(documentID), documentID, apperr.ClassifiedIOFailure, "The Save As target could not be inspected after confirmation.", apperr.RemediationRetry)
		}
		expectedHash, err = stableRawBytesHash(candidate.Path, expectedVersion)
		if err != nil {
			if errors.Is(err, errTargetDiskChanged) {
				return bridge.Conflict[apperr.WriteResult](service.documentLabel(documentID), documentID, apperr.ClassifiedConflict, "The Save As target changed after confirmation.", apperr.RemediationNone)
			}
			return bridge.Refused[apperr.WriteResult](service.documentLabel(documentID), documentID, apperr.ClassifiedIOFailure, "The Save As target could not be read.", apperr.RemediationRetry)
		}
	}

	snapshot, result := service.snapshotForWrite(documentID, expectedContentRevision, decisionToken, candidate.Path, true)
	if result.Status != "" {
		return result
	}
	snapshot.identity = candidate.Identity
	snapshot.expectedVersion = expectedVersion
	snapshot.expectedRawHash = expectedHash
	service.mu.RLock()
	hook := service.beforeSaveAsRecheck
	service.mu.RUnlock()
	if hook != nil {
		if hookErr := callSaveHook(hook, candidate.Path); hookErr != nil {
			return bridge.Refused[apperr.WriteResult](service.documentLabel(documentID), documentID, apperr.ClassifiedIOFailure, "The Save As target could not be prepared.", apperr.RemediationRetry)
		}
	}
	currentVersion, versionErr := file.CurrentDiskVersion(candidate.Path)
	if versionErr != nil || !currentVersion.Equal(expectedVersion) {
		return bridge.Conflict[apperr.WriteResult](service.documentLabel(documentID), documentID, apperr.ClassifiedConflict, "The Save As target changed after confirmation.", apperr.RemediationNone)
	}
	if expectedHash != "" {
		currentHash, hashErr := rawBytesHash(candidate.Path)
		if hashErr != nil || currentHash != expectedHash {
			return bridge.Conflict[apperr.WriteResult](service.documentLabel(documentID), documentID, apperr.ClassifiedConflict, "The Save As target bytes changed after confirmation.", apperr.RemediationNone)
		}
	}

	return service.executeWrite(ctx, snapshot, SaveOriginSaveAs)
}

// RequestNormalization creates a single-use revision-bound mixed-ending authorization.
func (service *AppModelService) RequestNormalization(documentID string, expectedContentRevision uint64) apperr.WriteResult {
	service.mu.Lock()
	defer service.mu.Unlock()
	document, ok := service.state.documents[documentID]
	if !ok {
		return bridge.Refused[apperr.WriteResult](service.safeDocumentLabelLocked(documentID), documentID, apperr.ClassifiedNotFound, "The document could not be found.", apperr.RemediationNone)
	}
	if document.metadata.ContentRevision != expectedContentRevision || document.metadata.LineEnding != string(file.LineEndingMixed) {
		return bridge.Refused[apperr.WriteResult](service.safeDocumentLabelLocked(documentID), documentID, apperr.ClassifiedConflict, "The normalization request is no longer valid.", apperr.RemediationRetry)
	}
	proposed := document.normalizationEnding
	if proposed == "" {
		proposed = string(file.LineEndingLF)
	}
	token := mintDocumentID()
	document.normalization = &normalizationAuthorization{token: token, documentID: documentID, contentRevision: expectedContentRevision, proposedEnding: proposed}
	return apperr.WriteResult{Status: apperr.WriteStatusNeedsNormalization, DecisionToken: token, ProposedEnding: proposed, DocumentRevision: expectedContentRevision}
}

// CancelNormalization releases a normalization authorization that was minted for
// a prompt the user then dismissed.
//
// FR-FT-011 makes the confirmation single-use and says "cancellation MUST resume
// nothing". Confirming consumes the authorization; before T168 nothing released
// it when the prompt was dismissed instead, so it survived for the process
// lifetime, the next Save minted another, and service.normalizations was never
// swept. T135 closed the same leak on the autosave arm.
//
// Deliberately idempotent, and deliberately not an error when the token is
// unknown or names another document. A dismissal can legitimately arrive after
// the authorization has already been consumed or invalidated — the document
// moved on, or the prompt was answered twice — and in every one of those cases
// the caller's intent is already satisfied. Reporting a failure would put a
// classified error in front of a user who did nothing wrong, and the security
// property is unchanged: the token buys nothing either way.
//
// Returns ClassifiedVoidResult rather than nothing because this is reachable
// across the Wails bridge, where every bound handler must answer with a typed
// apperr result.
func (service *AppModelService) CancelNormalization(documentID, token string) apperr.ClassifiedVoidResult {
	service.mu.Lock()
	defer service.mu.Unlock()
	document := service.state.documents[documentID]
	if document != nil && document.normalization != nil && document.normalization.token == token {
		document.normalization = nil
	}
	return apperr.ClassifiedVoidResult{}
}

func (service *AppModelService) snapshotForWrite(documentID string, expectedContentRevision uint64, decisionToken, targetPath string, targetPathAdopted bool) (writeSnapshot, apperr.WriteResult) {
	service.mu.Lock()
	defer service.mu.Unlock()
	document, ok := service.state.documents[documentID]
	if !ok {
		return writeSnapshot{}, bridge.Refused[apperr.WriteResult](service.safeDocumentLabelLocked(documentID), documentID, apperr.ClassifiedNotFound, "The document could not be found.", apperr.RemediationNone)
	}
	if document.metadata.ContentRevision != expectedContentRevision {
		return writeSnapshot{}, bridge.Refused[apperr.WriteResult](service.safeDocumentLabelLocked(documentID), documentID, apperr.ClassifiedConflict, "The document changed before it could be saved.", apperr.RemediationRetry)
	}
	if document.metadata.Capability != string(file.CapabilityWritable) {
		return writeSnapshot{}, bridge.Refused[apperr.WriteResult](service.safeDocumentLabelLocked(documentID), documentID, apperr.ClassifiedPermissionDenied, "The document is read-only and cannot be saved.", apperr.RemediationNone)
	}
	if !targetPathAdopted && document.metadata.Path != targetPath {
		return writeSnapshot{}, bridge.Refused[apperr.WriteResult](service.safeDocumentLabelLocked(documentID), documentID, apperr.ClassifiedConflict, "The document path changed before it could be saved.", apperr.RemediationRetry)
	}
	if document.metadata.LineEnding == string(file.LineEndingMixed) {
		authorization, ok := normalizationAuthorizationForLocked(document, decisionToken)
		if !ok || authorization.documentID != documentID || authorization.contentRevision != expectedContentRevision || authorization.proposedEnding != document.normalizationEnding {
			requested := service.requestNormalizationLocked(documentID, expectedContentRevision)
			return writeSnapshot{}, requested
		}
		document.normalization = nil
	}
	return writeSnapshot{
		documentID: documentID, contentRevision: expectedContentRevision, content: document.content,
		path: targetPath, identity: document.identity, metadata: document.metadata,
		expectedVersion: document.baselineVersion, targetPathAdopted: targetPathAdopted,
	}, apperr.WriteResult{}
}

func (service *AppModelService) requestNormalizationLocked(documentID string, expectedContentRevision uint64) apperr.WriteResult {
	document := service.state.documents[documentID]
	proposed := document.normalizationEnding
	if proposed == "" {
		proposed = string(file.LineEndingLF)
	}
	token := mintDocumentID()
	document.normalization = &normalizationAuthorization{token: token, documentID: documentID, contentRevision: expectedContentRevision, proposedEnding: proposed}
	return apperr.WriteResult{Status: apperr.WriteStatusNeedsNormalization, DecisionToken: token, ProposedEnding: proposed, DocumentRevision: expectedContentRevision}
}

func (service *AppModelService) executeWrite(ctx context.Context, snapshot writeSnapshot, origin SaveOrigin) apperr.WriteResult {
	ctx = service.runtimeContextOr(ctx)
	encoded, err := encodeWrite(snapshot, origin, service.normalizationEndingFor(snapshot.documentID))
	if err != nil {
		return bridge.Refused[apperr.WriteResult](documentLabelFromMetadata(snapshot.metadata), snapshot.documentID, apperr.ClassifiedIOFailure, "The document could not be encoded for saving.", apperr.RemediationRetry)
	}
	if !service.setWriteInFlight(ctx, snapshot.documentID, true) {
		service.mu.RLock()
		documentClosing := false
		documentExists := false
		if document := service.state.documents[snapshot.documentID]; document != nil {
			documentExists = true
			documentClosing = document.closing
		}
		service.mu.RUnlock()
		if documentClosing {
			return bridge.Refused[apperr.WriteResult](documentLabelFromMetadata(snapshot.metadata), snapshot.documentID, apperr.ClassifiedConflict, "The document is closing and cannot accept a new write.", apperr.RemediationRetry)
		}
		if !documentExists {
			return bridge.Refused[apperr.WriteResult](documentLabelFromMetadata(snapshot.metadata), snapshot.documentID, apperr.ClassifiedNotFound, "The document was closed before the save started.", apperr.RemediationNone)
		}
		return bridge.Refused[apperr.WriteResult](documentLabelFromMetadata(snapshot.metadata), snapshot.documentID, apperr.ClassifiedConflict, "The document could not accept the save.", apperr.RemediationRetry)
	}
	coordinator := service.writeCoordinator(snapshot.documentID)
	if coordinator == nil {
		service.setWriteInFlight(ctx, snapshot.documentID, false)
		return bridge.Refused[apperr.WriteResult]("document", snapshot.documentID, apperr.ClassifiedNotFound, "The document was closed before the save started.", apperr.RemediationNone)
	}
	committed, replaceErr := coordinator.Commit(WriteSnapshot{
		DocumentID: snapshot.documentID, ContentRevision: snapshot.contentRevision,
		CanonicalContent: snapshot.content, TargetPath: snapshot.path,
		ExpectedDiskVersion: &snapshot.expectedVersion, encodedData: encoded.data,
	})
	committedToDisk := committed.Snapshot.DocumentID != ""
	if committedToDisk {
		service.mu.RLock()
		observer := service.writeCommitObserver
		service.mu.RUnlock()
		if observer != nil {
			observer(committed, origin)
		}
	}
	if !committedToDisk {
		service.setWriteInFlight(ctx, snapshot.documentID, false)
		category := apperr.ClassifiedIOFailure
		message := "The document could not be saved."
		remediation := apperr.RemediationRetry
		if atomicErr, ok := replaceErr.(*file.AtomicReplaceError); ok && atomicErr.Classified != nil {
			category = atomicErr.Classified.Category
			message = atomicErr.Classified.Message
			// Carry the classification's own remediation rather than re-deciding it
			// here. This hardcoded Retry for whatever category the atomic replace
			// produced, which is how a permission-denied write came to offer one.
			// An atomic-replace classification carries one action by construction
			// (newAtomicReplaceError names a single row), so the first is the whole set.
			remediation = atomicErr.Classified.Remediation()
		}
		if category == apperr.ClassifiedConflict {
			return bridge.Conflict[apperr.WriteResult](documentLabelFromMetadata(snapshot.metadata), snapshot.documentID, apperr.ClassifiedConflict, message, apperr.RemediationNone)
		}
		return bridge.Refused[apperr.WriteResult](documentLabelFromMetadata(snapshot.metadata), snapshot.documentID, category, message, remediation)
	}

	service.mu.Lock()
	document, ok := service.state.documents[snapshot.documentID]
	if !ok {
		service.mu.Unlock()
		return bridge.Refused[apperr.WriteResult](documentLabelFromMetadata(snapshot.metadata), snapshot.documentID, apperr.ClassifiedNotFound, "The document was closed before the save completed.", apperr.RemediationNone)
	}
	before := service.snapshotLocked()
	document.writeInFlight = false
	if snapshot.targetPathAdopted {
		candidate, candidateErr := file.CanonicalizeCandidateDocumentPath(snapshot.path)
		if candidateErr == nil {
			document.metadata.Path = candidate.Path
			document.metadata.DisplayName = candidate.DisplayName
			document.metadata.ParentName = candidate.ParentName
			document.identity = candidate.Identity
			document.canonicalPath = candidate.Path
		}
		document.metadata.Capability = string(file.CapabilityWritable)
		document.metadata.SizeClass = "small"
		document.metadata.Encoding = string(file.EncodingUTF8)
		document.metadata.BOM = string(file.BOMAbsent)
		document.metadata.LineEnding = string(file.LineEndingLF)
	}
	document.metadata.LineEnding = writtenLineEnding(snapshot, service.normalizationEndingForLocked(snapshot.documentID))
	document.normalizationEnding = ""
	document.detached = false
	applyCommittedBaseline(document, committed.Snapshot, committed.DiskVersion, origin)
	document.baselineRawHash = hashBytes(encoded.data)
	document.baselineCharacteristics = characteristicsForWrittenSnapshot(snapshot, encoded, committed.DiskVersion)
	service.removeConflictLocked(snapshot.documentID)
	if document.metadata.LineEnding == string(file.LineEndingLF) && encoded.lineEndingOutcome == apperr.LineEndingPreservedCRLF {
		document.metadata.LineEnding = string(file.LineEndingCRLF)
	}
	recentRepository := service.recentFiles
	shouldPromoteRecent := origin == SaveOriginExplicitSave || origin == SaveOriginSaveAs
	if !shouldPromoteRecent {
		recentRepository = nil
	} else if recentRepository == nil {
		service.state.recentFiles = promoteRecentFile(service.state.recentFiles, snapshot.path)
	}
	patch := service.documentPatchLocked(snapshot.documentID)
	projectionRevision := service.state.revision
	resyncRequired := false
	if err := service.publishCommittedLocked(ctx, before, patch); err != nil {
		resyncRequired = true
	}
	service.mu.Unlock()

	var promotionWarning *apperr.ClassifiedError
	if recentRepository != nil {
		entries, promoteErr := recentRepository.Promote(ctx, snapshot.path)
		if promoteErr != nil {
			promotionWarning = bridge.ClassifiedWithID(apperr.ClassifiedPersistenceWarning, snapshot.path, "The document was saved successfully, but recent-file history could not be updated.", apperr.RemediationNone, "recent-files")
		} else {
			service.publishRecentFiles(ctx, entries)
		}
	}
	if replaceErr != nil {
		resyncRequired = true
	}
	result := apperr.WriteResult{Status: apperr.WriteStatusCommitted, Data: &apperr.CommittedWriteOutcome{
		DocumentID: snapshot.documentID, WrittenContentRevision: snapshot.contentRevision,
		CommittedProjectionRevision: projectionRevision, TargetPath: snapshot.path,
		TargetPathAdopted: snapshot.targetPathAdopted, LineEndingOutcome: encoded.lineEndingOutcome,
		BOMOutcome: encoded.bomOutcome, ResyncRequired: resyncRequired,
	}, Error: promotionWarning}
	result.Failure = bridge.FailureFromClassified(promotionWarning)
	return result
}

func (service *AppModelService) setWriteInFlight(ctx context.Context, documentID string, inFlight bool) bool {
	ctx = service.runtimeContextOr(ctx)
	service.mu.Lock()
	document, ok := service.state.documents[documentID]
	if !ok || (inFlight && document.closing) {
		service.mu.Unlock()
		return false
	}
	if document.writeInFlight == inFlight {
		service.mu.Unlock()
		return true
	}
	before := service.snapshotLocked()
	document.writeInFlight = inFlight
	patch := service.documentPatchLocked(documentID)
	// This is lifecycle bookkeeping around an accepted write, not a reversible
	// user command. Keep the state transition even when the projection cannot
	// be delivered so a failed emitter cannot leave the document permanently
	// marked as writing.
	_ = service.publishCommittedLocked(ctx, before, patch)
	service.mu.Unlock()
	return true
}

func (service *AppModelService) writeCoordinator(documentID string) *DocumentWriteCoordinator {
	service.mu.Lock()
	defer service.mu.Unlock()
	document := service.state.documents[documentID]
	if document == nil {
		return nil
	}
	if document.writeQueue != nil {
		return document.writeQueue
	}
	executor := service.writeExecutor
	if executor == nil {
		executor = func(snapshot WriteSnapshot) (file.DiskVersion, error) {
			replaced, err := file.AtomicReplace(file.AtomicReplaceRequest{
				TargetPath: snapshot.TargetPath, Data: snapshot.encodedData,
				ExpectedVersion: snapshot.ExpectedDiskVersion,
			})
			if replaced.Committed && err != nil {
				return replaced.Version, &committedWriteError{version: replaced.Version, err: err}
			}
			return replaced.Version, err
		}
	}
	coordinator := NewDocumentWriteCoordinator(executor)
	document.writeQueue = coordinator
	return coordinator
}

func (service *AppModelService) normalizationEndingFor(documentID string) string {
	service.mu.RLock()
	defer service.mu.RUnlock()
	if document := service.state.documents[documentID]; document != nil {
		return document.normalizationEnding
	}
	return ""
}

func (service *AppModelService) normalizationEndingForLocked(documentID string) string {
	if document := service.state.documents[documentID]; document != nil {
		return document.normalizationEnding
	}
	return ""
}

func writtenLineEnding(snapshot writeSnapshot, normalizationEnding string) string {
	ending := snapshot.metadata.LineEnding
	if ending == string(file.LineEndingMixed) {
		ending = normalizationEnding
	}
	if ending == string(file.LineEndingNone) && strings.Contains(snapshot.content, "\n") {
		return string(file.LineEndingLF)
	}
	if ending == "" {
		return string(file.LineEndingLF)
	}
	return ending
}

func encodeWrite(snapshot writeSnapshot, origin SaveOrigin, normalizationEnding string) (encodedWrite, error) {
	ending := snapshot.metadata.LineEnding
	if ending == string(file.LineEndingMixed) {
		if normalizationEnding == "" {
			return encodedWrite{}, errors.New("mixed line-ending authorization is required")
		}
		ending = normalizationEnding
	}
	encoding := file.Encoding(snapshot.metadata.Encoding)
	if encoding == "" {
		encoding = file.EncodingUTF8
	}
	bom := file.BOM(snapshot.metadata.BOM)
	if bom == "" {
		bom = file.BOMAbsent
	}
	data, err := file.EncodeDocument(file.DocumentSnapshot{
		Content: snapshot.content, Encoding: encoding, BOM: bom, LineEnding: file.LineEnding(ending),
	})
	if err != nil {
		return encodedWrite{}, err
	}
	lineOutcome := apperr.LineEndingPreservedLF
	if snapshot.metadata.Path == "" {
		lineOutcome = apperr.LineEndingNewLF
	} else if snapshot.metadata.LineEnding == string(file.LineEndingMixed) {
		if ending == string(file.LineEndingCRLF) {
			lineOutcome = apperr.LineEndingNormalizedCRLF
		} else {
			lineOutcome = apperr.LineEndingNormalizedLF
		}
	} else if ending == string(file.LineEndingCRLF) {
		lineOutcome = apperr.LineEndingPreservedCRLF
	}
	if origin == SaveOriginSaveAs && snapshot.metadata.LineEnding == string(file.LineEndingMixed) {
		if ending == string(file.LineEndingCRLF) {
			lineOutcome = apperr.LineEndingNormalizedCRLF
		} else {
			lineOutcome = apperr.LineEndingNormalizedLF
		}
	}
	bomOutcome := apperr.BOMOutcomeAbsent
	if bom == file.BOMPresent {
		bomOutcome = apperr.BOMOutcomePreserved
	}
	return encodedWrite{data: data, lineEndingOutcome: lineOutcome, bomOutcome: bomOutcome}, nil
}

func (service *AppModelService) reserveSaveTarget(documentID string, candidate file.CanonicalDocumentPath) (string, *apperr.ClassifiedError) {
	service.mu.Lock()
	defer service.mu.Unlock()
	for otherID, document := range service.state.documents {
		if otherID != documentID && !document.identity.IsZero() && document.identity.Equal(candidate.Identity) {
			return "", bridge.Classified(apperr.ClassifiedConflict, "The Save As target is already open.")
		}
	}
	for otherID, document := range service.state.documents {
		if otherID == documentID || document.saveReservation == nil {
			continue
		}
		if document.saveReservation.identity.Equal(candidate.Identity) {
			return "", bridge.Classified(apperr.ClassifiedConflict, "The Save As target is already reserved.")
		}
	}
	id := mintDocumentID()
	document := service.state.documents[documentID]
	if document == nil {
		return "", bridge.Classified(apperr.ClassifiedNotFound, "The document is no longer open.")
	}
	document.saveReservation = &saveReservation{id: id, identity: candidate.Identity, path: candidate.Path}
	return id, nil
}

func (service *AppModelService) releaseSaveTarget(reservationID string) {
	service.mu.Lock()
	defer service.mu.Unlock()
	service.releaseSaveTargetLocked(reservationID)
}

func (service *AppModelService) releaseSaveTargetLocked(reservationID string) {
	for _, document := range service.state.documents {
		if document.saveReservation != nil && document.saveReservation.id == reservationID {
			document.saveReservation = nil
		}
	}
}

func rawBytesHash(path string) (string, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return "", err
	}
	digest := sha256.Sum256(data)
	return hex.EncodeToString(digest[:]), nil
}

func characteristicsForWrittenSnapshot(snapshot writeSnapshot, encoded encodedWrite, version file.DiskVersion) file.FileCharacteristics {
	lineEnding := file.LineEnding(snapshot.metadata.LineEnding)
	if lineEnding == file.LineEndingMixed {
		if encoded.lineEndingOutcome == apperr.LineEndingNormalizedCRLF {
			lineEnding = file.LineEndingCRLF
		} else {
			lineEnding = file.LineEndingLF
		}
	}
	if lineEnding == "" {
		lineEnding = file.LineEndingLF
	}
	bom := file.BOM(snapshot.metadata.BOM)
	if bom == "" {
		bom = file.BOMAbsent
	}
	return file.FileCharacteristics{
		Encoding: file.EncodingUTF8, BOM: bom, LineEnding: lineEnding,
		RawSizeBytes: int64(len(encoded.data)), Capability: file.CapabilityWritable, Mode: version.Mode,
	}
}

var errTargetDiskChanged = errors.New("target disk version changed while reading")

func stableRawBytesHash(path string, expected file.DiskVersion) (string, error) {
	before, err := file.CurrentDiskVersion(path)
	if err != nil {
		return "", err
	}
	if !before.Equal(expected) {
		return "", errTargetDiskChanged
	}
	hash, err := rawBytesHash(path)
	if err != nil {
		return "", err
	}
	after, err := file.CurrentDiskVersion(path)
	if err != nil {
		return "", err
	}
	if !after.Equal(before) {
		return "", errTargetDiskChanged
	}
	return hash, nil
}

func callSaveHook(hook func(string), path string) (err error) {
	if bridge.Protect(func() { hook(path) }) {
		return errors.New("save hook panicked")
	}
	return nil
}

/*
 * The label a classified error may show the user for a document.
 *
 * FR-FT-035's order: the disambiguated tab label where one exists, otherwise the
 * basename of the path, otherwise the title. `NewClassifiedError` still runs
 * `filepath.Base` over whatever this returns, so a full path can never escape even
 * if a caller passes one.
 *
 * "document" is the last resort rather than the id: an id is never a safe subject,
 * and a generic word is a smaller failure than leaking internal state.
 */
// The `Locked` suffix follows this package's existing convention (see
// `effectiveDocumentMetadataLocked`): the caller already holds `service.mu`.
//
// It must not take the lock itself. Several write and conflict paths call it from
// inside locked regions, and Go's RWMutex is not reentrant — an inner RLock deadlocks
// as soon as a writer is queued behind it.
func (service *AppModelService) safeDocumentLabelLocked(documentID string) string {
	document, ok := service.state.documents[documentID]
	if !ok {
		return "document"
	}
	return documentLabelFromMetadata(document.metadata)
}

func (service *AppModelService) documentLabel(documentID string) string {
	service.mu.RLock()
	document := service.state.documents[documentID]
	if document == nil {
		service.mu.RUnlock()
		return "document"
	}
	metadata := document.metadata
	service.mu.RUnlock()
	return documentLabelFromMetadata(metadata)
}

func documentLabelFromMetadata(metadata apperr.DocumentMetadata) string {
	if metadata.DisplayName != "" {
		return metadata.DisplayName
	}
	if metadata.Path != "" {
		return filepath.Base(metadata.Path)
	}
	if metadata.Title != "" {
		return metadata.Title
	}
	return "document"
}
