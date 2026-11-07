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

const (
	saveDocumentNotFoundMessage = "The document could not be found."
	saveDocumentChangedMessage  = "The document changed before it could be saved."
	saveDocumentReadOnlyMessage = "The document is read-only and cannot be saved."
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
	accepted        bool
}

type writeSnapshot struct {
	closePlanID     string
	documentID      string
	contentRevision uint64
	content         string
	path            string
	identity        file.Identity
	metadata        apperr.DocumentMetadata
	expectedVersion file.DiskVersion
	expectedRawHash string
	// expectedCharacteristics describe the bytes the write expects to replace:
	// the loaded baseline's or a Keep mine authorization's.
	expectedCharacteristics file.FileCharacteristics
	targetPathAdopted       bool
	// documentFile marks a write to the file the document was loaded from,
	// whose disk changes are compared with the loaded document.
	documentFile bool
}

type encodedWrite struct {
	data              []byte
	lineEndingOutcome apperr.LineEndingOutcome
	bomOutcome        apperr.BOMOutcome
}

// Save writes a path-backed document or enters the native Save As flow for an untitled one.
func (service *AppModelService) Save(ctx context.Context, documentID string, expectedContentRevision uint64, decisionToken string) apperr.WriteResult {
	return service.save(ctx, documentID, expectedContentRevision, decisionToken, "")
}

func (service *AppModelService) save(ctx context.Context, documentID string, expectedContentRevision uint64, decisionToken, closePlanID string) apperr.WriteResult {
	service.mu.RLock()
	if service.shutdownDraining {
		service.mu.RUnlock()
		return bridge.Refused[apperr.WriteResult](apperr.ClassifiedConflict, "application", "The application is finishing an earlier close request.", apperr.RemediationRetry)
	}
	document, ok := service.state.documents[documentID]
	if !ok {
		service.mu.RUnlock()
		return bridge.Refused[apperr.WriteResult](service.documentLabel(documentID), documentID, apperr.ClassifiedNotFound, saveDocumentNotFoundMessage, apperr.RemediationNone)
	}
	if document.metadata.ContentRevision != expectedContentRevision {
		service.mu.RUnlock()
		return bridge.Refused[apperr.WriteResult](service.documentLabel(documentID), documentID, apperr.ClassifiedConflict, saveDocumentChangedMessage, apperr.RemediationRetry)
	}
	if document.metadata.Capability != string(file.CapabilityWritable) {
		service.mu.RUnlock()
		return bridge.Refused[apperr.WriteResult](service.documentLabel(documentID), documentID, apperr.ClassifiedPermissionDenied, saveDocumentReadOnlyMessage, apperr.RemediationNone)
	}
	path := document.metadata.Path
	// A document with mixed line endings needs a matching normalization
	// authorization before any disk access, so the user is asked about the line
	// endings before prepareWriteDisk stats or re-reads the file and before any
	// external change is reported. SaveAs applies the same gate; an untitled
	// document falls through to SaveAs, which runs it.
	if path != "" && document.metadata.LineEnding == string(file.LineEndingMixed) {
		authorization, authorized := normalizationAuthorizationForLocked(document, decisionToken)
		if !authorized || authorization.documentID != documentID || authorization.contentRevision != expectedContentRevision || authorization.proposedEnding != document.normalizationEnding {
			service.mu.RUnlock()
			return service.RequestNormalization(documentID, expectedContentRevision)
		}
	}
	service.mu.RUnlock()
	if path == "" {
		if closePlanID != "" {
			return bridge.Refused[apperr.WriteResult](apperr.ClassifiedConflict, documentID, "The close plan no longer has a save target.", apperr.RemediationRetry)
		}
		return service.SaveAs(ctx, documentID, expectedContentRevision, decisionToken)
	}
	if closePlanID == "" {
		service.flushAutosave(documentID)
	}
	if result := service.prepareWriteDisk(ctx, documentID, expectedContentRevision, decisionToken); result.Status != "" {
		return result
	}

	snapshot, result := service.snapshotForWrite(documentID, expectedContentRevision, decisionToken, path, false)
	if result.Status != "" {
		return result
	}
	snapshot.closePlanID = closePlanID
	return service.executeWrite(ctx, snapshot, SaveOriginExplicitSave)
}

