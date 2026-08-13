package appmodel

import (
	"context"
	"fmt"
	"path/filepath"
	"strings"

	"github.com/sanyokkua/go_mark_edit/internal/apperr"
	"github.com/sanyokkua/go_mark_edit/internal/file"
)

// closePlan is the backend-owned, revision-bound transaction. The exported
// summary is rebuilt on every response; callers cannot mutate this source of
// truth or provide a source-copy substitute for a later write.
type closePlan struct {
	summary apperr.ClosePlanSummary
	targets []closePlanTarget
}

type closePlanTarget struct {
	documentID         string
	contentRevision    uint64
	choice             apperr.CloseChoice
	normalizationToken string
	savePath           string
	saveIdentity       string
	expectedVersion    file.DiskVersion
	expectedRawHash    string
	reservationID      string
}

// PrepareClose flushes pending autosave work, waits for any write in flight,
// then captures one complete target list in authoritative tab order. It never
// writes, discards, or removes a document as a consequence of planning.
func (service *AppModelService) PrepareClose(ctx context.Context, kind apperr.ClosePlanKind, targetDocumentIDs []string, expectedTabSetRevision uint64) apperr.ClosePlanResult {
	if !validClosePlanKind(kind) {
		return closePlanRefused(apperr.ClassifiedUnsupportedInput, "close plan", "The close operation is not supported.", apperr.RemediationCancel)
	}

	service.mu.Lock()
	if service.state.tabSetRevision != expectedTabSetRevision {
		service.mu.Unlock()
		return closePlanRefused(apperr.ClassifiedConflict, "close plan", "The tab set changed; close must be retried.", apperr.RemediationRetry)
	}
	requested, err := closePlanTargetOrderLocked(service.state.orderedDocumentIDs, service.state.documents, kind, targetDocumentIDs)
	if err != nil {
		service.mu.Unlock()
		return closePlanRefused(apperr.ClassifiedNotFound, "close plan", err.Error(), apperr.RemediationCancel)
	}
	if service.activeClosePlan != "" {
		if existing := service.closePlans[service.activeClosePlan]; existing != nil && existing.summary.TabSetRevision == expectedTabSetRevision && existing.summary.Kind == kind && sameStringSlice(closePlanTargetIDs(existing.summary), requested) {
			result := closePlanSummaryResult(existing)
			service.mu.Unlock()
			return result
		}
		service.mu.Unlock()
		return closePlanRefused(apperr.ClassifiedConflict, "close plan", "Another close plan is already collecting choices.", apperr.RemediationRetry)
	}
	service.mu.Unlock()

	// A scheduled autosave is still accepted work. Running it synchronously is
	// what lets a close of a dirty tab become a silent clean close when the
	// latest revision reaches disk successfully.
	for _, documentID := range requested {
		service.flushAutosaveForClose(documentID)
	}

	service.mu.Lock()
	defer service.mu.Unlock()
	if service.state.tabSetRevision != expectedTabSetRevision {
		return closePlanRefused(apperr.ClassifiedConflict, "close plan", "The tab set changed while autosave work drained.", apperr.RemediationRetry)
	}
	for _, documentID := range requested {
		if _, ok := service.state.documents[documentID]; !ok {
			return closePlanRefused(apperr.ClassifiedNotFound, documentID, "The document is no longer open.", apperr.RemediationCancel)
		}
	}

	plan := &closePlan{summary: apperr.ClosePlanSummary{ID: mintDocumentID(), Kind: kind, TabSetRevision: expectedTabSetRevision, Status: apperr.ClosePlanReady}, targets: make([]closePlanTarget, 0, len(requested))}
	for _, documentID := range requested {
		document := service.state.documents[documentID]
		metadata := service.effectiveDocumentMetadataLocked(document)
		target := apperr.CloseTarget{
			DocumentID: documentID, Title: metadata.Title, Path: metadata.Path,
			DisplayName: metadata.DisplayName, ContentRevision: metadata.ContentRevision,
			Dirty: metadata.Dirty, Capability: metadata.Capability,
			WriteInFlight: metadata.WriteInFlight, Status: metadata.Status,
		}
		plan.summary.Targets = append(plan.summary.Targets, target)
		plan.targets = append(plan.targets, closePlanTarget{documentID: documentID, contentRevision: metadata.ContentRevision})
		if metadata.Dirty {
			plan.summary.DirtyTargetIDs = append(plan.summary.DirtyTargetIDs, documentID)
		}
	}
	if len(plan.summary.DirtyTargetIDs) > 0 {
		plan.summary.Status = apperr.ClosePlanCollecting
	}
	service.closePlans[plan.summary.ID] = plan
	service.activeClosePlan = plan.summary.ID
	return closePlanSummaryResult(plan)
}

