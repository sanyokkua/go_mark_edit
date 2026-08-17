package appmodel

import (
	"context"
	"fmt"

	"github.com/rs/zerolog"
	"github.com/sanyokkua/go_mark_edit/internal/apperr"
	"github.com/sanyokkua/go_mark_edit/internal/logging"
)

const appModelPanicFormat = "panic: %v"

// AppModelServiceAPI is the handler's package-owned service boundary.
type AppModelServiceAPI interface {
	GetState(ctx context.Context) (apperr.AppState, error)
	NewDocument(ctx context.Context, expectedTabSetRevision uint64) apperr.DocumentTransitionResult
	ActivateDocument(ctx context.Context, documentID string, expectedTabSetRevision uint64) apperr.DocumentTransitionResult
	ReorderDocument(ctx context.Context, documentID string, targetIndex int, expectedTabSetRevision uint64) apperr.TabTransitionResult
	CloseDocument(ctx context.Context, documentID string, expectedTabSetRevision uint64) apperr.TabTransitionResult
	CopyPath(ctx context.Context, documentID string) apperr.CopyPathResult
	RevealInFileManager(ctx context.Context, documentID string) apperr.RevealResult
	OpenFromDialog(ctx context.Context, expectedTabSetRevision uint64) apperr.OpenResult
	OpenPath(ctx context.Context, path string, expectedTabSetRevision uint64) apperr.OpenResult
	ReopenLastFile(ctx context.Context, expectedTabSetRevision uint64) apperr.OpenResult
	UpdateBuffer(ctx context.Context, documentID, content string) error
	SetDocView(ctx context.Context, documentID string, view apperr.DocViewInput) error
	SetUILayout(ctx context.Context, layout apperr.UILayout) error
	Save(ctx context.Context, documentID string, contentRevision uint64, decisionToken string) apperr.WriteResult
	// CancelNormalization takes no context: it only releases an in-memory
	// authorization and touches neither disk nor the operating system. T168.
	CancelNormalization(documentID, token string) apperr.ClassifiedVoidResult
	SaveAs(ctx context.Context, documentID string, contentRevision uint64, decisionToken string) apperr.WriteResult
	CheckExternalChanges(ctx context.Context, documentID string) apperr.ConflictResult
	// ForegroundCheck is CheckExternalChanges named for FR-FT-020's window
	// focus or resume occasion; the bound handler below calls it so the
	// occasion is legible from the wire inwards.
	ForegroundCheck(ctx context.Context, documentID string) apperr.ConflictResult
	ReloadFromDisk(ctx context.Context, documentID string, contentRevision uint64, detectedVersion apperr.DiskVersion) apperr.ConflictResult
	AuthorizeKeepMine(ctx context.Context, documentID string, contentRevision uint64, path string, detectedVersion apperr.DiskVersion) apperr.ConflictResult
	SkipConflict(ctx context.Context, documentID string, contentRevision uint64, detectedVersion apperr.DiskVersion) apperr.ConflictResult
	CancelConflict(ctx context.Context, documentID string, contentRevision uint64, detectedVersion apperr.DiskVersion) apperr.ConflictResult
}

// ClosePlanServiceAPI is kept separate from the legacy command surface so
// older test doubles and embedders can continue to expose direct clean-tab
// commands while the shared close prompt is introduced.
type ClosePlanServiceAPI interface {
	PrepareClose(ctx context.Context, kind apperr.ClosePlanKind, targetDocumentIDs []string, expectedTabSetRevision uint64) apperr.ClosePlanResult
	ResolveClosePlan(ctx context.Context, planID string, decisions []apperr.ClosePlanDecision) apperr.ClosePlanResult
	ExecuteClosePlan(ctx context.Context, planID string) apperr.TabTransitionResult
}

