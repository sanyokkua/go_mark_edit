package application

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"fmt"
	"sync"
	"time"

	"github.com/sanyokkua/go_mark_edit/internal/apperr"
	"github.com/sanyokkua/go_mark_edit/internal/bridge"
	"github.com/sanyokkua/go_mark_edit/internal/logging"
)

// NativeCloseRequestEvent is emitted for a close request that the ready
// frontend must acknowledge.
const NativeCloseRequestEvent = bridge.EventApplicationCloseRequested

const shutdownDeadline = 10 * time.Second

// ShutdownState is the backend-owned state of the native close protocol.
type ShutdownState string

const (
	ShutdownIdle             ShutdownState = "idle"
	ShutdownRequested        ShutdownState = "requested"
	ShutdownAwaiting         ShutdownState = "awaiting"
	ShutdownRecoveryDecision ShutdownState = "recovery-decision"
	ShutdownDraining         ShutdownState = "draining"
	ShutdownConfirming       ShutdownState = "confirming"
	ShutdownExiting          ShutdownState = "exiting"
)

// CloseRequest is the identity and timing record for one native close or quit
// request. Only ID is sent in the browser event; the rest stays backend-owned.
type CloseRequest struct {
	ID             string        `json:"id"`
	State          ShutdownState `json:"state"`
	RequestedAt    time.Time     `json:"requestedAt"`
	Deadline       time.Time     `json:"deadline"`
	FrontendReady  bool          `json:"frontendReady"`
	DirtyDocuments []string      `json:"dirtyDocuments,omitempty"`
}

// ShutdownSnapshot is a read-only view used by integration tests and native
// lifecycle diagnostics.
type ShutdownSnapshot struct {
	State         ShutdownState
	Request       *CloseRequest
	FrontendReady bool
}

// ShutdownModel is the small application-model port needed by shutdown. The
// model owns document truth and the drain; this owner owns only protocol state.
type ShutdownModel interface {
	CloseStatus() (dirtyDocuments []string, pendingWork bool)
	BeginShutdownDrain()
	BeginShutdownDiscard()
	EndShutdownDrain()
	DrainBeforeClose() *apperr.ClassifiedError
	DrainDiscardBeforeClose() *apperr.ClassifiedError
	SetPendingClose(pending apperr.PendingClose)
	ClearPendingClose(id string)
}

// NativeConfirmation is the non-webview confirmation shown only after every
// already-started write has finished.
type NativeConfirmation func(context.Context, []string, bool) (confirmed bool, err error)

// ShutdownTimer and ShutdownClock make the ten-second deadline deterministic
// without changing the production clock.
type ShutdownTimer interface {
	Stop() bool
}

type ShutdownClock interface {
	Now() time.Time
	AfterFunc(time.Duration, func()) ShutdownTimer
}

// ShutdownOption configures one ShutdownOwner. The constructor is used by the
// composition root; value fields keep the protocol's replaceable ports in one
// public configuration shape.
type ShutdownOption struct {
	CloseRequestedEmitter func(context.Context, string)
	NativeQuit            func(context.Context)
	NativeConfirmation    NativeConfirmation
	Clock                 ShutdownClock
	Logger                *logging.Logger
}

func (option ShutdownOption) apply(owner *ShutdownOwner) {
	if option.CloseRequestedEmitter != nil {
		owner.emitCloseRequested = option.CloseRequestedEmitter
	}
	if option.NativeQuit != nil {
		owner.quit = option.NativeQuit
	}
	if option.NativeConfirmation != nil {
		owner.confirm = option.NativeConfirmation
	}
	if option.Clock != nil {
		owner.clock = option.Clock
	}
	if option.Logger != nil {
		owner.logger = option.Logger
	}
}

// WithCloseRequestedEmitter supplies the Wails event port.
func WithCloseRequestedEmitter(emit func(context.Context, string)) ShutdownOption {
	return ShutdownOption{CloseRequestedEmitter: emit}
}

// WithNativeQuit supplies the Wails quit port used after an asynchronous
// request has been authorized.
func WithNativeQuit(quit func(context.Context)) ShutdownOption {
	return ShutdownOption{NativeQuit: quit}
}

// WithNativeConfirmation supplies the native, non-webview discard prompt.
func WithNativeConfirmation(confirm NativeConfirmation) ShutdownOption {
	return ShutdownOption{NativeConfirmation: confirm}
}

// WithShutdownLogger supplies the local transition logger.
func WithShutdownLogger(logger *logging.Logger) ShutdownOption {
	return ShutdownOption{Logger: logger}
}