// SaveAs chooses and validates a target before any target or model mutation occurs.
func (service *AppModelService) SaveAs(ctx context.Context, documentID string, expectedContentRevision uint64, decisionToken string) apperr.WriteResult {
	source, result := service.saveAsSource(documentID, expectedContentRevision, decisionToken)
	if result.Status != "" {
		return result
	}
	sourcePath, sourceIdentity, protectedSource := source.path, source.identity, source.protected
	dialog, defaultDirectory, defaultFilename := source.dialog, source.defaultDirectory, source.defaultFilename
	protectedSource, result = service.prepareSaveAsSource(ctx, documentID, expectedContentRevision, decisionToken, sourcePath, protectedSource)
	if result.Status != "" {
		return result
	}

	candidate, result := service.chooseSaveAsTarget(ctx, documentID, dialog, defaultDirectory, defaultFilename)
	if result.Status != "" {
		return result
	}

	if result := service.checkProtectedSaveAsTarget(documentID, sourcePath, sourceIdentity, protectedSource, candidate); result.Status != "" {
		return result
	}

	reservationID, conflict := service.reserveSaveTarget(documentID, candidate)
	if conflict != nil {
		return bridge.FromClassified[apperr.WriteResult](conflict, apperr.WriteStatusConflict)
	}
	defer service.releaseSaveTarget(reservationID)

	expectedVersion, expectedHash, result := service.inspectSaveAsTarget(ctx, documentID, candidate, dialog)
	if result.Status != "" {
		return result
	}

	if result := service.checkSaveAsSource(documentID, sourcePath, candidate, expectedVersion); result.Status != "" {
		return result
	}

	// A target that is the document's own file, under any alias, is compared
	// with the loaded document rather than with whatever is on disk after the
	// dialogs closed, so an external edit made while they were open is offered
	// as a comparison instead of being overwritten.
	documentFile := service.isDocumentFile(documentID, candidate)
	if documentFile {
		if result := service.prepareWriteDisk(ctx, documentID, expectedContentRevision, decisionToken); result.Status != "" {
			return result
		}
	}

	snapshot, result := service.snapshotForWrite(documentID, expectedContentRevision, decisionToken, candidate.Path, true)
	if result.Status != "" {
		return result
	}
	snapshot.identity = candidate.Identity
	snapshot.documentFile = documentFile
	if !documentFile {
		snapshot.expectedVersion = expectedVersion
		snapshot.expectedRawHash = expectedHash
		if result := service.checkSaveAsTargetUnchanged(documentID, candidate, expectedVersion, expectedHash); result.Status != "" {
			return result
		}
	}

	return service.executeWrite(ctx, snapshot, SaveOriginSaveAs)
}

// isDocumentFile reports whether a Save As target is the file the document
// was loaded from: its path, or another name for the same file.
func (service *AppModelService) isDocumentFile(documentID string, candidate file.CanonicalDocumentPath) bool {
	service.mu.RLock()
	defer service.mu.RUnlock()
	document := service.state.documents[documentID]
	if document == nil || document.metadata.Path == "" {
		return false
	}
	if candidate.Path == document.metadata.Path || candidate.Path == document.canonicalPath {
		return true
	}
	return !document.identity.IsZero() && document.identity.Equal(candidate.Identity)
}

type saveAsSource struct {
	path             string
	identity         file.Identity
	protected        bool
	dialog           DocumentSaveDialog
	defaultFilename  string
	defaultDirectory string
}

func (service *AppModelService) saveAsSource(documentID string, expectedContentRevision uint64, decisionToken string) (saveAsSource, apperr.WriteResult) {
	service.mu.RLock()
	if service.shutdownDraining {
		service.mu.RUnlock()
		return saveAsSource{}, bridge.Refused[apperr.WriteResult](apperr.ClassifiedConflict, "application", "The application is finishing an earlier close request.", apperr.RemediationRetry)
	}
	document, ok := service.state.documents[documentID]
	if !ok {
		service.mu.RUnlock()
		return saveAsSource{}, bridge.Refused[apperr.WriteResult](service.documentLabel(documentID), documentID, apperr.ClassifiedNotFound, saveDocumentNotFoundMessage, apperr.RemediationNone)
	}
	if document.metadata.ContentRevision != expectedContentRevision {
		service.mu.RUnlock()
		return saveAsSource{}, bridge.Refused[apperr.WriteResult](service.documentLabel(documentID), documentID, apperr.ClassifiedConflict, saveDocumentChangedMessage, apperr.RemediationRetry)
	}
	if document.metadata.Capability != string(file.CapabilityWritable) && document.metadata.Capability != string(file.CapabilityWriteProtectedReadOnly) {
		service.mu.RUnlock()
		return saveAsSource{}, bridge.Refused[apperr.WriteResult](service.documentLabel(documentID), documentID, apperr.ClassifiedPermissionDenied, saveDocumentReadOnlyMessage, apperr.RemediationNone)
	}
	if document.metadata.LineEnding == string(file.LineEndingMixed) {
		authorization, authorized := normalizationAuthorizationForLocked(document, decisionToken)
		if !authorized || authorization.documentID != documentID || authorization.contentRevision != expectedContentRevision || authorization.proposedEnding != document.normalizationEnding {
			service.mu.RUnlock()
			return saveAsSource{}, service.RequestNormalization(documentID, expectedContentRevision)
		}
	}
	sourcePath := document.metadata.Path
	sourceIdentity := document.identity
	protectedSource := document.metadata.Capability == string(file.CapabilityWriteProtectedReadOnly)
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
	return saveAsSource{path: sourcePath, identity: sourceIdentity, protected: protectedSource, dialog: dialog, defaultFilename: defaultFilename, defaultDirectory: defaultDirectory}, apperr.WriteResult{}
}