// ResolveClosePlan records all dirty choices and gathers revision-bound
// normalization/conflict authorizations before execution. A mixed-ending
// requirement is surfaced one target at a time in the same authoritative
// order as the eventual save batch.
func (service *AppModelService) ResolveClosePlan(ctx context.Context, planID string, decisions []apperr.ClosePlanDecision) apperr.ClosePlanResult {
	service.mu.Lock()
	plan := service.closePlans[planID]
	if plan == nil || service.activeClosePlan != planID {
		service.mu.Unlock()
		return closePlanRefused(apperr.ClassifiedNotFound, planID, "The close plan is no longer active.", apperr.RemediationRetry)
	}
	if plan.summary.Status != apperr.ClosePlanCollecting && plan.summary.Status != apperr.ClosePlanReady {
		result := closePlanSummaryResult(plan)
		service.mu.Unlock()
		return result
	}
	if err := service.validateClosePlanLocked(plan); err != nil {
		service.invalidateClosePlanLocked(plan, apperr.ClosePlanFailed)
		service.mu.Unlock()
		return closePlanRefused(apperr.ClassifiedConflict, planID, err.Error(), apperr.RemediationRetry)
	}

	choices, cancelled, err := normalizeCloseDecisions(plan, decisions)
	if err != nil {
		result := closePlanSummaryResult(plan)
		service.mu.Unlock()
		return result
	}
	if cancelled {
		service.invalidateClosePlanLocked(plan, apperr.ClosePlanCancelled)
		result := closePlanSummaryResult(plan)
		service.mu.Unlock()
		return result
	}
	for index := range plan.targets {
		plan.targets[index].choice = choices[plan.targets[index].documentID]
		plan.summary.Targets[index].Choice = plan.targets[index].choice
	}
	for _, decision := range decisions {
		for index := range plan.targets {
			if plan.targets[index].documentID == decision.DocumentID {
				plan.targets[index].normalizationToken = decision.DecisionToken
				plan.summary.Targets[index].NormalizationToken = decision.DecisionToken
			}
		}
	}
	service.mu.Unlock()

	// Required mixed-ending authorizations are collected before any conflict
	// inspection or write. The returned token is intentionally single-use and
	// remains bound to this exact plan target revision.
	for index := range plan.targets {
		if plan.targets[index].choice != apperr.CloseChoiceSave {
			continue
		}
		service.mu.Lock()
		current := service.closePlans[planID]
		if current == nil || service.activeClosePlan != planID {
			service.mu.Unlock()
			return closePlanRefused(apperr.ClassifiedConflict, planID, "The close plan is no longer active.", apperr.RemediationRetry)
		}
		target := &current.targets[index]
		document := service.state.documents[target.documentID]
		if document == nil || document.metadata.ContentRevision != target.contentRevision {
			service.invalidateClosePlanLocked(current, apperr.ClosePlanFailed)
			service.mu.Unlock()
			return closePlanRefused(apperr.ClassifiedConflict, target.documentID, "The document changed while the close plan was being resolved.", apperr.RemediationRetry)
		}
		if document.metadata.LineEnding == "mixed" && !validNormalizationTokenLocked(service, target.normalizationToken, target.documentID, target.contentRevision) {
			requested := service.requestNormalizationLocked(target.documentID, target.contentRevision)
			target.normalizationToken = requested.DecisionToken
			service.setNormalizationRequirementLocked(&current.summary.Targets[index], requested)
			service.mu.Unlock()
			return closePlanSummaryResult(current)
		}
		service.mu.Unlock()
	}

	// Save As is a native decision, so collect its target and overwrite
	// confirmation before the first batch write. The reservation remains held
	// by the plan until execution succeeds or the plan is invalidated.
	for index := range plan.targets {
		if plan.targets[index].choice != apperr.CloseChoiceSave {
			continue
		}
		service.mu.RLock()
		current := service.closePlans[planID]
		needsSaveAs := current != nil && index < len(current.targets) && current.targets[index].savePath == ""
		document := (*openDocument)(nil)
		if current != nil && index < len(current.targets) {
			document = service.state.documents[current.targets[index].documentID]
		}
		pathless := document != nil && document.metadata.Path == ""
		service.mu.RUnlock()
		if !needsSaveAs || !pathless {
			continue
		}
		classified, cancelled := service.resolveClosePlanSaveAs(ctx, planID, index)
		if classified != nil {
			return apperr.ClosePlanResult{Error: classified}
		}
		if cancelled {
			service.mu.Lock()
			current = service.closePlans[planID]
			result := closePlanSummaryResult(current)
			service.mu.Unlock()
			return result
		}
	}

	// Inspect every path-backed save before any write starts. This queues an
	// external conflict for the UI and accepts a Keep-mine token on a later
	// resolution pass without allowing an earlier target to be written first.
	for index := range plan.targets {
		if plan.targets[index].choice != apperr.CloseChoiceSave {
			continue
		}
		service.mu.Lock()
		current := service.closePlans[planID]
		if current == nil || service.activeClosePlan != planID {
			service.mu.Unlock()
			return closePlanRefused(apperr.ClassifiedConflict, planID, "The close plan is no longer active.", apperr.RemediationRetry)
		}
		target := current.targets[index]
		service.mu.Unlock()
		decisionToken := target.normalizationToken
		result := service.prepareWriteDisk(ctx, target.documentID, target.contentRevision, decisionToken)
		if result.Status == apperr.WriteStatusConflict {
			service.mu.Lock()
			current = service.closePlans[planID]
			if current != nil {
				current.summary.Targets[index].Conflict = result.Conflict
			}
			response := closePlanSummaryResult(current)
			service.mu.Unlock()
			return response
		}
		service.mu.Lock()
		current = service.closePlans[planID]
		if current != nil && index < len(current.summary.Targets) {
			current.summary.Targets[index].Conflict = nil
		}
		service.mu.Unlock()
		if result.Status == apperr.WriteStatusRefused {
			category := apperr.ClassifiedIOFailure
			if result.Error != nil {
				category = result.Error.Category
			}
			return closePlanRefused(category, target.documentID, "The close plan could not inspect the file.", apperr.RemediationRetry)
		}
	}

	service.mu.Lock()
	plan = service.closePlans[planID]
	if plan == nil || service.activeClosePlan != planID {
		service.mu.Unlock()
		return closePlanRefused(apperr.ClassifiedConflict, planID, "The close plan is no longer active.", apperr.RemediationRetry)
	}
	plan.summary.Status = apperr.ClosePlanReady
	service.mu.Unlock()
	return closePlanSummaryResult(plan)
}