// ShutdownOwner owns the complete backend half of the close protocol. It does
// not know about Wails; all runtime actions arrive as injected ports.
type ShutdownOwner struct {
	mu sync.Mutex

	model              ShutdownModel
	emitCloseRequested func(context.Context, string)
	quit               func(context.Context)
	confirm            NativeConfirmation
	clock              ShutdownClock
	logger             *logging.Logger

	state          ShutdownState
	request        *CloseRequest
	requestContext context.Context
	frontendReady  bool
	permit         bool
	timer          ShutdownTimer
	sequence       uint64
	nonce          string
	previousState  ShutdownState
}

type systemShutdownClock struct{}

func (systemShutdownClock) Now() time.Time {
	return time.Now()
}

func (systemShutdownClock) AfterFunc(delay time.Duration, callback func()) ShutdownTimer {
	return time.AfterFunc(delay, callback)
}

// NewShutdownOwner creates the protocol owner. Ports can be supplied at
// construction or later with ConfigureShutdown when Wails runtime callbacks
// become available at the composition root.
func NewShutdownOwner(model ShutdownModel, options ...ShutdownOption) *ShutdownOwner {
	owner := &ShutdownOwner{
		model: model,
		clock: systemShutdownClock{},
		state: ShutdownIdle,
		nonce: shutdownNonce(),
	}
	owner.configure(options...)
	return owner
}

// ConfigureShutdown installs runtime ports without changing protocol state.
// The composition root calls this once before Wails starts.
func (owner *ShutdownOwner) ConfigureShutdown(options ...ShutdownOption) {
	owner.mu.Lock()
	defer owner.mu.Unlock()
	for _, option := range options {
		option.apply(owner)
	}
}

func (owner *ShutdownOwner) configure(options ...ShutdownOption) {
	for _, option := range options {
		option.apply(owner)
	}
}

// Snapshot returns the current protocol state without exposing mutable slices.
func (owner *ShutdownOwner) Snapshot() ShutdownSnapshot {
	owner.mu.Lock()
	defer owner.mu.Unlock()
	return ShutdownSnapshot{
		State:         owner.state,
		Request:       cloneCloseRequest(owner.request),
		FrontendReady: owner.frontendReady,
	}
}

// WindowReady records frontend hydration and discovers a request that arrived
// while the browser was still loading.
func (owner *ShutdownOwner) WindowReady(ctx context.Context) {
	owner.mu.Lock()
	owner.frontendReady = true
	if owner.request == nil || owner.state != ShutdownRequested {
		owner.mu.Unlock()
		return
	}
	owner.request.FrontendReady = true
	owner.setStateLocked(ShutdownAwaiting, "frontend became ready")
	id := owner.request.ID
	deadline := owner.request.Deadline
	owner.setPendingCloseLocked(id, apperr.PendingCloseOwnerFrontend)
	owner.mu.Unlock()
	owner.armDeadline(id, deadline)
	owner.emit(ctx, id)
}

// BeforeClose is the Wails veto hook. A permitted close is consumed exactly
// once; every other close remains vetoed until the protocol reaches Exiting.
func (owner *ShutdownOwner) BeforeClose(ctx context.Context) bool {
	if ctx == nil {
		ctx = context.Background()
	}

	owner.mu.Lock()
	if owner.permit {
		owner.permit = false
		owner.mu.Unlock()
		return false
	}
	switch owner.state {
	case ShutdownExiting:
		owner.mu.Unlock()
		return false
	case ShutdownAwaiting, ShutdownRecoveryDecision:
		id := owner.request.ID
		owner.mu.Unlock()
		owner.emit(ctx, id)
		return true
	case ShutdownRequested, ShutdownDraining, ShutdownConfirming:
		owner.mu.Unlock()
		return true
	}

	now := owner.clock.Now()
	request := &CloseRequest{
		ID:            owner.nextIDLocked(),
		State:         ShutdownRequested,
		RequestedAt:   now,
		Deadline:      now.Add(shutdownDeadline),
		FrontendReady: owner.frontendReady,
	}
	owner.request = request
	owner.requestContext = ctx
	owner.setStateLocked(ShutdownRequested, "native close requested")
	ready := owner.frontendReady
	if ready {
		request.FrontendReady = true
		owner.setStateLocked(ShutdownAwaiting, "frontend already ready")
	}
	id := request.ID
	deadline := request.Deadline
	if ready {
		owner.setPendingCloseLocked(id, apperr.PendingCloseOwnerFrontend)
	}
	owner.mu.Unlock()

	if ready {
		owner.armDeadline(id, deadline)
		owner.emit(ctx, id)
		return true
	}

	dirtyDocuments, pendingWork := owner.status()
	if len(dirtyDocuments) == 0 && !pendingWork {
		return !owner.finishImmediate(id, "clean close before frontend ready")
	}
	owner.startDrain(ctx, id, drainToConfirm, dirtyDocuments, "close before frontend ready")
	return true
}