func (service *AppModelService) prepareSaveAsSource(ctx context.Context, documentID string, revision uint64, token, sourcePath string, protectedSource bool) (bool, apperr.WriteResult) {
	if sourcePath != "" && !protectedSource {
		if read, err := service.readStable(sourcePath); err == nil && read.Version.Exists && read.Read.Capability == file.CapabilityWriteProtectedReadOnly {
			protectedSource = true
		}
	}
	if sourcePath != "" && !protectedSource {
		if result := service.prepareWriteDisk(ctx, documentID, revision, token); result.Status != "" {
			return protectedSource, result
		}
	}
	return protectedSource, apperr.WriteResult{}
}

func (service *AppModelService) checkProtectedSaveAsTarget(documentID, sourcePath string, sourceIdentity file.Identity, protectedSource bool, candidate file.CanonicalDocumentPath) apperr.WriteResult {
	if protectedSource {
		if currentSource, err := file.CanonicalizeDocumentPath(sourcePath); err == nil {
			sourceIdentity = currentSource.Identity
		}
	}
	if protectedSource && sourceIdentity.Equal(candidate.Identity) {
		return bridge.Refused[apperr.WriteResult](service.documentLabel(documentID), documentID, apperr.ClassifiedPermissionDenied, "The write-protected source cannot be overwritten.", apperr.RemediationNone)
	}

	return apperr.WriteResult{}
}

func (service *AppModelService) checkSaveAsTargetUnchanged(documentID string, candidate file.CanonicalDocumentPath, expectedVersion file.DiskVersion, expectedHash string) apperr.WriteResult {
	currentVersion, versionErr := service.currentDiskVersion(candidate.Path)
	if versionErr != nil || !currentVersion.Equal(expectedVersion) {
		return bridge.Conflict[apperr.WriteResult](service.documentLabel(documentID), documentID, apperr.ClassifiedConflict, "The Save As target changed after confirmation.", apperr.RemediationNone)
	}
	if expectedHash != "" {
		currentHash, hashErr := rawBytesHash(candidate.Path)
		if hashErr != nil || currentHash != expectedHash {
			return bridge.Conflict[apperr.WriteResult](service.documentLabel(documentID), documentID, apperr.ClassifiedConflict, "The Save As target bytes changed after confirmation.", apperr.RemediationNone)
		}
	}
	return apperr.WriteResult{}
}

func (service *AppModelService) inspectSaveAsTarget(ctx context.Context, documentID string, candidate file.CanonicalDocumentPath, dialog DocumentSaveDialog) (file.DiskVersion, string, apperr.WriteResult) {
	expectedVersion, versionErr := service.currentDiskVersion(candidate.Path)
	if versionErr != nil {
		return file.DiskVersion{}, "", bridge.Refused[apperr.WriteResult](service.documentLabel(documentID), documentID, apperr.ClassifiedIOFailure, "The Save As target could not be inspected.", apperr.RemediationRetry)
	}
	expectedHash := ""
	if expectedVersion.Exists {
		confirmed, confirmErr := dialog.ConfirmOverwrite(ctx, candidate.DisplayName)
		if confirmErr != nil {
			return file.DiskVersion{}, "", bridge.Refused[apperr.WriteResult](service.documentLabel(documentID), documentID, apperr.ClassifiedSystemCommandFailure, "The overwrite confirmation could not be shown.", apperr.RemediationRetry)
		}
		if !confirmed {
			return file.DiskVersion{}, "", apperr.WriteResult{Status: apperr.WriteStatusCancelled}
		}
		expectedVersion, versionErr = service.currentDiskVersion(candidate.Path)
		if versionErr != nil {
			return file.DiskVersion{}, "", bridge.Refused[apperr.WriteResult](service.documentLabel(documentID), documentID, apperr.ClassifiedIOFailure, "The Save As target could not be inspected after confirmation.", apperr.RemediationRetry)
		}
		var err error
		expectedHash, err = service.stableRawBytesHash(candidate.Path, expectedVersion)
		if err != nil {
			if errors.Is(err, errTargetDiskChanged) {
				return file.DiskVersion{}, "", bridge.Conflict[apperr.WriteResult](service.documentLabel(documentID), documentID, apperr.ClassifiedConflict, "The Save As target changed after confirmation.", apperr.RemediationNone)
			}
			return file.DiskVersion{}, "", bridge.Refused[apperr.WriteResult](service.documentLabel(documentID), documentID, apperr.ClassifiedIOFailure, "The Save As target could not be read.", apperr.RemediationRetry)
		}
	}

	return expectedVersion, expectedHash, apperr.WriteResult{}
}