// ExecuteClosePlan serializes all requested saves in tab order and only then
// performs one removal transition. A failed write expires the plan while
// leaving every tab open and preserving earlier successful disk commits.
func (service *AppModelService) ExecuteClosePlan(ctx context.Context, planID string) apperr.TabTransitionResult {
	service.mu.Lock()
	plan := service.closePlans[planID]
	if plan == nil || service.activeClosePlan != planID {
		service.mu.Unlock()
		return tabTransitionFailure(apperr.ClassifiedNotFound, planID, "The close plan is no longer active.", apperr.RemediationRetry)
	}
	if plan.summary.Status != apperr.ClosePlanReady {
		service.mu.Unlock()
		return tabTransitionFailure(apperr.ClassifiedConflict, planID, "The close plan is incomplete.", apperr.RemediationCancel)
	}
	if err := service.validateClosePlanLocked(plan); err != nil {
		service.invalidateClosePlanLocked(plan, apperr.ClosePlanFailed)
		service.mu.Unlock()
		return tabTransitionFailure(apperr.ClassifiedConflict, planID, err.Error(), apperr.RemediationRetry)
	}
	plan.summary.Status = apperr.ClosePlanExecuting
	targets := append([]closePlanTarget(nil), plan.targets...)
	service.mu.Unlock()

	for _, target := range targets {
		if target.choice != apperr.CloseChoiceSave {
			continue
		}
		result := apperr.WriteResult{}
		if target.savePath != "" {
			result = service.executeClosePlanSaveAs(ctx, target)
		} else {
			result = service.Save(ctx, target.documentID, target.contentRevision, target.normalizationToken)
		}
		if result.Status != apperr.WriteStatusCommitted {
			service.mu.Lock()
			if current := service.closePlans[planID]; current != nil {
				service.invalidateClosePlanLocked(current, apperr.ClosePlanFailed)
			}
			service.mu.Unlock()
			category := apperr.ClassifiedIOFailure
			message := "A close-plan save failed; all tabs remain open."
			if result.Error != nil {
				category = result.Error.Category
				message = result.Error.Message
			}
			return tabTransitionFailure(category, target.documentID, message, apperr.RemediationRetry)
		}
	}

	service.mu.Lock()
	plan = service.closePlans[planID]
	if plan == nil || service.activeClosePlan != planID {
		service.mu.Unlock()
		return tabTransitionFailure(apperr.ClassifiedConflict, planID, "The close plan was invalidated during saving.", apperr.RemediationRetry)
	}
	if err := service.validateClosePlanLocked(plan); err != nil {
		service.invalidateClosePlanLocked(plan, apperr.ClosePlanFailed)
		service.mu.Unlock()
		return tabTransitionFailure(apperr.ClassifiedConflict, planID, err.Error(), apperr.RemediationRetry)
	}
	ids := make([]string, 0, len(plan.targets))
	for _, target := range plan.targets {
		ids = append(ids, target.documentID)
	}
	service.mu.Unlock()

	transition := service.closeDocuments(ctx, ids, &plan.summary.TabSetRevision)
	service.mu.Lock()
	if transition.Error == nil {
		if current := service.closePlans[planID]; current != nil {
			current.summary.Status = apperr.ClosePlanComplete
			service.releaseClosePlanReservationsLocked(current)
		}
		delete(service.closePlans, planID)
		if service.activeClosePlan == planID {
			service.activeClosePlan = ""
		}
	}
	service.mu.Unlock()
	return transition
}