// AuthorizeQuit accepts the frontend's clean-or-discard decision for one close
// request. The close id is checked before any drain or side effect begins.
func (owner *ShutdownOwner) AuthorizeQuit(ctx context.Context, closeID string) *apperr.ClassifiedError {
	return owner.authorize(ctx, closeID, false)
}

// AcknowledgeRecoveryClose reserves this close for the responsive recovery UI.
func (owner *ShutdownOwner) AcknowledgeRecoveryClose(_ context.Context, closeID string) *apperr.ClassifiedError {
	owner.mu.Lock()
	defer owner.mu.Unlock()
	if owner.request == nil || owner.request.ID != closeID || (owner.state != ShutdownAwaiting && owner.state != ShutdownRecoveryDecision) {
		return owner.staleCloseRefusal(closeID)
	}
	owner.stopTimerLocked()
	owner.setStateLocked(ShutdownRecoveryDecision, "recovery acknowledged close")
	return nil
}

// DiscardAndAuthorizeQuit drains without starting scheduled document writes.
func (owner *ShutdownOwner) DiscardAndAuthorizeQuit(ctx context.Context, closeID string) *apperr.ClassifiedError {
	return owner.authorize(ctx, closeID, true)
}

func (owner *ShutdownOwner) authorize(ctx context.Context, closeID string, discard bool) *apperr.ClassifiedError {
	if ctx == nil {
		ctx = context.Background()
	}
	owner.mu.Lock()
	if owner.request == nil || owner.request.ID != closeID || (owner.state != ShutdownAwaiting && owner.state != ShutdownRecoveryDecision) {
		owner.mu.Unlock()
		return owner.staleCloseRefusal(closeID)
	}
	owner.previousState = owner.state
	owner.claimDrainLocked(closeID, discard, "frontend authorized close")
	owner.mu.Unlock()
	if refusal := owner.drain(discard); refusal != nil {
		owner.finishDrainFailure(ctx, closeID, refusal, false)
		return refusal
	}
	owner.finishExit(ctx, closeID, "frontend authorized close")
	return nil
}

// CancelQuit acknowledges cancellation for the current close id.
func (owner *ShutdownOwner) CancelQuit(_ context.Context, closeID string) *apperr.ClassifiedError {
	owner.mu.Lock()
	defer owner.mu.Unlock()
	if owner.request == nil || owner.request.ID != closeID || (owner.state != ShutdownAwaiting && owner.state != ShutdownRecoveryDecision) {
		return owner.staleCloseRefusal(closeID)
	}
	owner.stopTimerLocked()
	owner.clearPendingClose(closeID)
	owner.setStateLocked(ShutdownIdle, "frontend cancelled close")
	owner.request = nil
	owner.requestContext = nil
	return nil
}

func (owner *ShutdownOwner) deadline(closeID string) {
	owner.mu.Lock()
	if owner.state != ShutdownAwaiting || owner.request == nil || owner.request.ID != closeID {
		owner.mu.Unlock()
		return
	}
	owner.claimDrainLocked(closeID, true, "close acknowledgement deadline reached")
	ctx := owner.requestContext
	owner.mu.Unlock()
	owner.emit(ctx, closeID)
	go owner.runDrain(ctx, closeID, drainToConfirm, true, true)
}

// claimDrainLocked installs the model barrier and transfers ownership atomically
// with respect to every frontend decision and native deadline.
func (owner *ShutdownOwner) claimDrainLocked(closeID string, discard bool, reason string) {
	owner.stopTimerLocked()
	owner.setStateLocked(ShutdownDraining, reason)
	owner.setPendingCloseLocked(closeID, apperr.PendingCloseOwnerNative)
	if owner.model != nil {
		if discard {
			owner.model.BeginShutdownDiscard()
		} else {
			owner.model.BeginShutdownDrain()
		}
	}
}