func (service *AppModelService) checkSaveAsSource(documentID, sourcePath string, candidate file.CanonicalDocumentPath, expectedVersion file.DiskVersion) apperr.WriteResult {
	// The source may become protected while either native dialog is open.
	// Compare the current source identity with the inspected target and use the
	// target version's mode: that same version is checked again by the atomic
	// replacement, so a subsequent permission change invalidates the write.
	if sourcePath != "" && expectedVersion.Exists && expectedVersion.Mode.Perm()&0o200 == 0 {
		currentSource, sourceErr := file.CanonicalizeDocumentPath(sourcePath)
		if sourceErr != nil {
			return bridge.Refused[apperr.WriteResult](service.documentLabel(documentID), documentID, apperr.ClassifiedIOFailure, "The Save As source could not be inspected.", apperr.RemediationRetry)
		}
		currentTarget, targetErr := file.CanonicalizeDocumentPath(candidate.Path)
		if targetErr != nil {
			return bridge.Refused[apperr.WriteResult](service.documentLabel(documentID), documentID, apperr.ClassifiedIOFailure, "The Save As target could not be inspected.", apperr.RemediationRetry)
		}
		if currentSource.Identity.Equal(currentTarget.Identity) {
			return bridge.Refused[apperr.WriteResult](service.documentLabel(documentID), documentID, apperr.ClassifiedPermissionDenied, "The write-protected source cannot be overwritten.", apperr.RemediationNone)
		}
	}

	return apperr.WriteResult{}
}

func (service *AppModelService) chooseSaveAsTarget(ctx context.Context, documentID string, dialog DocumentSaveDialog, defaultDirectory, defaultFilename string) (file.CanonicalDocumentPath, apperr.WriteResult) {
	if dialog == nil {
		return file.CanonicalDocumentPath{}, bridge.Refused[apperr.WriteResult](service.documentLabel(documentID), documentID, apperr.ClassifiedSystemCommandFailure, "The Save dialog is unavailable.", apperr.RemediationRetry)
	}
	selected, err := dialog.ChooseSaveFile(ctx, SaveDialogRequest{DefaultDirectory: defaultDirectory, DefaultFilename: defaultFilename, Title: "Save Markdown document"})
	if err != nil {
		return file.CanonicalDocumentPath{}, bridge.Refused[apperr.WriteResult](service.documentLabel(documentID), documentID, apperr.ClassifiedSystemCommandFailure, "The Save dialog could not be opened.", apperr.RemediationRetry)
	}
	if strings.TrimSpace(selected) == "" {
		return file.CanonicalDocumentPath{}, apperr.WriteResult{Status: apperr.WriteStatusCancelled}
	}
	if filepath.Ext(selected) == "" {
		selected += ".md"
	}
	if !file.IsSupportedDocumentSuffix(selected) {
		return file.CanonicalDocumentPath{}, bridge.Refused[apperr.WriteResult](service.documentLabel(documentID), documentID, apperr.ClassifiedUnsupportedInput, "The selected save name has an unsupported suffix.", apperr.RemediationNone)
	}
	candidate, err := file.CanonicalizeCandidateDocumentPath(selected)
	if err != nil {
		return file.CanonicalDocumentPath{}, bridge.Refused[apperr.WriteResult](service.documentLabel(documentID), documentID, apperr.ClassifiedIOFailure, "The Save As target could not be resolved.", apperr.RemediationRetry)
	}

	return candidate, apperr.WriteResult{}
}