func (service *AppModelService) executeClosePlanSaveAs(ctx context.Context, target closePlanTarget) apperr.WriteResult {
	currentVersion, err := file.CurrentDiskVersion(target.savePath)
	if err != nil || !currentVersion.Equal(target.expectedVersion) {
		return conflictWrite(target.documentID, "The Save As target changed before the close-plan write.")
	}
	if target.expectedRawHash != "" {
		currentHash, hashErr := rawBytesHash(target.savePath)
		if hashErr != nil || currentHash != target.expectedRawHash {
			return conflictWrite(target.documentID, "The Save As target bytes changed before the close-plan write.")
		}
	}
	snapshot, result := service.snapshotForWrite(target.documentID, target.contentRevision, target.normalizationToken, target.savePath, true)
	if result.Status != "" {
		return result
	}
	snapshot.identity = target.saveIdentity
	snapshot.expectedVersion = target.expectedVersion
	snapshot.expectedRawHash = target.expectedRawHash
	return service.executeWrite(ctx, snapshot, SaveOriginSaveAs)
}

func (service *AppModelService) validateClosePlanLocked(plan *closePlan) error {
	if service.state.tabSetRevision != plan.summary.TabSetRevision {
		return fmt.Errorf("the tab set changed while the close plan was open")
	}
	for index, target := range plan.targets {
		document := service.state.documents[target.documentID]
		if document == nil || document.metadata.ContentRevision != target.contentRevision {
			return fmt.Errorf("document %s changed while the close plan was open", target.documentID)
		}
		if index >= len(plan.summary.Targets) || plan.summary.Targets[index].DocumentID != target.documentID {
			return fmt.Errorf("the close plan target order changed")
		}
	}
	return nil
}