// OpenDocument opens the native picker and commits its selected path through canonical Open.
func (handler *AppModelHandler) OpenDocument(expectedTabSetRevision uint64) (res apperr.OpenResult) {
	defer func() {
		if recover() != nil {
			res = apperr.OpenResult{Status: apperr.OpenStatusRefused, Error: classifiedOpenError(apperr.ClassifiedSystemCommandFailure, "The Open dialog could not be opened.", apperr.RemediationRetry)}
		}
	}()
	return handler.service.OpenFromDialog(handler.context(), expectedTabSetRevision)
}

// OpenRecentFile opens a selected recent path through the same canonical Open lifecycle.
func (handler *AppModelHandler) OpenRecentFile(path string, expectedTabSetRevision uint64) (res apperr.OpenResult) {
	defer func() {
		if recover() != nil {
			res = apperr.OpenResult{Status: apperr.OpenStatusRefused, Error: classifiedOpenError(apperr.ClassifiedSystemCommandFailure, "The recent file could not be opened.", apperr.RemediationRetry)}
		}
	}()
	return handler.service.OpenPath(handler.context(), path, expectedTabSetRevision)
}

// ReopenLastFile consumes the newest eligible closed entry through canonical Open.
func (handler *AppModelHandler) ReopenLastFile(expectedTabSetRevision uint64) (res apperr.OpenResult) {
	defer func() {
		if recover() != nil {
			res = apperr.OpenResult{Status: apperr.OpenStatusRefused, Error: classifiedOpenError(apperr.ClassifiedSystemCommandFailure, "The recently closed file could not be reopened.", apperr.RemediationRetry)}
		}
	}()
	return handler.service.ReopenLastFile(handler.context(), expectedTabSetRevision)
}

// NewDocument mints and activates one empty untitled document after a tab-set revision check.
func (handler *AppModelHandler) NewDocument(expectedTabSetRevision uint64) (res apperr.DocumentTransitionResult) {
	defer func() {
		if recovered := recover(); recovered != nil {
			res = documentTransitionFailure(
				apperr.ClassifiedIOFailure,
				"The new document could not be published.",
				apperr.RemediationRetry,
			)
		}
	}()

	return handler.service.NewDocument(handler.context(), expectedTabSetRevision)
}

// ActivateDocument changes the active identity only after a tab-set revision check.
func (handler *AppModelHandler) ActivateDocument(documentID string, expectedTabSetRevision uint64) (res apperr.DocumentTransitionResult) {
	defer func() {
		if recover() != nil {
			res = documentTransitionFailure(apperr.ClassifiedSystemCommandFailure, "The active document could not be published.", apperr.RemediationRetry)
		}
	}()
	return handler.service.ActivateDocument(handler.context(), documentID, expectedTabSetRevision)
}

// ReorderDocument moves one tab by one backend-confirmed position.
func (handler *AppModelHandler) ReorderDocument(documentID string, targetIndex int, expectedTabSetRevision uint64) (res apperr.TabTransitionResult) {
	defer func() {
		if recover() != nil {
			res = tabTransitionFailure(apperr.ClassifiedSystemCommandFailure, documentID, "The tab order could not be published.", apperr.RemediationRetry)
		}
	}()
	return handler.service.ReorderDocument(handler.context(), documentID, targetIndex, expectedTabSetRevision)
}

// CloseDocument removes one tab after a backend tab-set revision check.
func (handler *AppModelHandler) CloseDocument(documentID string, expectedTabSetRevision uint64) (res apperr.TabTransitionResult) {
	defer func() {
		if recover() != nil {
			res = tabTransitionFailure(apperr.ClassifiedSystemCommandFailure, documentID, "The document could not be closed.", apperr.RemediationRetry)
		}
	}()
	return handler.service.CloseDocument(handler.context(), documentID, expectedTabSetRevision)
}