func (owner *ShutdownOwner) startDrain(ctx context.Context, closeID string, action drainAction, dirtyDocuments []string, reason string) {
	if ctx == nil {
		ctx = context.Background()
	}
	owner.mu.Lock()
	if owner.request == nil || owner.request.ID != closeID || owner.state != ShutdownRequested {
		owner.mu.Unlock()
		return
	}
	owner.request.DirtyDocuments = append([]string(nil), dirtyDocuments...)
	owner.claimDrainLocked(closeID, false, reason)
	owner.mu.Unlock()
	go owner.runDrain(ctx, closeID, action, false, false)
}

func (owner *ShutdownOwner) runDrain(ctx context.Context, closeID string, action drainAction, discard, conservative bool) {
	if refusal := owner.drain(discard); refusal != nil {
		owner.finishDrainFailure(ctx, closeID, refusal, true)
		return
	}
	if action == drainToExit {
		owner.finishExit(ctx, closeID, "drain completed")
		return
	}
	owner.finishConfirmation(ctx, closeID, discard, conservative)
}

func (owner *ShutdownOwner) drain(discard bool) *apperr.ClassifiedError {
	if owner.model == nil {
		return nil
	}
	if discard {
		return owner.model.DrainDiscardBeforeClose()
	}
	return owner.model.DrainBeforeClose()
}

func (owner *ShutdownOwner) finishDrainFailure(ctx context.Context, closeID string, refusal *apperr.ClassifiedError, native bool) {
	owner.mu.Lock()
	if owner.request == nil || owner.request.ID != closeID || owner.state != ShutdownDraining {
		owner.mu.Unlock()
		return
	}
	if native {
		owner.clearPendingClose(closeID)
		if owner.model != nil {
			owner.model.EndShutdownDrain()
		}
		owner.setStateLocked(ShutdownIdle, "native close drain refused: "+refusal.Message)
		owner.request = nil
		owner.requestContext = nil
		owner.mu.Unlock()
		owner.emit(ctx, closeID)
		return
	}
	owner.setPendingCloseLocked(closeID, apperr.PendingCloseOwnerFrontend)
	if owner.model != nil {
		owner.model.EndShutdownDrain()
	}
	previous := owner.previousState
	owner.setStateLocked(previous, "close drain refused: "+refusal.Message)
	owner.mu.Unlock()
	owner.emit(ctx, closeID)
}

func (owner *ShutdownOwner) finishConfirmation(ctx context.Context, closeID string, discard, conservative bool) {
	owner.mu.Lock()
	if owner.request == nil || owner.request.ID != closeID || owner.state != ShutdownDraining {
		owner.mu.Unlock()
		return
	}
	dirtyDocuments := append([]string(nil), owner.request.DirtyDocuments...)
	owner.mu.Unlock()
	current, pending := owner.status()
	owner.mu.Lock()
	if owner.request == nil || owner.request.ID != closeID || owner.state != ShutdownDraining {
		owner.mu.Unlock()
		return
	}
	if conservative || len(dirtyDocuments) == 0 {
		if conservative || len(current) > 0 || pending {
			dirtyDocuments = current
		} else {
			owner.mu.Unlock()
			owner.finishExit(ctx, closeID, "drain completed without unsaved documents")
			return
		}
	}
	owner.request.DirtyDocuments = append([]string(nil), dirtyDocuments...)
	owner.setStateLocked(ShutdownConfirming, "close drain completed")
	confirm := owner.confirm
	owner.mu.Unlock()
	if confirm == nil {
		owner.cancelAfterConfirmation(ctx, closeID, "native confirmation unavailable")
		return
	}
	confirmed, err := confirm(ctx, dirtyDocuments, conservative)
	if err != nil || !confirmed {
		owner.cancelAfterConfirmation(ctx, closeID, "native confirmation cancelled or failed")
		return
	}
	if discard && !owner.drainConfirmedDiscard(ctx, closeID) {
		return
	}
	owner.finishExit(ctx, closeID, "native confirmation accepted")
}

func (owner *ShutdownOwner) drainConfirmedDiscard(ctx context.Context, closeID string) bool {
	owner.mu.Lock()
	if owner.request == nil || owner.request.ID != closeID || owner.state != ShutdownConfirming {
		owner.mu.Unlock()
		return false
	}
	owner.setStateLocked(ShutdownDraining, "native discard confirmed")
	owner.mu.Unlock()
	if refusal := owner.drain(true); refusal != nil {
		owner.finishDrainFailure(ctx, closeID, refusal, true)
		return false
	}
	return true
}