func (service *AppModelService) resolveClosePlanSaveAs(ctx context.Context, planID string, index int) (*apperr.ClassifiedError, bool) {
	service.mu.RLock()
	plan := service.closePlans[planID]
	if plan == nil || service.activeClosePlan != planID || index < 0 || index >= len(plan.targets) {
		service.mu.RUnlock()
		return classifiedClosePlanError(apperr.ClassifiedConflict, planID, "The close plan is no longer active.", apperr.RemediationRetry), false
	}
	target := plan.targets[index]
	document := service.state.documents[target.documentID]
	dialog := service.saveDialog
	if document == nil || document.metadata.ContentRevision != target.contentRevision {
		service.mu.RUnlock()
		return classifiedClosePlanError(apperr.ClassifiedConflict, target.documentID, "The document changed while Save As was being prepared.", apperr.RemediationRetry), false
	}
	defaultFilename := document.metadata.DisplayName
	if defaultFilename == "" {
		defaultFilename = "Untitled.md"
	} else if filepath.Ext(defaultFilename) == "" {
		defaultFilename += ".md"
	}
	service.mu.RUnlock()
	if dialog == nil {
		return classifiedClosePlanError(apperr.ClassifiedSystemCommandFailure, target.documentID, "The Save dialog is unavailable.", apperr.RemediationCancel), false
	}
	selected, err := dialog.ChooseSaveFile(ctx, SaveDialogRequest{DefaultFilename: defaultFilename, Title: "Save Markdown document"})
	if err != nil {
		return classifiedClosePlanError(apperr.ClassifiedSystemCommandFailure, target.documentID, "The Save dialog could not be opened.", apperr.RemediationRetry), false
	}
	if strings.TrimSpace(selected) == "" {
		service.mu.Lock()
		if current := service.closePlans[planID]; current != nil {
			service.invalidateClosePlanLocked(current, apperr.ClosePlanCancelled)
		}
		service.mu.Unlock()
		return nil, true
	}
	if filepath.Ext(selected) == "" {
		selected += ".md"
	}
	if !file.IsSupportedDocumentSuffix(selected) {
		return classifiedClosePlanError(apperr.ClassifiedUnsupportedInput, target.documentID, "The selected save name has an unsupported suffix.", apperr.RemediationCancel), false
	}
	candidate, err := file.CanonicalizeCandidateDocumentPath(selected)
	if err != nil {
		return classifiedClosePlanError(apperr.ClassifiedIOFailure, target.documentID, "The Save As target could not be resolved.", apperr.RemediationRetry), false
	}
	reservationID, conflict := service.reserveSaveTarget(target.documentID, candidate)
	if conflict != nil {
		return conflict, false
	}
	expectedVersion, err := file.CurrentDiskVersion(candidate.Path)
	if err != nil {
		service.releaseSaveTarget(reservationID)
		return classifiedClosePlanError(apperr.ClassifiedIOFailure, target.documentID, "The Save As target could not be inspected.", apperr.RemediationRetry), false
	}
	expectedHash := ""
	if expectedVersion.Exists {
		confirmed, confirmErr := dialog.ConfirmOverwrite(ctx, candidate.DisplayName)
		if confirmErr != nil {
			service.releaseSaveTarget(reservationID)
			return classifiedClosePlanError(apperr.ClassifiedSystemCommandFailure, target.documentID, "The overwrite confirmation could not be shown.", apperr.RemediationRetry), false
		}
		if !confirmed {
			service.releaseSaveTarget(reservationID)
			service.mu.Lock()
			if current := service.closePlans[planID]; current != nil {
				service.invalidateClosePlanLocked(current, apperr.ClosePlanCancelled)
			}
			service.mu.Unlock()
			return nil, true
		}
		expectedVersion, err = file.CurrentDiskVersion(candidate.Path)
		if err != nil {
			service.releaseSaveTarget(reservationID)
			return classifiedClosePlanError(apperr.ClassifiedIOFailure, target.documentID, "The Save As target could not be inspected after confirmation.", apperr.RemediationRetry), false
		}
		expectedHash, err = stableRawBytesHash(candidate.Path, expectedVersion)
		if err != nil {
			service.releaseSaveTarget(reservationID)
			return classifiedClosePlanError(apperr.ClassifiedConflict, target.documentID, "The Save As target changed after confirmation.", apperr.RemediationRetry), false
		}
	}

	service.mu.Lock()
	current := service.closePlans[planID]
	if current == nil || service.activeClosePlan != planID || index >= len(current.targets) || current.targets[index].documentID != target.documentID || service.state.documents[target.documentID] == nil || service.state.documents[target.documentID].metadata.ContentRevision != target.contentRevision {
		service.mu.Unlock()
		service.releaseSaveTarget(reservationID)
		return classifiedClosePlanError(apperr.ClassifiedConflict, target.documentID, "The document changed while Save As was being prepared.", apperr.RemediationRetry), false
	}
	current.targets[index].savePath = candidate.Path
	current.targets[index].saveIdentity = candidate.Identity
	current.targets[index].expectedVersion = expectedVersion
	current.targets[index].expectedRawHash = expectedHash
	current.targets[index].reservationID = reservationID
	current.summary.Targets[index].SavePath = candidate.Path
	service.mu.Unlock()
	return nil, false
}