// PrepareClose creates one immutable, revision-bound close plan. The frontend
// must gather any user decisions before calling ResolveClosePlan.
func (handler *AppModelHandler) PrepareClose(kind string, targetDocumentIDs []string, expectedTabSetRevision uint64) (res apperr.ClosePlanResult) {
	defer func() {
		if recover() != nil {
			res = closePlanRefused(apperr.ClassifiedSystemCommandFailure, "close plan", "The close plan could not be prepared.", apperr.RemediationRetry)
		}
	}()
	planner, ok := handler.service.(ClosePlanServiceAPI)
	if !ok {
		return closePlanRefused(apperr.ClassifiedSystemCommandFailure, "close plan", "The close plan service is unavailable.", apperr.RemediationRetry)
	}
	return planner.PrepareClose(handler.context(), apperr.ClosePlanKind(kind), targetDocumentIDs, expectedTabSetRevision)
}

// ResolveClosePlan records complete Save/Discard choices and any already
// authorized write decisions without performing a batch write.
func (handler *AppModelHandler) ResolveClosePlan(planID string, decisions []apperr.ClosePlanDecision) (res apperr.ClosePlanResult) {
	defer func() {
		if recover() != nil {
			res = closePlanRefused(apperr.ClassifiedSystemCommandFailure, planID, "The close plan could not be resolved.", apperr.RemediationRetry)
		}
	}()
	planner, ok := handler.service.(ClosePlanServiceAPI)
	if !ok {
		return closePlanRefused(apperr.ClassifiedSystemCommandFailure, planID, "The close plan service is unavailable.", apperr.RemediationRetry)
	}
	return planner.ResolveClosePlan(handler.context(), planID, decisions)
}

// ExecuteClosePlan saves in authoritative order and removes all targets only
// after every requested save has committed successfully.
func (handler *AppModelHandler) ExecuteClosePlan(planID string) (res apperr.TabTransitionResult) {
	defer func() {
		if recover() != nil {
			res = tabTransitionFailure(apperr.ClassifiedSystemCommandFailure, planID, "The close plan could not be executed.", apperr.RemediationRetry)
		}
	}()
	planner, ok := handler.service.(ClosePlanServiceAPI)
	if !ok {
		return tabTransitionFailure(apperr.ClassifiedSystemCommandFailure, planID, "The close plan service is unavailable.", apperr.RemediationRetry)
	}
	return planner.ExecuteClosePlan(handler.context(), planID)
}

// CancelNormalization releases the authorization a dismissed normalization
// prompt was raised with.
//
// FR-FT-011 makes the mixed-ending confirmation single-use and requires that
// "cancellation MUST resume nothing". Confirming consumes the authorization;
// dismissing had no way to release it, because CancelNormalization existed in
// the service and was not on the bound surface at all — this handler is what
// gives the frontend a way to call it. T168.
func (handler *AppModelHandler) CancelNormalization(documentID string, decisionToken string) (res apperr.ClassifiedVoidResult) {
	defer func() {
		if recover() != nil {
			// The authorization is single-use and buys nothing on its own, so a
			// panic here leaks a map entry rather than authorizing a write. Retry
			// is the honest remediation: re-issuing the release is well defined,
			// because the command is idempotent.
			classified := apperr.NewClassifiedError(
				apperr.ClassifiedSystemCommandFailure,
				"",
				"The normalization prompt could not be dismissed.",
				apperr.RemediationRetry,
				documentID,
			)
			res = apperr.ClassifiedVoidResult{Error: &classified}
		}
	}()
	return handler.service.CancelNormalization(documentID, decisionToken)
}

// CopyPath delegates the explicit canonical path action to the injected clipboard port.
func (handler *AppModelHandler) CopyPath(documentID string) (res apperr.CopyPathResult) {
	defer func() {
		if recover() != nil {
			res = pathCommandFailure(apperr.ClassifiedSystemCommandFailure, documentID, documentID, "The path could not be copied.", apperr.RemediationRetry)
		}
	}()
	return handler.service.CopyPath(handler.context(), documentID)
}

// RevealInFileManager delegates the explicit path reveal action to the injected host port.
func (handler *AppModelHandler) RevealInFileManager(documentID string) (res apperr.RevealResult) {
	defer func() {
		if recover() != nil {
			res = revealFailure(apperr.ClassifiedSystemCommandFailure, documentID, documentID, "The file manager could not reveal this document.", apperr.RemediationRetry)
		}
	}()
	return handler.service.RevealInFileManager(handler.context(), documentID)
}

