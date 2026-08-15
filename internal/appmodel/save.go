package appmodel

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strings"

	"github.com/sanyokkua/go_mark_edit/internal/apperr"
	"github.com/sanyokkua/go_mark_edit/internal/file"
)

type saveReservation struct {
	id       string
	identity string
	path     string
}

type normalizationAuthorization struct {
	documentID      string
	contentRevision uint64
	proposedEnding  string
}

type writeSnapshot struct {
	documentID        string
	contentRevision   uint64
	content           string
	path              string
	identity          string
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
	document, ok := service.state.documents[documentID]
	if !ok {
		service.mu.RUnlock()
		return service.refusedWrite(documentID, apperr.ClassifiedNotFound, "The document could not be found.", apperr.RemediationCancel)
	}
	if document.metadata.ContentRevision != expectedContentRevision {
		service.mu.RUnlock()
		return service.refusedWrite(documentID, apperr.ClassifiedConflict, "The document changed before it could be saved.", apperr.RemediationRetry)
	}
	if document.metadata.Capability != string(file.CapabilityWritable) {
		service.mu.RUnlock()
		return service.refusedWrite(documentID, apperr.ClassifiedPermissionDenied, "The document is read-only and cannot be saved.", apperr.RemediationCancel)
	}
	path := document.metadata.Path
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
	document, ok := service.state.documents[documentID]
	if !ok {
		service.mu.RUnlock()
		return service.refusedWrite(documentID, apperr.ClassifiedNotFound, "The document could not be found.", apperr.RemediationCancel)
	}
	if document.metadata.ContentRevision != expectedContentRevision {
		service.mu.RUnlock()
		return service.refusedWrite(documentID, apperr.ClassifiedConflict, "The document changed before it could be saved.", apperr.RemediationRetry)
	}
	if document.metadata.Capability != string(file.CapabilityWritable) {
		service.mu.RUnlock()
		return service.refusedWrite(documentID, apperr.ClassifiedPermissionDenied, "The document is read-only and cannot be saved.", apperr.RemediationCancel)
	}
	if document.metadata.LineEnding == string(file.LineEndingMixed) {
		authorization, authorized := service.normalizations[decisionToken]
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
		return service.refusedWrite(documentID, apperr.ClassifiedSystemCommandFailure, "The Save dialog is unavailable.", apperr.RemediationCancel)
	}
	selected, err := dialog.ChooseSaveFile(ctx, SaveDialogRequest{DefaultDirectory: defaultDirectory, DefaultFilename: defaultFilename, Title: "Save Markdown document"})
	if err != nil {
		return service.refusedWrite(documentID, apperr.ClassifiedSystemCommandFailure, "The Save dialog could not be opened.", apperr.RemediationRetry)
	}
	if strings.TrimSpace(selected) == "" {
		return apperr.WriteResult{Status: apperr.WriteStatusCancelled}
	}
	if filepath.Ext(selected) == "" {
		selected += ".md"
	}
	if !file.IsSupportedDocumentSuffix(selected) {
		return service.refusedWrite(documentID, apperr.ClassifiedUnsupportedInput, "The selected save name has an unsupported suffix.", apperr.RemediationCancel)
	}
	candidate, err := file.CanonicalizeCandidateDocumentPath(selected)
	if err != nil {
		return service.refusedWrite(documentID, apperr.ClassifiedIOFailure, "The Save As target could not be resolved.", apperr.RemediationRetry)
	}

	reservationID, conflict := service.reserveSaveTarget(documentID, candidate)
	if conflict != nil {
		return apperr.WriteResult{Status: apperr.WriteStatusConflict, Error: conflict}
	}
	defer service.releaseSaveTarget(reservationID)

	expectedVersion, versionErr := file.CurrentDiskVersion(candidate.Path)
	if versionErr != nil {
		return service.refusedWrite(documentID, apperr.ClassifiedIOFailure, "The Save As target could not be inspected.", apperr.RemediationRetry)
	}
	expectedHash := ""
	if expectedVersion.Exists {
		confirmed, confirmErr := dialog.ConfirmOverwrite(ctx, candidate.DisplayName)
		if confirmErr != nil {
			return service.refusedWrite(documentID, apperr.ClassifiedSystemCommandFailure, "The overwrite confirmation could not be shown.", apperr.RemediationRetry)
		}
		if !confirmed {
			return apperr.WriteResult{Status: apperr.WriteStatusCancelled}
		}
		expectedVersion, versionErr = file.CurrentDiskVersion(candidate.Path)
		if versionErr != nil {
			return service.refusedWrite(documentID, apperr.ClassifiedIOFailure, "The Save As target could not be inspected after confirmation.", apperr.RemediationRetry)
		}
		expectedHash, err = stableRawBytesHash(candidate.Path, expectedVersion)
		if err != nil {
			if errors.Is(err, errTargetDiskChanged) {
				return service.conflictWrite(documentID, "The Save As target changed after confirmation.")
			}
			return service.refusedWrite(documentID, apperr.ClassifiedIOFailure, "The Save As target could not be read.", apperr.RemediationRetry)
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
			return service.refusedWrite(documentID, apperr.ClassifiedIOFailure, "The Save As target could not be prepared.", apperr.RemediationRetry)
		}
	}
	currentVersion, versionErr := file.CurrentDiskVersion(candidate.Path)
	if versionErr != nil || !currentVersion.Equal(expectedVersion) {
		return service.conflictWrite(documentID, "The Save As target changed after confirmation.")
	}
	if expectedHash != "" {
		currentHash, hashErr := rawBytesHash(candidate.Path)
		if hashErr != nil || currentHash != expectedHash {
			return service.conflictWrite(documentID, "The Save As target bytes changed after confirmation.")
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
		return service.refusedWrite(documentID, apperr.ClassifiedNotFound, "The document could not be found.", apperr.RemediationCancel)
	}
	if document.metadata.ContentRevision != expectedContentRevision || document.metadata.LineEnding != string(file.LineEndingMixed) {
		return service.refusedWrite(documentID, apperr.ClassifiedConflict, "The normalization request is no longer valid.", apperr.RemediationRetry)
	}
	proposed := document.normalizationEnding
	if proposed == "" {
		proposed = string(file.LineEndingLF)
	}
	token := mintDocumentID()
	service.normalizations[token] = &normalizationAuthorization{documentID: documentID, contentRevision: expectedContentRevision, proposedEnding: proposed}
	return apperr.WriteResult{Status: apperr.WriteStatusNeedsNormalization, DecisionToken: token, ProposedEnding: proposed, DocumentRevision: expectedContentRevision}
}

func (service *AppModelService) CancelNormalization(documentID, token string) {
	service.mu.Lock()
	defer service.mu.Unlock()
	authorization, ok := service.normalizations[token]
	if ok && authorization.documentID == documentID {
		delete(service.normalizations, token)
	}
}

func (service *AppModelService) snapshotForWrite(documentID string, expectedContentRevision uint64, decisionToken, targetPath string, targetPathAdopted bool) (writeSnapshot, apperr.WriteResult) {
	service.mu.Lock()
	defer service.mu.Unlock()
	document, ok := service.state.documents[documentID]
	if !ok {
		return writeSnapshot{}, service.refusedWrite(documentID, apperr.ClassifiedNotFound, "The document could not be found.", apperr.RemediationCancel)
	}
	if document.metadata.ContentRevision != expectedContentRevision {
		return writeSnapshot{}, service.refusedWrite(documentID, apperr.ClassifiedConflict, "The document changed before it could be saved.", apperr.RemediationRetry)
	}
	if document.metadata.Capability != string(file.CapabilityWritable) {
		return writeSnapshot{}, service.refusedWrite(documentID, apperr.ClassifiedPermissionDenied, "The document is read-only and cannot be saved.", apperr.RemediationCancel)
	}
	if !targetPathAdopted && document.metadata.Path != targetPath {
		return writeSnapshot{}, service.refusedWrite(documentID, apperr.ClassifiedConflict, "The document path changed before it could be saved.", apperr.RemediationRetry)
	}
	if document.metadata.LineEnding == string(file.LineEndingMixed) {
		authorization, ok := service.normalizations[decisionToken]
		if !ok || authorization.documentID != documentID || authorization.contentRevision != expectedContentRevision || authorization.proposedEnding != document.normalizationEnding {
			requested := service.requestNormalizationLocked(documentID, expectedContentRevision)
			return writeSnapshot{}, requested
		}
		delete(service.normalizations, decisionToken)
	}
	return writeSnapshot{
		documentID: documentID, contentRevision: expectedContentRevision, content: document.content,
		path: targetPath, identity: document.canonicalIdentity, metadata: document.metadata,
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
	service.normalizations[token] = &normalizationAuthorization{documentID: documentID, contentRevision: expectedContentRevision, proposedEnding: proposed}
	return apperr.WriteResult{Status: apperr.WriteStatusNeedsNormalization, DecisionToken: token, ProposedEnding: proposed, DocumentRevision: expectedContentRevision}
}

func (service *AppModelService) executeWrite(ctx context.Context, snapshot writeSnapshot, origin SaveOrigin) apperr.WriteResult {
	ctx = service.runtimeContextOr(ctx)
	encoded, err := encodeWrite(snapshot, origin, service.normalizationEndingFor(snapshot.documentID))
	if err != nil {
		return service.refusedWrite(snapshot.documentID, apperr.ClassifiedIOFailure, "The document could not be encoded for saving.", apperr.RemediationRetry)
	}
	service.setWriteInFlight(ctx, snapshot.documentID, true)
	coordinator := service.writeCoordinator(snapshot.documentID)
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
		if atomicErr, ok := replaceErr.(*file.AtomicReplaceError); ok && atomicErr.Classified != nil {
			category = atomicErr.Classified.Category
			message = atomicErr.Classified.Message
		}
		if category == apperr.ClassifiedConflict {
			return service.conflictWrite(snapshot.documentID, message)
		}
		return service.refusedWrite(snapshot.documentID, category, message, apperr.RemediationRetry)
	}

	service.mu.Lock()
	document, ok := service.state.documents[snapshot.documentID]
	if !ok {
		service.mu.Unlock()
		return service.refusedWrite(snapshot.documentID, apperr.ClassifiedNotFound, "The document was closed before the save completed.", apperr.RemediationCancel)
	}
	document.writeInFlight = false
	if snapshot.targetPathAdopted {
		candidate, candidateErr := file.CanonicalizeCandidateDocumentPath(snapshot.path)
		if candidateErr == nil {
			document.metadata.Path = candidate.Path
			document.metadata.DisplayName = candidate.DisplayName
			document.metadata.ParentName = candidate.ParentName
			document.canonicalIdentity = candidate.Identity
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
	if service.emitter == nil {
		resyncRequired = true
	} else {
		func() {
			defer func() {
				if recover() != nil {
					resyncRequired = true
				}
			}()
			if service.emitter.EmitStatePatch(ctx, patch) != nil {
				resyncRequired = true
			}
		}()
	}
	service.mu.Unlock()

	var promotionWarning *apperr.ClassifiedError
	if recentRepository != nil {
		entries, promoteErr := recentRepository.Promote(ctx, snapshot.path)
		if promoteErr != nil {
			warning := apperr.NewClassifiedError(apperr.ClassifiedPersistenceWarning, snapshot.path, "The document was saved successfully, but recent-file history could not be updated.", apperr.RemediationNone, "recent-files")
			promotionWarning = &warning
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
	return result
}

func (service *AppModelService) setWriteInFlight(ctx context.Context, documentID string, inFlight bool) {
	ctx = service.runtimeContextOr(ctx)
	service.mu.Lock()
	document, ok := service.state.documents[documentID]
	if !ok || document.writeInFlight == inFlight {
		service.mu.Unlock()
		return
	}
	document.writeInFlight = inFlight
	patch := service.documentPatchLocked(documentID)
	if service.emitter != nil {
		func() {
			defer func() { _ = recover() }()
			_ = service.emitter.EmitStatePatch(ctx, patch)
		}()
	}
	service.mu.Unlock()
}

func (service *AppModelService) writeCoordinator(documentID string) *DocumentWriteCoordinator {
	service.mu.Lock()
	defer service.mu.Unlock()
	if coordinator := service.writeCoordinators[documentID]; coordinator != nil {
		return coordinator
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
	service.writeCoordinators[documentID] = coordinator
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
		if otherID != documentID && document.canonicalIdentity != "" && document.canonicalIdentity == candidate.Identity {
			return "", classifiedSaveError(apperr.ClassifiedConflict, "The Save As target is already open.")
		}
	}
	for _, reservation := range service.saveReservations {
		if reservation.identity == candidate.Identity {
			return "", classifiedSaveError(apperr.ClassifiedConflict, "The Save As target is already reserved.")
		}
	}
	id := mintDocumentID()
	service.saveReservations[id] = &saveReservation{id: id, identity: candidate.Identity, path: candidate.Path}
	return id, nil
}

func (service *AppModelService) releaseSaveTarget(reservationID string) {
	service.mu.Lock()
	defer service.mu.Unlock()
	delete(service.saveReservations, reservationID)
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
	defer func() {
		if recovered := recover(); recovered != nil {
			err = fmt.Errorf("save hook panic: %v", recovered)
		}
	}()
	hook(path)
	return nil
}

/*
 * The subject argument is the document's own label, never its id.
 *
 * These passed `documentID`, and `NewClassifiedError`'s `filepath.Base` is a no-op
 * on a minted id, so `SafeSubject` was `doc-0000000000000003`. The frontend renders
 * that field as the notification title (`classifiedNotification.ts:63`), and the
 * contract requires "only the safe basename or the document's shortest-unique
 * disambiguated tab label". It stayed hidden while the write path ran through
 * `localizedErrorCopy`, which overwrote the title with catalogue copy; T117 stopped
 * that, and the id became user-visible on every one of these call sites.
 *
 * `documentID` still travels as the id argument, because `DedupKey` is built from it
 * and the contract's "one notification per identity and category" rule depends on it.
 */
func (service *AppModelService) refusedWrite(documentID string, category apperr.ClassifiedErrorCategory, message string, remediation apperr.ClassifiedRemediation) apperr.WriteResult {
	return refusedWriteLabelled(service.safeDocumentLabelLocked(documentID), documentID, category, message, remediation)
}

/*
 * The subject-taking form, for the one caller that cannot resolve a label: the
 * handler's panic recovery. It holds `AppModelServiceAPI` rather than the concrete
 * service, and it is recovering from a panic in the very code that owns the document
 * map — so reaching into that state to prettify an error would be trading a safe
 * generic word for a second crash. "document" is a small failure; the internal id
 * would be a contract violation.
 */
func refusedWriteLabelled(subject, documentID string, category apperr.ClassifiedErrorCategory, message string, remediation apperr.ClassifiedRemediation) apperr.WriteResult {
	errorValue := apperr.NewClassifiedError(category, subject, message, remediation, documentID)
	return apperr.WriteResult{Status: apperr.WriteStatusRefused, Error: &errorValue}
}

func (service *AppModelService) conflictWrite(documentID, message string) apperr.WriteResult {
	errorValue := apperr.NewClassifiedError(apperr.ClassifiedConflict, service.safeDocumentLabelLocked(documentID), message, apperr.RemediationNone, documentID)
	return apperr.WriteResult{Status: apperr.WriteStatusConflict, Error: &errorValue}
}

func classifiedSaveError(category apperr.ClassifiedErrorCategory, message string) *apperr.ClassifiedError {
	errorValue := apperr.NewClassifiedError(category, "Save As target", message, apperr.RemediationNone, "")
	return &errorValue
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
// It must not take the lock itself. `refusedWrite` and `classifiedConflictError`
// are both called from inside locked regions, and Go's RWMutex is not reentrant —
// an inner RLock deadlocks as soon as a writer is queued behind it.
func (service *AppModelService) safeDocumentLabelLocked(documentID string) string {
	document, ok := service.state.documents[documentID]
	if !ok {
		return "document"
	}
	return documentLabelFromMetadata(document.metadata)
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