func classifiedClosePlanError(category apperr.ClassifiedErrorCategory, subject, message string, remediation apperr.ClassifiedRemediation) *apperr.ClassifiedError {
	errorValue := apperr.NewClassifiedError(category, subject, message, remediation, subject)
	return &errorValue
}

func (service *AppModelService) invalidateClosePlanLocked(plan *closePlan, status apperr.ClosePlanStatus) {
	plan.summary.Status = status
	service.releaseClosePlanReservationsLocked(plan)
	if service.activeClosePlan == plan.summary.ID {
		service.activeClosePlan = ""
	}
}

func (service *AppModelService) releaseClosePlanReservationsLocked(plan *closePlan) {
	for index := range plan.targets {
		if reservationID := plan.targets[index].reservationID; reservationID != "" {
			delete(service.saveReservations, reservationID)
			plan.targets[index].reservationID = ""
		}
	}
}

func (service *AppModelService) closeDocuments(ctx context.Context, documentIDs []string, expectedTabSetRevision *uint64) apperr.TabTransitionResult {
	service.mu.Lock()
	defer service.mu.Unlock()
	if expectedTabSetRevision != nil && service.state.tabSetRevision != *expectedTabSetRevision {
		return tabTransitionFailure(apperr.ClassifiedConflict, "close plan", "The tab set changed before tabs could be removed.", apperr.RemediationRetry)
	}
	if len(documentIDs) == 0 {
		return service.tabTransitionSuccess(apperr.TabTransitionClosed, "")
	}
	requested := make(map[string]struct{}, len(documentIDs))
	for _, documentID := range documentIDs {
		if _, ok := service.state.documents[documentID]; !ok {
			return tabTransitionFailure(apperr.ClassifiedNotFound, documentID, "The document is no longer open.", apperr.RemediationCancel)
		}
		requested[documentID] = struct{}{}
	}
	before := service.snapshotLocked()
	activeIndex := indexOfDocument(service.state.orderedDocumentIDs, service.state.activeDocumentID)
	removedActive := false
	for _, documentID := range documentIDs {
		if documentID == service.state.activeDocumentID {
			removedActive = true
		}
		deleteTokensForDocument(service.keepMine, documentID)
		service.removeConflictLocked(documentID)
		if closedPath := before.documents[documentID].metadata.Path; closedPath != "" {
			service.rememberClosedLocked(closedPath, before.documents[documentID])
		}
		delete(service.state.documents, documentID)
	}
	remaining := make([]string, 0, len(service.state.orderedDocumentIDs)-len(requested))
	for _, documentID := range service.state.orderedDocumentIDs {
		if _, remove := requested[documentID]; !remove {
			remaining = append(remaining, documentID)
		}
	}
	service.state.orderedDocumentIDs = remaining
	if removedActive {
		service.state.activeDocumentID = ""
		if len(remaining) > 0 {
			if activeIndex >= len(remaining) {
				activeIndex = len(remaining) - 1
			}
			service.state.activeDocumentID = remaining[activeIndex]
		}
	}
	service.state.canReopenLastFile = len(service.state.recentlyClosed) > 0
	service.state.tabSetRevision++
	service.state.revision++
	patch := service.tabStatePatchLocked()
	patch.Documents = &apperr.DocumentsPatch{Remove: append([]string(nil), documentIDs...)}
	patch.RecentFiles = append([]string(nil), service.state.recentFiles...)
	patch.CanReopenLastFile = pointerTo(service.state.canReopenLastFile)
	if err := service.publishLocked(ctx, before, patch); err != nil {
		return tabTransitionFailure(apperr.ClassifiedIOFailure, documentIDs[0], "The documents could not be closed.", apperr.RemediationRetry)
	}
	return service.tabTransitionSuccess(apperr.TabTransitionClosed, documentIDs[0])
}