// AppModelHandler is the Wails-bound application-model query and command surface.
type AppModelHandler struct {
	service         AppModelServiceAPI
	logger          *logging.Logger
	contextProvider func() context.Context
}

// NewAppModelHandler constructs the envelope boundary for AppModelService.
func NewAppModelHandler(service AppModelServiceAPI, logger *logging.Logger, contextProvider func() context.Context) *AppModelHandler {
	return &AppModelHandler{service: service, logger: logger, contextProvider: contextProvider}
}

// GetState returns the metadata snapshot and active buffer for projection hydration.
func (handler *AppModelHandler) GetState() (res apperr.StateResult) {
	defer func() {
		if recovered := recover(); recovered != nil {
			wire := apperr.ToWire(handler.zlog(), apperr.Internal(fmt.Errorf(appModelPanicFormat, recovered)))
			res = apperr.StateResult{Error: &wire}
		}
	}()

	state, err := handler.service.GetState(handler.context())
	if err != nil {
		wire := apperr.ToWire(handler.zlog(), err)
		return apperr.StateResult{Error: &wire}
	}
	return apperr.StateResult{Data: &state}
}

// UpdateBuffer accepts a complete canonical-buffer snapshot through the F3 seam.
func (handler *AppModelHandler) UpdateBuffer(documentID, content string) (res apperr.VoidResult) {
	defer func() {
		if recovered := recover(); recovered != nil {
			wire := apperr.ToWire(handler.zlog(), apperr.Internal(fmt.Errorf(appModelPanicFormat, recovered)))
			res = apperr.VoidResult{Error: &wire}
		}
	}()

	if err := handler.service.UpdateBuffer(handler.context(), documentID, content); err != nil {
		wire := apperr.ToWire(handler.zlog(), err)
		return apperr.VoidResult{Error: &wire}
	}
	return apperr.VoidResult{}
}

// SetDocView stores restorable metadata for the selected document.
func (handler *AppModelHandler) SetDocView(documentID string, view apperr.DocViewInput) (res apperr.VoidResult) {
	defer func() {
		if recovered := recover(); recovered != nil {
			wire := apperr.ToWire(handler.zlog(), apperr.Internal(fmt.Errorf(appModelPanicFormat, recovered)))
			res = apperr.VoidResult{Error: &wire}
		}
	}()

	if err := handler.service.SetDocView(handler.context(), documentID, view); err != nil {
		wire := apperr.ToWire(handler.zlog(), err)
		return apperr.VoidResult{Error: &wire}
	}
	return apperr.VoidResult{}
}

// SetUILayout merges application-level layout fields in memory.
func (handler *AppModelHandler) SetUILayout(layout apperr.UILayout) (res apperr.VoidResult) {
	defer func() {
		if recovered := recover(); recovered != nil {
			wire := apperr.ToWire(handler.zlog(), apperr.Internal(fmt.Errorf(appModelPanicFormat, recovered)))
			res = apperr.VoidResult{Error: &wire}
		}
	}()

	if err := handler.service.SetUILayout(handler.context(), layout); err != nil {
		wire := apperr.ToWire(handler.zlog(), err)
		return apperr.VoidResult{Error: &wire}
	}
	return apperr.VoidResult{}
}

// Save commits the newest backend-owned buffer for one revision-bound document.
func (handler *AppModelHandler) Save(documentID string, contentRevision uint64, decisionToken string) (res apperr.WriteResult) {
	defer func() {
		if recover() != nil {
			res = refusedWriteLabelled("document", documentID, apperr.ClassifiedSystemCommandFailure, "The document could not be saved.", apperr.RemediationRetry)
		}
	}()
	return handler.service.Save(handler.context(), documentID, contentRevision, decisionToken)
}