// RequestNormalization creates a single-use revision-bound mixed-ending authorization.
func (service *AppModelService) RequestNormalization(documentID string, expectedContentRevision uint64) apperr.WriteResult {
	service.mu.Lock()
	defer service.mu.Unlock()
	document, ok := service.state.documents[documentID]
	if !ok {
		return bridge.Refused[apperr.WriteResult](service.safeDocumentLabelLocked(documentID), documentID, apperr.ClassifiedNotFound, saveDocumentNotFoundMessage, apperr.RemediationNone)
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
// The confirmation is single-use and cancellation resumes nothing. Confirming
// consumes the authorization; dismissing releases it so a later Save cannot
// reuse the token.
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
		return writeSnapshot{}, bridge.Refused[apperr.WriteResult](service.safeDocumentLabelLocked(documentID), documentID, apperr.ClassifiedNotFound, saveDocumentNotFoundMessage, apperr.RemediationNone)
	}
	if document.metadata.ContentRevision != expectedContentRevision {
		return writeSnapshot{}, bridge.Refused[apperr.WriteResult](service.safeDocumentLabelLocked(documentID), documentID, apperr.ClassifiedConflict, saveDocumentChangedMessage, apperr.RemediationRetry)
	}
	if document.metadata.Capability != string(file.CapabilityWritable) && (!targetPathAdopted || document.metadata.Capability != string(file.CapabilityWriteProtectedReadOnly)) {
		return writeSnapshot{}, bridge.Refused[apperr.WriteResult](service.safeDocumentLabelLocked(documentID), documentID, apperr.ClassifiedPermissionDenied, saveDocumentReadOnlyMessage, apperr.RemediationNone)
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
	expectedVersion, expectedRawHash, expectedCharacteristics := document.baselineVersion, document.baselineRawHash, document.baselineCharacteristics
	if authorization := keepMineAuthorizationForLocked(document, documentID, decisionToken, expectedContentRevision, document.metadata.Path); authorization != nil {
		expectedVersion, expectedRawHash, expectedCharacteristics = authorization.version, authorization.rawHash, authorization.characteristics
	}
	return writeSnapshot{
		documentID: documentID, contentRevision: expectedContentRevision, content: document.content,
		path: targetPath, identity: document.identity, metadata: document.metadata,
		expectedVersion: expectedVersion, expectedRawHash: expectedRawHash, expectedCharacteristics: expectedCharacteristics, targetPathAdopted: targetPathAdopted,
		documentFile: !targetPathAdopted,
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

// retryAfterPreCommitConflict handles a file that changed between the save's
// disk check and the replacement. A writable file whose bytes and
// characteristics, permissions included, match the ones the write expected to
// replace (a timestamp-only touch) is written once more against the refreshed
// disk version. The expected bytes are the loaded baseline or, for a Keep mine
// write, the authorized external version. Any other file gets the ordinary
// inspection: an unchanged file is written against the inspected version, a
// deleted one is created once more only if no file exists at commit time, and
// every other outcome is returned as the result.
func (service *AppModelService) retryAfterPreCommitConflict(ctx context.Context, coordinator *DocumentWriteCoordinator, snapshot writeSnapshot, encoded encodedWrite, replaceErr error) (CommittedWriteResult, *apperr.WriteResult, error) {
	if stable, err := service.readStable(snapshot.path); err == nil && stable.Version.Exists && stable.Read.Error == nil && stable.Read.Capability == file.CapabilityWritable &&
		stable.RawHash == snapshot.expectedRawHash && characteristicsEqual(stable.Read.Characteristics, snapshot.expectedCharacteristics) {
		snapshot.expectedVersion = stable.Version
		committed, err := coordinator.Commit(snapshot.request(encoded))
		return committed, nil, err
	}
	inspection := service.inspectDocumentClaimed(ctx, snapshot.documentID, snapshot.contentRevision, "")
	if inspection.classified != nil || (inspection.kind != diskUnchanged && inspection.kind != diskDetached) {
		result := service.writeResultForInspection(snapshot.documentID, inspection)
		if result.Status == "" {
			result = writeCommitFailure(snapshot, replaceErr)
		}
		return CommittedWriteResult{}, &result, replaceErr
	}
	snapshot.expectedVersion = inspection.version
	snapshot.expectedRawHash = inspection.rawHash
	committed, err := coordinator.Commit(snapshot.request(encoded))
	return committed, nil, err
}

func (service *AppModelService) executeWrite(ctx context.Context, snapshot writeSnapshot, origin SaveOrigin) apperr.WriteResult {
	ctx = service.runtimeContextOr(ctx)
	encoded, err := encodeWrite(snapshot, origin, service.normalizationEndingFor(snapshot.documentID))
	if err != nil {
		return writeEncodingFailure(snapshot, err)
	}
	if !service.setWriteInFlightForPlan(ctx, snapshot.documentID, true, snapshot.closePlanID, origin) {
		return service.writeAdmissionFailure(snapshot)
	}
	defer service.setWriteInFlight(ctx, snapshot.documentID, false)
	coordinator := service.writeCoordinator(snapshot.documentID)
	if coordinator == nil {
		return bridge.Refused[apperr.WriteResult]("document", snapshot.documentID, apperr.ClassifiedNotFound, "The document was closed before the save started.", apperr.RemediationNone)
	}
	release := coordinator.claimDisk()
	defer release()
	committed, replaceErr := coordinator.Commit(snapshot.request(encoded))
	if committed.Snapshot.DocumentID == "" && snapshot.documentFile && isPreCommitConflict(replaceErr) {
		var refused *apperr.WriteResult
		committed, refused, replaceErr = service.retryAfterPreCommitConflict(ctx, coordinator, snapshot, encoded, replaceErr)
		if refused != nil {
			return *refused
		}
	}
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
		return writeCommitFailure(snapshot, replaceErr)
	}

	service.mu.Lock()
	document, ok := service.state.documents[snapshot.documentID]
	if !ok {
		service.mu.Unlock()
		return bridge.Refused[apperr.WriteResult](documentLabelFromMetadata(snapshot.metadata), snapshot.documentID, apperr.ClassifiedNotFound, "The document was closed before the save completed.", apperr.RemediationNone)
	}
	before := service.snapshotLocked()
	recentRepository, shouldPromoteRecent := service.applySavedDocumentLocked(snapshot, encoded, committed, origin, document)
	patch := service.documentPatchLocked(snapshot.documentID)
	projectionRevision := service.state.revision
	resyncRequired := false
	if err := service.publishCommittedLocked(ctx, before, patch); err != nil {
		resyncRequired = true
	}
	var metadataWarning *apperr.ClassifiedError
	if shouldPromoteRecent && service.metadata != nil && document.canonicalPath != "" {
		view := document.metadata.View
		if err := service.metadata.WriteView(ctx, document.canonicalPath, FileViewMetadata{Arrangement: view.Arrangement, SplitRatio: view.SplitRatio}); err != nil {
			metadataWarning = bridge.ClassifiedWithID(apperr.ClassifiedPersistenceWarning, document.canonicalPath, "The document was saved, but its view settings could not be stored.", apperr.RemediationNone, snapshot.documentID)
		}
	}
	service.mu.Unlock()

	outcome := &apperr.CommittedWriteOutcome{
		DocumentID:                  snapshot.documentID,
		WrittenContentRevision:      snapshot.contentRevision,
		CommittedProjectionRevision: projectionRevision,
		TargetPath:                  snapshot.path,
		TargetPathAdopted:           snapshot.targetPathAdopted,
		LineEndingOutcome:           encoded.lineEndingOutcome,
		BOMOutcome:                  encoded.bomOutcome,
		ResyncRequired:              resyncRequired || replaceErr != nil,
	}
	return service.committedWriteResult(ctx, outcome, replaceErr, recentRepository, metadataWarning)
}

func (service *AppModelService) committedWriteResult(ctx context.Context, outcome *apperr.CommittedWriteOutcome, replaceErr error, recentRepository RecentItemsRepository, metadataWarning *apperr.ClassifiedError) apperr.WriteResult {
	var promotionWarning *apperr.ClassifiedError
	if recentRepository != nil {
		entries, promoteErr := recentRepository.Promote(ctx, outcome.TargetPath, "file")
		if promoteErr != nil {
			promotionWarning = bridge.ClassifiedWithID(apperr.ClassifiedPersistenceWarning, outcome.TargetPath, "The document was saved successfully, but recent history could not be updated.", apperr.RemediationNone, "recent-items")
		} else {
			_ = service.publishRecentItems(ctx, entries)
		}
	}
	result := apperr.WriteResult{Status: apperr.WriteStatusCommitted, Data: outcome, Error: metadataWarning}
	if metadataWarning != nil {
		result.Warning = apperr.WriteWarningViewState
	}
	if promotionWarning != nil {
		result.Error = promotionWarning
		result.Warning = apperr.WriteWarningRecentItems
	}
	if replaceErr != nil {
		result.Warning = apperr.WriteWarningDurability
		var atomicErr *file.AtomicReplaceError
		if errors.As(replaceErr, &atomicErr) && atomicErr.Committed {
			switch atomicErr.Reason {
			case apperr.WriteWarningReasonMetadataStat, apperr.WriteWarningReasonReadback, apperr.WriteWarningReasonContentMismatch, apperr.WriteWarningReasonDirectorySync:
				result.WarningReason = atomicErr.Reason
			}
		}
		result.Error = bridge.ClassifiedWithID(apperr.ClassifiedPersistenceWarning, outcome.TargetPath, "The document was saved, but the save could not be confirmed on disk.", apperr.RemediationNone, outcome.DocumentID)
	}
	result.Failure = bridge.FailureFromClassified(result.Error)
	return result
}

func (snapshot writeSnapshot) request(encoded encodedWrite) WriteSnapshot {
	expectedVersion := snapshot.expectedVersion
	return WriteSnapshot{
		DocumentID: snapshot.documentID, ContentRevision: snapshot.contentRevision,
		CanonicalContent: snapshot.content, TargetPath: snapshot.path,
		ExpectedDiskVersion: &expectedVersion, ExpectedRawHash: snapshot.expectedRawHash, EncodedData: encoded.data,
	}
}

func isPreCommitConflict(err error) bool {
	var atomicErr *file.AtomicReplaceError
	return errors.As(err, &atomicErr) && !atomicErr.Committed && atomicErr.Classified != nil && atomicErr.Classified.Category == apperr.ClassifiedConflict
}

func writeEncodingFailure(snapshot writeSnapshot, err error) apperr.WriteResult {
	if errors.Is(err, file.ErrCodecInvalidUTF8) || errors.Is(err, file.ErrCodecNULByte) || errors.Is(err, file.ErrCodecLoneCR) || errors.Is(err, file.ErrCodecMixedLineEndings) || errors.Is(err, file.ErrCodecUnsupportedEncoding) {
		return bridge.Refused[apperr.WriteResult](documentLabelFromMetadata(snapshot.metadata), snapshot.documentID, apperr.ClassifiedUnsupportedInput, "The document could not be encoded for saving: "+err.Error()+".", apperr.RemediationNone)
	}
	return bridge.Refused[apperr.WriteResult](documentLabelFromMetadata(snapshot.metadata), snapshot.documentID, apperr.ClassifiedIOFailure, "The document could not be encoded for saving.", apperr.RemediationRetry)
}

func (service *AppModelService) writeAdmissionFailure(snapshot writeSnapshot) apperr.WriteResult {
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

func writeCommitFailure(snapshot writeSnapshot, replaceErr error) apperr.WriteResult {
	category := apperr.ClassifiedIOFailure
	message := "The document could not be saved."
	remediation := apperr.RemediationRetry
	if atomicErr, ok := replaceErr.(*file.AtomicReplaceError); ok && atomicErr.Classified != nil {
		category = atomicErr.Classified.Category
		message = atomicErr.Classified.Message
		// The atomic replacement's classification decides the remediation, so a
		// permission refusal offers no Retry. It carries one action by
		// construction (newAtomicReplaceError names a single row), so the first
		// is the whole set.
		remediation = atomicErr.Classified.Remediation()
	}
	if category == apperr.ClassifiedConflict {
		return bridge.Conflict[apperr.WriteResult](documentLabelFromMetadata(snapshot.metadata), snapshot.documentID, apperr.ClassifiedConflict, message, apperr.RemediationNone)
	}
	return bridge.Refused[apperr.WriteResult](documentLabelFromMetadata(snapshot.metadata), snapshot.documentID, category, message, remediation)
}

func (service *AppModelService) applySavedDocumentLocked(snapshot writeSnapshot, encoded encodedWrite, committed CommittedWriteResult, origin SaveOrigin, document *DocumentRecord) (RecentItemsRepository, bool) {
	// AtomicReplace commits every write via rename-over-target, which gives the
	// target path a new on-disk identity each time and frees the old one for
	// filesystem reuse. document.identity must track that on every save, not
	// only when the path itself changes, or a later Open of an unrelated file
	// that happens to receive the freed inode falsely matches this document.
	candidate, candidateErr := file.CanonicalizeCandidateDocumentPath(snapshot.path)
	if candidateErr == nil {
		document.identity = candidate.Identity
		document.canonicalPath = candidate.Path
	}
	if snapshot.targetPathAdopted {
		if candidateErr == nil {
			document.metadata.Path = candidate.Path
			document.metadata.Title = candidate.DisplayName
			document.metadata.DisplayName = candidate.DisplayName
			document.metadata.ParentName = candidate.ParentName
		}
		document.metadata.Capability = string(file.CapabilityWritable)
		document.metadata.SizeClass = "small"
		document.metadata.Encoding = string(file.EncodingUTF8)
		document.metadata.BOM = string(file.BOMAbsent)
		if encoded.bomOutcome == apperr.BOMOutcomePreserved {
			document.metadata.BOM = string(file.BOMPresent)
		}
		document.metadata.LineEnding = string(file.LineEndingLF)
	}
	document.metadata.LineEnding = writtenLineEnding(snapshot, service.normalizationEndingForLocked(snapshot.documentID))
	document.normalizationEnding = ""
	document.detached = false
	applyCommittedBaseline(document, committed.Snapshot, committed.DiskVersion, origin)
	document.baselineRawHash = hashBytes(encoded.data)
	document.baselineCharacteristics = file.ClassifyDocumentBytes(encoded.data, committed.DiskVersion.Mode).Characteristics
	service.removeConflictLocked(snapshot.documentID)
	if document.metadata.LineEnding == string(file.LineEndingLF) && encoded.lineEndingOutcome == apperr.LineEndingPreservedCRLF {
		document.metadata.LineEnding = string(file.LineEndingCRLF)
	}
	recentRepository := service.recentItems
	shouldPromoteRecent := origin == SaveOriginExplicitSave || origin == SaveOriginSaveAs
	if !shouldPromoteRecent {
		recentRepository = nil
	} else if recentRepository == nil {
		service.state.recentItems = promoteRecentItem(service.state.recentItems, snapshot.path, "file")
		service.updateCanReopenLastFileLocked()
	}
	return recentRepository, shouldPromoteRecent
}

// emitCommittedSaveWarning surfaces warnings when the caller cannot return the write result.
func (service *AppModelService) emitCommittedSaveWarning(ctx context.Context, result apperr.WriteResult) {
	if result.Status != apperr.WriteStatusCommitted || result.Error == nil || result.Warning == "" {
		return
	}
	wire := apperr.ClassifiedToWire(result.Error)
	wire.Details["saveWarning"] = string(result.Warning)
	if result.WarningReason != "" {
		wire.Details["saveWarningReason"] = string(result.WarningReason)
	}
	service.emitAsyncError(ctx, wire, "committed save warning could not be surfaced")
}

func (service *AppModelService) setWriteInFlight(ctx context.Context, documentID string, inFlight bool) bool {
	return service.setWriteInFlightForPlan(ctx, documentID, inFlight, "", SaveOriginExplicitSave)
}

func (service *AppModelService) setWriteInFlightForPlan(ctx context.Context, documentID string, inFlight bool, closePlanID string, origin SaveOrigin) bool {
	ctx = service.runtimeContextOr(ctx)
	service.mu.Lock()
	if inFlight && closePlanID != "" {
		plan := service.closePlans[closePlanID]
		if plan == nil || service.activeClosePlan != closePlanID || plan.summary.Status != apperr.ClosePlanExecuting || service.validateClosePlanLocked(plan) != nil {
			service.mu.Unlock()
			return false
		}
	}
	document, ok := service.state.documents[documentID]
	if !ok || (inFlight && (document.closing || service.shutdownDiscarding || (service.shutdownDraining && origin != SaveOriginAutosave))) {
		service.mu.Unlock()
		return false
	}
	if !inFlight && document.admittedWrites == 0 {
		service.mu.Unlock()
		return false
	}
	before := service.snapshotLocked()
	wasWriting := document.writeInFlight
	if inFlight {
		document.admittedWrites++
		document.writeInFlight = true
	} else {
		releaseWriteAdmissionLocked(document)
	}
	// This is lifecycle bookkeeping around an accepted write, not a reversible
	// user command. Keep the state transition even when the projection cannot
	// be delivered so a failed emitter cannot leave the document permanently
	// marked as writing.
	if wasWriting != document.writeInFlight {
		_ = service.publishCommittedLocked(ctx, before, service.documentPatchLocked(documentID))
	}
	service.mu.Unlock()
	return true
}

// releaseWriteAdmissionLocked releases one accepted write while service.mu is held.
func releaseWriteAdmissionLocked(document *DocumentRecord) {
	if document.admittedWrites > 0 {
		document.admittedWrites--
	}
	document.writeInFlight = document.admittedWrites > 0
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
				TargetPath: snapshot.TargetPath, Data: snapshot.EncodedData,
				ExpectedVersion: snapshot.ExpectedDiskVersion, ExpectedRawHash: snapshot.ExpectedRawHash,
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
	lineOutcome := writeLineEndingOutcome(snapshot, origin, ending)
	bomOutcome := apperr.BOMOutcomeAbsent
	if bom == file.BOMPresent {
		bomOutcome = apperr.BOMOutcomePreserved
	}
	return encodedWrite{data: data, lineEndingOutcome: lineOutcome, bomOutcome: bomOutcome}, nil
}

func writeLineEndingOutcome(snapshot writeSnapshot, origin SaveOrigin, ending string) apperr.LineEndingOutcome {
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
	return lineOutcome
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

var errTargetDiskChanged = errors.New("target disk version changed while reading")

func stableRawBytesHash(path string, expected file.DiskVersion) (string, error) {
	return stableRawBytesHashWithReader(path, expected, file.CurrentDiskVersion)
}

func (service *AppModelService) stableRawBytesHash(path string, expected file.DiskVersion) (string, error) {
	return stableRawBytesHashWithReader(path, expected, service.currentDiskVersion)
}

func stableRawBytesHashWithReader(path string, expected file.DiskVersion, readVersion func(string) (file.DiskVersion, error)) (string, error) {
	before, err := readVersion(path)
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
	after, err := readVersion(path)
	if err != nil {
		return "", err
	}
	if !after.Equal(before) {
		return "", errTargetDiskChanged
	}
	return hash, nil
}

/*
 * The label a classified error may show the user for a document.
 *
 * The order is the disambiguated tab label where one exists, otherwise the
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