func closePlanTargetOrderLocked(order []string, documents map[string]*openDocument, kind apperr.ClosePlanKind, requested []string) ([]string, error) {
	if kind == apperr.ClosePlanWindow || kind == apperr.ClosePlanQuit {
		requested = append([]string(nil), order...)
	}
	if kind == apperr.ClosePlanSingle && len(requested) != 1 {
		return nil, fmt.Errorf("single close requires exactly one target")
	}
	seen := make(map[string]struct{}, len(requested))
	for _, documentID := range requested {
		if _, ok := documents[documentID]; !ok {
			return nil, fmt.Errorf("the document %s is no longer open", documentID)
		}
		if _, duplicate := seen[documentID]; duplicate {
			return nil, fmt.Errorf("the close target list contains a duplicate document")
		}
		seen[documentID] = struct{}{}
	}
	ordered := make([]string, 0, len(requested))
	for _, documentID := range order {
		if _, ok := seen[documentID]; ok {
			ordered = append(ordered, documentID)
		}
	}
	return ordered, nil
}

func normalizeCloseDecisions(plan *closePlan, decisions []apperr.ClosePlanDecision) (map[string]apperr.CloseChoice, bool, error) {
	choices := make(map[string]apperr.CloseChoice, len(decisions))
	var allChoice apperr.CloseChoice
	for _, decision := range decisions {
		if decision.Choice == apperr.CloseChoiceCancel {
			return nil, true, nil
		}
		if decision.Choice == apperr.CloseChoiceSaveAll || decision.Choice == apperr.CloseChoiceDiscardAll {
			if allChoice != "" && allChoice != decision.Choice {
				return nil, false, fmt.Errorf("conflicting close-all choices")
			}
			allChoice = decision.Choice
			continue
		}
		if decision.Choice != apperr.CloseChoiceSave && decision.Choice != apperr.CloseChoiceDiscard {
			return nil, false, fmt.Errorf("unsupported close choice")
		}
		if _, exists := choices[decision.DocumentID]; exists {
			return nil, false, fmt.Errorf("duplicate close choice")
		}
		choices[decision.DocumentID] = decision.Choice
	}
	if allChoice != "" {
		value := apperr.CloseChoiceSave
		if allChoice == apperr.CloseChoiceDiscardAll {
			value = apperr.CloseChoiceDiscard
		}
		for _, target := range plan.summary.Targets {
			if target.Dirty {
				choices[target.DocumentID] = value
			}
		}
	}
	for _, target := range plan.summary.Targets {
		if target.Dirty {
			if choices[target.DocumentID] == "" {
				return choices, false, fmt.Errorf("close choice is missing")
			}
		} else if choices[target.DocumentID] != "" {
			return choices, false, fmt.Errorf("clean target cannot have a dirty choice")
		}
	}
	return choices, false, nil
}