// SaveAs runs the native target-selection and overwrite-confirmation flow.
func (handler *AppModelHandler) SaveAs(documentID string, contentRevision uint64, decisionToken string) (res apperr.WriteResult) {
	defer func() {
		if recover() != nil {
			res = refusedWriteLabelled("document", documentID, apperr.ClassifiedSystemCommandFailure, "The document could not be saved under a new name.", apperr.RemediationRetry)
		}
	}()
	return handler.service.SaveAs(handler.context(), documentID, contentRevision, decisionToken)
}

// CheckExternalChanges performs an explicit foreground-only version check.
//
// This is the bound surface for FR-FT-020's "window focus or resume" occasion,
// and it delegates to ForegroundCheck to say so. Tab activation never reaches
// here: the backend attaches its own check to every ActivateDocument through
// attachForegroundConflict, which routes to CheckDocumentDisk. The webview is
// the only party that can see focus or resume, because Wails v2 registers no
// lifecycle hook for either, so the frontend calls this from its foreground
// listener (frontend/src/ui/widgets/DocumentTabs.tsx).
func (handler *AppModelHandler) CheckExternalChanges(documentID string) (res apperr.ConflictResult) {
	defer func() {
		if recover() != nil {
			res = conflictRefusedLabelled(documentID, apperr.ClassifiedSystemCommandFailure, "The document could not be checked for external changes.", apperr.RemediationRetry)
		}
	}()
	return handler.service.ForegroundCheck(handler.context(), documentID)
}

// ReloadFromDisk applies one revision/version-bound external reload.
func (handler *AppModelHandler) ReloadFromDisk(documentID string, contentRevision uint64, detectedVersion apperr.DiskVersion) (res apperr.ConflictResult) {
	defer func() {
		if recover() != nil {
			res = conflictRefusedLabelled(documentID, apperr.ClassifiedSystemCommandFailure, "The document could not be reloaded.", apperr.RemediationRetry)
		}
	}()
	return handler.service.ReloadFromDisk(handler.context(), documentID, contentRevision, detectedVersion)
}

// AuthorizeKeepMine returns a single-use overwrite token for the compared state.
func (handler *AppModelHandler) AuthorizeKeepMine(documentID string, contentRevision uint64, path string, detectedVersion apperr.DiskVersion) (res apperr.ConflictResult) {
	defer func() {
		if recover() != nil {
			res = conflictRefusedLabelled(documentID, apperr.ClassifiedSystemCommandFailure, "The overwrite decision could not be prepared.", apperr.RemediationRetry)
		}
	}()
	return handler.service.AuthorizeKeepMine(handler.context(), documentID, contentRevision, path, detectedVersion)
}

// SkipConflict cancels one write/check attempt without changing source or disk.
func (handler *AppModelHandler) SkipConflict(documentID string, contentRevision uint64, detectedVersion apperr.DiskVersion) (res apperr.ConflictResult) {
	defer func() {
		if recover() != nil {
			res = conflictRefusedLabelled(documentID, apperr.ClassifiedSystemCommandFailure, "The conflict decision could not be cancelled.", apperr.RemediationRetry)
		}
	}()
	return handler.service.SkipConflict(handler.context(), documentID, contentRevision, detectedVersion)
}

// CancelConflict dismisses a read-only foreground check without changing disk or source.
func (handler *AppModelHandler) CancelConflict(documentID string, contentRevision uint64, detectedVersion apperr.DiskVersion) (res apperr.ConflictResult) {
	defer func() {
		if recover() != nil {
			res = conflictRefusedLabelled(documentID, apperr.ClassifiedSystemCommandFailure, "The conflict decision could not be cancelled.", apperr.RemediationRetry)
		}
	}()
	return handler.service.CancelConflict(handler.context(), documentID, contentRevision, detectedVersion)
}

func (handler *AppModelHandler) context() context.Context {
	if handler.contextProvider == nil {
		return context.Background()
	}
	return handler.contextProvider()
}

func (handler *AppModelHandler) zlog() zerolog.Logger {
	if handler.logger == nil {
		return zerolog.Nop()
	}
	return handler.logger.Zerolog()
}

var _ AppModelServiceAPI = (*AppModelService)(nil)
