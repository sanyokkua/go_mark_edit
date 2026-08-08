package appmodel

import (
	"errors"
	"sync"
	"time"
)

// RecoverySurface is the persistent UI contract after all bounded rehydration attempts fail.
type RecoverySurface struct {
	Persistent      bool
	SavedOnDisk     bool
	CommandsBlocked bool
	CloseBlocked    bool
	Message         string
	DocumentNames   []string
}

type RecoveryQuitPrompt struct {
	Authorized    bool
	DocumentNames []string
	Message       string
}

// ProjectionRecovery owns one immediate/250ms/1s projection rehydration cycle.
type ProjectionRecovery struct {
	mu          sync.Mutex
	load        func() error
	timer       layoutTimer
	attempts    int
	running     bool
	surface     RecoverySurface
	quitPending bool
	quitAllowed bool
}

func NewProjectionRecovery(load func() error, timer layoutTimer) *ProjectionRecovery {
	if timer == nil {
		timer = systemLayoutTimer{}
	}
	return &ProjectionRecovery{load: load, timer: timer}
}

func (recovery *ProjectionRecovery) Start() {
	recovery.mu.Lock()
	if recovery.running {
		recovery.mu.Unlock()
		return
	}
	recovery.running = true
	recovery.attempts = 0
	recovery.surface = RecoverySurface{}
	recovery.quitPending = false
	recovery.quitAllowed = false
	recovery.mu.Unlock()
	recovery.attempt()
}

func (recovery *ProjectionRecovery) Retry() {
	recovery.Start()
}

func (recovery *ProjectionRecovery) attempt() {
	if recovery.load == nil {
		recovery.finishFailure()
		return
	}
	err := recovery.load()
	recovery.mu.Lock()
	if err == nil {
		recovery.running = false
		recovery.attempts = 0
		recovery.surface = RecoverySurface{}
		recovery.mu.Unlock()
		return
	}
	recovery.attempts++
	attempt := recovery.attempts
	if attempt >= 3 {
		recovery.mu.Unlock()
		recovery.finishFailure()
		return
	}
	delay := 250 * time.Millisecond
	if attempt == 2 {
		delay = time.Second
	}
	recovery.mu.Unlock()
	recovery.timer.AfterFunc(delay, recovery.attempt)
}

func (recovery *ProjectionRecovery) finishFailure() {
	recovery.mu.Lock()
	defer recovery.mu.Unlock()
	recovery.running = false
	recovery.surface = RecoverySurface{
		Persistent:      true,
		SavedOnDisk:     true,
		CommandsBlocked: true,
		CloseBlocked:    true,
		Message:         "The file was saved on disk, but editor-state recovery failed.",
	}
}

func (recovery *ProjectionRecovery) Surface() RecoverySurface {
	recovery.mu.Lock()
	defer recovery.mu.Unlock()
	surface := recovery.surface
	surface.DocumentNames = append([]string(nil), surface.DocumentNames...)
	return surface
}

func (recovery *ProjectionRecovery) RequestQuitAndDiscard(documentNames []string) RecoveryQuitPrompt {
	recovery.mu.Lock()
	defer recovery.mu.Unlock()
	recovery.quitPending = true
	recovery.quitAllowed = false
	names := append([]string(nil), documentNames...)
	recovery.surface.DocumentNames = names
	return RecoveryQuitPrompt{DocumentNames: names, Message: "Confirm Quit and discard newer unsaved changes for the affected documents."}
}

func (recovery *ProjectionRecovery) ConfirmQuitAndDiscard() error {
	recovery.mu.Lock()
	defer recovery.mu.Unlock()
	if !recovery.quitPending {
		return errors.New("recovery quit confirmation is required")
	}
	recovery.quitPending = false
	recovery.quitAllowed = true
	return nil
}

func (recovery *ProjectionRecovery) QuitAndDiscardAuthorized() bool {
	recovery.mu.Lock()
	defer recovery.mu.Unlock()
	return recovery.quitAllowed
}