func validClosePlanKind(kind apperr.ClosePlanKind) bool {
	return kind == apperr.ClosePlanSingle || kind == apperr.ClosePlanOthers || kind == apperr.ClosePlanRight || kind == apperr.ClosePlanWindow || kind == apperr.ClosePlanQuit
}

func sameStringSlice(left, right []string) bool {
	if len(left) != len(right) {
		return false
	}
	for index := range left {
		if left[index] != right[index] {
			return false
		}
	}
	return true
}

func closePlanTargetIDs(summary apperr.ClosePlanSummary) []string {
	ids := make([]string, 0, len(summary.Targets))
	for _, target := range summary.Targets {
		ids = append(ids, target.DocumentID)
	}
	return ids
}

func closePlanSummaryResult(plan *closePlan) apperr.ClosePlanResult {
	if plan == nil {
		return closePlanRefused(apperr.ClassifiedNotFound, "close plan", "The close plan is no longer active.", apperr.RemediationRetry)
	}
	summary := plan.summary
	/*
	 * Copied into a non-nil slice, not `append([]CloseTarget(nil), …)`, which
	 * returns nil for an empty plan and marshals to `null`. `targets` carries no
	 * `omitempty` and the frontend declares it `CloseTarget[]`, so a null there
	 * threw while the plan was being normalised — and because the native close
	 * had already been vetoed, the caught throw cancelled the quit and left a
	 * window that could only be killed. A plan with nothing to close is an
	 * ordinary plan, so it puts an empty array on the wire.
	 */
	summary.Targets = append(make([]apperr.CloseTarget, 0, len(plan.summary.Targets)), plan.summary.Targets...)
	summary.DirtyTargetIDs = append([]string(nil), plan.summary.DirtyTargetIDs...)
	return apperr.ClosePlanResult{Data: &summary}
}

func closePlanRefused(category apperr.ClassifiedErrorCategory, subject, message string, remediation apperr.ClassifiedRemediation) apperr.ClosePlanResult {
	errorValue := apperr.NewClassifiedError(category, subject, message, remediation, subject)
	return apperr.ClosePlanResult{Error: &errorValue}
}

func validNormalizationTokenLocked(service *AppModelService, token, documentID string, revision uint64) bool {
	authorization, ok := service.normalizations[token]
	return token != "" && ok && authorization.documentID == documentID && authorization.contentRevision == revision
}

func (service *AppModelService) setNormalizationRequirementLocked(target *apperr.CloseTarget, result apperr.WriteResult) {
	target.NormalizationToken = result.DecisionToken
	target.ProposedEnding = result.ProposedEnding
}