func (owner *ShutdownOwner) cancelAfterConfirmation(ctx context.Context, closeID, reason string) {
	owner.mu.Lock()
	if owner.request == nil || owner.request.ID != closeID || owner.state != ShutdownConfirming {
		owner.mu.Unlock()
		return
	}
	owner.clearPendingClose(closeID)
	if owner.model != nil {
		owner.model.EndShutdownDrain()
	}
	owner.setStateLocked(ShutdownIdle, reason)
	owner.request = nil
	owner.requestContext = nil
	owner.mu.Unlock()
	owner.emit(ctx, closeID)
}

func (owner *ShutdownOwner) finishExit(ctx context.Context, closeID, reason string) {
	owner.mu.Lock()
	if owner.request == nil || owner.request.ID != closeID || (owner.state != ShutdownAwaiting && owner.state != ShutdownDraining && owner.state != ShutdownConfirming) {
		owner.mu.Unlock()
		return
	}
	owner.stopTimerLocked()
	owner.setStateLocked(ShutdownExiting, reason)
	owner.permit = true
	quit := owner.quit
	owner.clearPendingClose(closeID)
	owner.requestContext = nil
	owner.mu.Unlock()
	if quit != nil {
		quit(ctx)
	}
}

func (owner *ShutdownOwner) finishImmediate(closeID, reason string) bool {
	owner.mu.Lock()
	defer owner.mu.Unlock()
	if owner.request == nil || owner.request.ID != closeID || owner.state != ShutdownRequested {
		return false
	}
	owner.setStateLocked(ShutdownExiting, reason)
	return true
}

func (owner *ShutdownOwner) armDeadline(closeID string, deadline time.Time) {
	delay := deadline.Sub(owner.clock.Now())
	if delay <= 0 {
		go owner.deadline(closeID)
		return
	}
	timer := owner.clock.AfterFunc(delay, func() { owner.deadline(closeID) })
	owner.mu.Lock()
	if owner.request == nil || owner.request.ID != closeID || owner.state != ShutdownAwaiting {
		owner.mu.Unlock()
		if timer != nil {
			timer.Stop()
		}
		return
	}
	owner.timer = timer
	owner.mu.Unlock()
}

func (owner *ShutdownOwner) setPendingCloseLocked(closeID string, ownership apperr.PendingCloseOwner) {
	if owner.model != nil {
		owner.model.SetPendingClose(apperr.PendingClose{ID: closeID, Owner: ownership})
	}
}

func (owner *ShutdownOwner) clearPendingClose(closeID string) {
	if owner.model != nil {
		owner.model.ClearPendingClose(closeID)
	}
}

func (owner *ShutdownOwner) status() ([]string, bool) {
	if owner.model == nil {
		return nil, false
	}
	return owner.model.CloseStatus()
}

func (owner *ShutdownOwner) emit(ctx context.Context, closeID string) {
	owner.mu.Lock()
	emitter := owner.emitCloseRequested
	owner.mu.Unlock()
	if emitter != nil {
		emitter(ctx, closeID)
	}
}

func (owner *ShutdownOwner) staleCloseRefusal(closeID string) *apperr.ClassifiedError {
	return bridge.ClassifiedWithID(
		apperr.ClassifiedValidation,
		closeID,
		"The close request is stale and must be requested again.",
		apperr.RemediationNone,
		closeID,
	)
}

func (owner *ShutdownOwner) nextIDLocked() string {
	owner.sequence++
	return fmt.Sprintf("%s-%d", owner.nonce, owner.sequence)
}

func (owner *ShutdownOwner) setStateLocked(state ShutdownState, reason string) {
	owner.state = state
	if owner.request != nil {
		owner.request.State = state
	}
	if owner.logger != nil && owner.request != nil {
		logger := owner.logger.Zerolog()
		logger.Info().
			Str("id", owner.request.ID).
			Str("state", string(state)).
			Str("reason", reason).
			Msg("shutdown transition")
	}
}

func (owner *ShutdownOwner) stopTimerLocked() {
	if owner.timer != nil {
		owner.timer.Stop()
		owner.timer = nil
	}
}

type drainAction uint8

const (
	drainToExit drainAction = iota
	drainToConfirm
)

func cloneCloseRequest(request *CloseRequest) *CloseRequest {
	if request == nil {
		return nil
	}
	clone := *request
	clone.DirtyDocuments = append([]string(nil), request.DirtyDocuments...)
	return &clone
}

func shutdownNonce() string {
	bytes := make([]byte, 8)
	if _, err := rand.Read(bytes); err == nil {
		return hex.EncodeToString(bytes)
	}
	return fmt.Sprintf("%d", time.Now().UnixNano())
}
