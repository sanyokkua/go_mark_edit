package appmodel

import (
	"context"
	"os"
	"path/filepath"
	"strings"
	"sync/atomic"
	"testing"
	"time"
	"unicode/utf8"

	"github.com/sanyokkua/go_mark_edit/internal/apperr"
	"github.com/sanyokkua/go_mark_edit/internal/file"
)

// Proves: FR-FT-021 (partial — the backend decision cycle; the modal's title, bounds and button order are proven by ExternalChangePrompt.test.tsx)
func TestExternalConflictDecision(t *testing.T) {
	service, path, documentID := openConflictDocument(t, "base\n")
	if err := service.UpdateBuffer(context.Background(), documentID, "mine\n"); err != nil {
		t.Fatalf("edit: %v", err)
	}
	writeConflictFile(t, path, "theirs\n")

	blocked := service.Save(context.Background(), documentID, 1, "")
	if blocked.Status != apperr.WriteStatusConflict || blocked.Conflict == nil {
		t.Fatalf("Save conflict = %+v, want bounded preview", blocked)
	}
	if blocked.Conflict.OnDisk.Text != "theirs\n" || blocked.Conflict.Yours.Text != "mine\n" {
		t.Fatalf("preview = %+v", blocked.Conflict)
	}
	if got := readConflictFile(t, path); got != "theirs\n" {
		t.Fatalf("conflicting save changed disk to %q", got)
	}

	authorized := service.AuthorizeKeepMine(context.Background(), documentID, 1, path, blocked.Conflict.DetectedDiskVersion)
	if authorized.Status != apperr.ConflictStatusAuthorized || authorized.DecisionToken == "" {
		t.Fatalf("Keep mine authorization = %+v error=%+v queued=%+v path=%q", authorized, authorized.Error, service.conflicts[documentID], path)
	}
	committed := service.Save(context.Background(), documentID, 1, authorized.DecisionToken)
	if committed.Status != apperr.WriteStatusCommitted {
		t.Fatalf("authorized Save = %+v", committed)
	}
	if got := readConflictFile(t, path); got != "mine\n" {
		t.Fatalf("Keep mine disk = %q, want mine", got)
	}

	writeConflictFile(t, path, "second external\n")
	reloaded := service.CheckExternalChanges(context.Background(), documentID)
	if reloaded.Status != apperr.ConflictStatusDetected || reloaded.Preview == nil {
		t.Fatalf("second conflict = %+v", reloaded)
	}
	if result := service.ReloadFromDisk(context.Background(), documentID, 1, reloaded.Preview.DetectedDiskVersion); result.Status != apperr.ConflictStatusReloaded {
		t.Fatalf("Reload = %+v", result)
	}
	state, err := service.GetState(context.Background())
	if err != nil {
		t.Fatalf("state after reload: %v", err)
	}
	if state.ActiveBuffer == nil || state.ActiveBuffer.Content != "second external\n" || state.Snapshot.Documents[documentID].Status != string(SaveStatusSaved) {
		t.Fatalf("reloaded state = %+v", state)
	}
}

// Proves: FR-FT-020 (partial — the metadata-equal resume; the unstable re-read, foreground check and no-watcher clauses are proven by the siblings below)
func TestStableRereadMetadataEqualResumesWrite(t *testing.T) {
	service, path, documentID := openConflictDocument(t, "base\n")
	if err := service.UpdateBuffer(context.Background(), documentID, "mine\n"); err != nil {
		t.Fatalf("edit: %v", err)
	}
	info, err := os.Stat(path)
	if err != nil {
		t.Fatalf("stat: %v", err)
	}
	changed := info.ModTime().Add(2 * time.Second)
	if err := os.Chtimes(path, changed, changed); err != nil {
		t.Fatalf("touch: %v", err)
	}

	result := service.Save(context.Background(), documentID, 1, "")
	if result.Status != apperr.WriteStatusCommitted {
		t.Fatalf("metadata-equal Save = %+v", result)
	}
	if got := readConflictFile(t, path); got != "mine\n" {
		t.Fatalf("resumed Save = %q", got)
	}
	if service.conflictQueue.Len() != 0 {
		t.Fatalf("metadata-equal reread queued a conflict")
	}
}

func TestUnstableRereadWritesNothing(t *testing.T) {
	service, path, documentID := openConflictDocument(t, "base\n")
	if err := service.UpdateBuffer(context.Background(), documentID, "mine\n"); err != nil {
		t.Fatalf("edit: %v", err)
	}
	var checks atomic.Int32
	service.SetConflictReadersForTesting(
		func(string, int64) (file.StableClassifiedRead, error) {
			return file.StableClassifiedRead{Version: file.DiskVersion{Exists: true, Size: 9}, Stable: false}, file.ErrUnstableRead
		},
		func(string) (file.DiskVersion, error) {
			checks.Add(1)
			return file.DiskVersion{Exists: true, Size: 9}, nil
		},
	)

	result := service.Save(context.Background(), documentID, 1, "")
	if result.Status != apperr.WriteStatusConflict || result.Error == nil || result.Error.Category != apperr.ClassifiedConflict {
		t.Fatalf("unstable Save = %+v", result)
	}
	if got := readConflictFile(t, path); got != "base\n" {
		t.Fatalf("unstable reread wrote %q", got)
	}
	if checks.Load() != 1 {
		t.Fatalf("disk checks = %d, want one fresh check", checks.Load())
	}
}

func TestForegroundChecksOnActivationFocusAndWrite(t *testing.T) {
	service, firstPath, firstID := openConflictDocument(t, "first\n")
	secondPath := filepath.Join(t.TempDir(), "second.md")
	writeConflictFile(t, secondPath, "second\n")
	second := service.OpenPath(context.Background(), secondPath, serviceTabRevision(t, service))
	if second.Error != nil {
		t.Fatalf("open second: %+v", second)
	}
	writeConflictFile(t, secondPath, "external\n")
	activation := service.ActivateDocument(context.Background(), second.DocumentID, currentTabRevision(t, service))
	if activation.Data == nil || activation.Conflict == nil {
		t.Fatalf("activation check = %+v", activation)
	}
	if result := service.CheckExternalChanges(context.Background(), second.DocumentID); result.Status != apperr.ConflictStatusDetected {
		t.Fatalf("focus/resume check = %+v", result)
	}
	if err := service.UpdateBuffer(context.Background(), firstID, "first edit\n"); err != nil {
		t.Fatalf("first edit: %v", err)
	}
	if result := service.Save(context.Background(), firstID, 1, ""); result.Status != apperr.WriteStatusCommitted {
		t.Fatalf("pre-write check Save = %+v", result)
	}
	if got := readConflictFile(t, firstPath); got != "first edit\n" {
		t.Fatalf("first save = %q", got)
	}
}

func TestNoWatcherOrPollingTimerIsRegistered(t *testing.T) {
	service, _, documentID := openConflictDocument(t, "base\n")
	var checks atomic.Int32
	service.SetConflictReadersForTesting(nil, func(path string) (file.DiskVersion, error) {
		checks.Add(1)
		return file.CurrentDiskVersion(path)
	})
	time.Sleep(40 * time.Millisecond)
	if checks.Load() != 0 {
		t.Fatalf("background disk checks = %d", checks.Load())
	}
	if result := service.CheckExternalChanges(context.Background(), documentID); result.Status != apperr.ConflictStatusUnchanged {
		t.Fatalf("explicit foreground check = %+v", result)
	}
	if checks.Load() == 0 {
		t.Fatal("explicit foreground check did not inspect disk")
	}
}

func TestWaitingDocumentsProjectBlockedByConflict(t *testing.T) {
	service, firstPath, firstID := openConflictDocument(t, "first\n")
	secondPath := filepath.Join(t.TempDir(), "second.md")
	writeConflictFile(t, secondPath, "second\n")
	second := service.OpenPath(context.Background(), secondPath, serviceTabRevision(t, service))
	if second.Error != nil {
		t.Fatalf("open second: %+v", second)
	}
	writeConflictFile(t, firstPath, "first external\n")
	writeConflictFile(t, secondPath, "second external\n")
	firstConflict := service.CheckExternalChanges(context.Background(), firstID)
	secondConflict := service.CheckExternalChanges(context.Background(), second.DocumentID)
	if firstConflict.Preview == nil || secondConflict.Preview == nil {
		t.Fatalf("conflicts = %+v / %+v", firstConflict, secondConflict)
	}
	state, err := service.GetState(context.Background())
	if err != nil {
		t.Fatalf("state: %v", err)
	}
	if !state.Snapshot.Documents[firstID].ConflictBlocked || !state.Snapshot.Documents[second.DocumentID].ConflictBlocked {
		t.Fatalf("blocked projection = %+v", state.Snapshot.Documents)
	}
	if result := service.SkipConflict(context.Background(), firstID, 0, firstConflict.Preview.DetectedDiskVersion); result.Status != apperr.ConflictStatusSkipped {
		t.Fatalf("skip first = %+v", result)
	}
	state, _ = service.GetState(context.Background())
	if state.Snapshot.Documents[firstID].ConflictBlocked || !state.Snapshot.Documents[second.DocumentID].ConflictBlocked {
		t.Fatalf("blocked projection after skip = %+v", state.Snapshot.Documents)
	}
}

// Proves: FR-FT-022 (partial — the edit invalidator; reload, successful Save,
// successful Save As, close and path change are proved by
// TestKeepMineAuthorizationIsInvalidatedByEveryNamedEvent, and the
// second-disk-change invalidator by TestKeepMineSecondDiskChangeRefuses)
func TestKeepMineAuthorizationInvalidation(t *testing.T) {
	service, path, documentID := openConflictDocument(t, "base\n")
	if err := service.UpdateBuffer(context.Background(), documentID, "mine\n"); err != nil {
		t.Fatalf("edit: %v", err)
	}
	writeConflictFile(t, path, "external\n")
	blocked := service.Save(context.Background(), documentID, 1, "")
	authorized := service.AuthorizeKeepMine(context.Background(), documentID, 1, path, blocked.Conflict.DetectedDiskVersion)
	if authorized.DecisionToken == "" {
		t.Fatalf("authorization = %+v error=%+v queued=%+v", authorized, authorized.Error, service.conflicts[documentID])
	}
	if err := service.UpdateBuffer(context.Background(), documentID, "newer mine\n"); err != nil {
		t.Fatalf("new edit: %v", err)
	}
	if _, ok := service.keepMine[authorized.DecisionToken]; ok {
		t.Fatal("edit retained Keep-mine authorization")
	}
	stale := service.Save(context.Background(), documentID, 1, authorized.DecisionToken)
	if stale.Status != apperr.WriteStatusRefused || stale.Error == nil || stale.Error.Category != apperr.ClassifiedConflict {
		t.Fatalf("stale token Save = %+v", stale)
	}
}

// conflictedDocumentWithTwoAuthorizations puts a document into an unresolved
// external conflict and mints two Keep-mine authorizations against it.
//
// Two, not one, is what makes the "successful Save" and "successful Save As"
// arms observable at all: those writes *consume* the token they are handed, so
// a single token cannot distinguish "the write used it" from "the write
// invalidated the document's authorizations". The second token is never
// presented to anything; the requirement says the successful write must kill it
// anyway.
func conflictedDocumentWithTwoAuthorizations(t *testing.T) (service *AppModelService, path, documentID, used, spectator string) {
	t.Helper()
	service, path, documentID = openConflictDocument(t, "base\n")
	if err := service.UpdateBuffer(context.Background(), documentID, "mine\n"); err != nil {
		t.Fatalf("edit: %v", err)
	}
	writeConflictFile(t, path, "external\n")
	blocked := service.Save(context.Background(), documentID, 1, "")
	if blocked.Status != apperr.WriteStatusConflict || blocked.Conflict == nil {
		t.Fatalf("Save = %+v, want an unresolved external conflict", blocked)
	}
	first := service.AuthorizeKeepMine(context.Background(), documentID, 1, path, blocked.Conflict.DetectedDiskVersion)
	second := service.AuthorizeKeepMine(context.Background(), documentID, 1, path, blocked.Conflict.DetectedDiskVersion)
	if first.DecisionToken == "" || second.DecisionToken == "" || first.DecisionToken == second.DecisionToken {
		t.Fatalf("authorizations = %+v / %+v, want two distinct live tokens", first, second)
	}
	if count := liveKeepMineTokens(service, documentID); count != 2 {
		t.Fatalf("live Keep-mine authorizations = %d, want 2", count)
	}
	return service, path, documentID, first.DecisionToken, second.DecisionToken
}

func liveKeepMineTokens(service *AppModelService, documentID string) int {
	service.mu.RLock()
	defer service.mu.RUnlock()
	count := 0
	for _, authorization := range service.keepMine {
		if authorization.documentID == documentID {
			count++
		}
	}
	return count
}

// Proves: FR-FT-022 — the five invalidators no body asserted before T157:
// "Reload, successful Save, successful Save As, close, path change … MUST
// invalidate a Keep-mine authorization". The edit and second-disk-change arms
// are proved by the two siblings above; authorization use is proved by
// TestExternalConflictDecision, which spends a token and then observes the
// conflict resolved.
//
// A Keep-mine authorization is a standing licence to overwrite a specific set
// of bytes on disk. Every event here changes what is on disk, or which file the
// document points at, or removes the document entirely — so a surviving licence
// would authorize a write against a comparison the user never saw.
func TestKeepMineAuthorizationIsInvalidatedByEveryNamedEvent(t *testing.T) {
	t.Run("reload from disk", func(t *testing.T) {
		service, path, documentID, used, spectator := conflictedDocumentWithTwoAuthorizations(t)
		detected := service.CheckExternalChanges(context.Background(), documentID)
		if detected.Status != apperr.ConflictStatusDetected || detected.Preview == nil {
			t.Fatalf("CheckExternalChanges = %+v, want the queued conflict", detected)
		}
		reloaded := service.ReloadFromDisk(context.Background(), documentID, 1, detected.Preview.DetectedDiskVersion)
		if reloaded.Status != apperr.ConflictStatusReloaded {
			t.Fatalf("ReloadFromDisk = %+v, want a reload", reloaded)
		}
		assertKeepMineTokensDead(t, service, documentID, used, spectator)
		assertStaleKeepMineBuysNothing(t, service, path, documentID, used, spectator)
	})

	t.Run("successful Save", func(t *testing.T) {
		service, path, documentID, used, spectator := conflictedDocumentWithTwoAuthorizations(t)
		committed := service.Save(context.Background(), documentID, 1, used)
		if committed.Status != apperr.WriteStatusCommitted {
			t.Fatalf("authorized Save = %+v, want committed", committed)
		}
		if got := readConflictFile(t, path); got != "mine\n" {
			t.Fatalf("disk after the authorized Save = %q", got)
		}
		assertKeepMineTokensDead(t, service, documentID, used, spectator)
		assertStaleKeepMineBuysNothing(t, service, path, documentID, used, spectator)
	})

	t.Run("successful Save As, and the path change it makes", func(t *testing.T) {
		service, path, documentID, used, spectator := conflictedDocumentWithTwoAuthorizations(t)
		target := filepath.Join(t.TempDir(), "adopted.md")
		service.SetDocumentSaveDialog(&saveDialogFixture{path: target, confirm: true})

		committed := service.SaveAs(context.Background(), documentID, 1, used)
		if committed.Status != apperr.WriteStatusCommitted || committed.Data == nil || !committed.Data.TargetPathAdopted {
			t.Fatalf("authorized Save As = %+v, want a committed write that adopts the new path", committed)
		}
		state, err := service.GetState(context.Background())
		if err != nil {
			t.Fatalf("GetState after Save As: %v", err)
		}
		if adopted := state.Snapshot.Documents[documentID].Path; adopted == path {
			t.Fatalf("document path = %q, want the adopted Save As target rather than the original", adopted)
		}
		assertKeepMineTokensDead(t, service, documentID, used, spectator)
		assertStaleKeepMineBuysNothing(t, service, target, documentID, used, spectator)
	})

	t.Run("close", func(t *testing.T) {
		service, _, documentID, used, spectator := conflictedDocumentWithTwoAuthorizations(t)
		state, err := service.GetState(context.Background())
		if err != nil {
			t.Fatalf("GetState before the close plan: %v", err)
		}
		plan := service.PrepareClose(context.Background(), apperr.ClosePlanSingle, []string{documentID}, state.Snapshot.TabSetRevision)
		if plan.Error != nil || plan.Data == nil {
			t.Fatalf("PrepareClose = %+v", plan)
		}
		resolved := service.ResolveClosePlan(context.Background(), plan.Data.ID, []apperr.ClosePlanDecision{{DocumentID: documentID, Choice: apperr.CloseChoiceDiscard}})
		if resolved.Error != nil || resolved.Data == nil || resolved.Data.Status != apperr.ClosePlanReady {
			t.Fatalf("ResolveClosePlan = %+v, want a ready discard", resolved)
		}
		if executed := service.ExecuteClosePlan(context.Background(), plan.Data.ID); executed.Error != nil {
			t.Fatalf("ExecuteClosePlan = %+v", executed)
		}
		if state, err = service.GetState(context.Background()); err != nil {
			t.Fatalf("GetState after the close: %v", err)
		}
		if _, stillOpen := state.Snapshot.Documents[documentID]; stillOpen {
			t.Fatalf("document %q survived the discard close", documentID)
		}
		assertKeepMineTokensDead(t, service, documentID, used, spectator)
	})
}

// assertKeepMineTokensDead checks the authorization table: neither token may
// survive the invalidating event.
func assertKeepMineTokensDead(t *testing.T, service *AppModelService, documentID string, tokens ...string) {
	t.Helper()
	if count := liveKeepMineTokens(service, documentID); count != 0 {
		t.Fatalf("live Keep-mine authorizations = %d, want none after the invalidating event", count)
	}
	for _, token := range tokens {
		service.mu.RLock()
		_, present := service.keepMine[token]
		service.mu.RUnlock()
		if present {
			t.Fatalf("token %q survived the invalidating event", token)
		}
	}
}

// assertStaleKeepMineBuysNothing checks the consequence, which is the half that
// matters: after the invalidating event a *new* external change appears, and
// presenting the dead token must not overwrite it. An authorization that merely
// vanishes from a map while the write path still honours it would satisfy the
// table check above and none of the requirement.
func assertStaleKeepMineBuysNothing(t *testing.T, service *AppModelService, path, documentID string, tokens ...string) {
	t.Helper()
	for index, token := range tokens {
		external := "changed after the invalidating event " + string(rune('a'+index)) + "\n"
		writeConflictFile(t, path, external)
		result := service.Save(context.Background(), documentID, 1, token)
		if result.Status == apperr.WriteStatusCommitted {
			t.Fatalf("a Save presenting the invalidated token %q overwrote an unseen external change: %+v", token, result)
		}
		if got := readConflictFile(t, path); got != external {
			t.Fatalf("disk after the refused Save = %q, want the external change intact", got)
		}
	}
}

func TestKeepMineSecondDiskChangeRefuses(t *testing.T) {
	service, path, documentID := openConflictDocument(t, "base\n")
	if err := service.UpdateBuffer(context.Background(), documentID, "mine\n"); err != nil {
		t.Fatalf("edit: %v", err)
	}
	writeConflictFile(t, path, "first external\n")
	blocked := service.Save(context.Background(), documentID, 1, "")
	authorized := service.AuthorizeKeepMine(context.Background(), documentID, 1, blocked.Conflict.Path, blocked.Conflict.DetectedDiskVersion)
	if authorized.DecisionToken == "" {
		t.Fatalf("authorization = %+v", authorized)
	}
	writeConflictFile(t, path, "second external\n")
	result := service.Save(context.Background(), documentID, 1, authorized.DecisionToken)
	if result.Status != apperr.WriteStatusConflict || result.Error == nil || result.Error.Category != apperr.ClassifiedConflict {
		t.Fatalf("second-change Save = %+v", result)
	}
	if got := readConflictFile(t, path); got != "second external\n" {
		t.Fatalf("second-change Save changed disk to %q", got)
	}
}

func TestSkipCancelsOneWrite(t *testing.T) {
	service, path, documentID := openConflictDocument(t, "base\n")
	if err := service.UpdateBuffer(context.Background(), documentID, "mine\n"); err != nil {
		t.Fatalf("edit: %v", err)
	}
	writeConflictFile(t, path, "external\n")
	blocked := service.Save(context.Background(), documentID, 1, "")
	if result := service.SkipConflict(context.Background(), documentID, 1, blocked.Conflict.DetectedDiskVersion); result.Status != apperr.ConflictStatusSkipped {
		t.Fatalf("Skip = %+v", result)
	}
	if got := readConflictFile(t, path); got != "external\n" {
		t.Fatalf("Skip changed disk to %q", got)
	}
	again := service.Save(context.Background(), documentID, 1, "")
	if again.Status != apperr.WriteStatusConflict || again.Conflict == nil {
		t.Fatalf("next Save = %+v, want fresh conflict", again)
	}
}

// Proves: FR-FT-023
func TestMissingBackingFileDetaches(t *testing.T) {
	service, path, documentID := openConflictDocument(t, "base\n")
	if err := service.UpdateBuffer(context.Background(), documentID, "recreate\n"); err != nil {
		t.Fatalf("edit: %v", err)
	}
	if err := os.Remove(path); err != nil {
		t.Fatalf("remove backing file: %v", err)
	}
	result := service.CheckExternalChanges(context.Background(), documentID)
	if result.Status != apperr.ConflictStatusDetached {
		t.Fatalf("missing check = %+v", result)
	}
	state, err := service.GetState(context.Background())
	if err != nil {
		t.Fatalf("state: %v", err)
	}
	metadata := state.Snapshot.Documents[documentID]
	if !metadata.Detached || !metadata.Dirty || metadata.Path == "" || state.ActiveBuffer == nil || state.ActiveBuffer.Content != "recreate\n" {
		t.Fatalf("detached state = %+v / %+v", metadata, state.ActiveBuffer)
	}
	if saved := service.Save(context.Background(), documentID, 1, ""); saved.Status != apperr.WriteStatusCommitted {
		t.Fatalf("recreate Save = %+v", saved)
	}
	if got := readConflictFile(t, path); got != "recreate\n" {
		t.Fatalf("recreated file = %q", got)
	}
}

func TestConflictPreviewBoundsNeverSplitUTF8(t *testing.T) {
	content := ""
	for index := 0; index < 20; index++ {
		content += "界" + string(rune('a'+index)) + "\n"
	}
	content += "尾" + string(make([]byte, 5000))
	side := boundedConflictSide(content)
	if !side.Truncated || side.LineCount > maxConflictPreviewLines || side.ByteCount > maxConflictPreviewBytes || !utf8.ValidString(side.Text) {
		t.Fatalf("bounded side = %+v, valid=%t", side, utf8.ValidString(side.Text))
	}
}

func TestReadOnlyConflictOffersReloadAndCancelOnly(t *testing.T) {
	service, path, documentID := openConflictDocument(t, "safe\n")
	service.mu.Lock()
	document := service.state.documents[documentID]
	document.metadata.Capability = string(file.CapabilityUnsafeReadOnly)
	document.baselineCharacteristics.Capability = file.CapabilityWritable
	service.mu.Unlock()
	writeConflictFile(t, path, "external\n")
	result := service.CheckExternalChanges(context.Background(), documentID)
	if result.Status != apperr.ConflictStatusDetected || result.Preview == nil || !result.Preview.ReadOnly {
		t.Fatalf("read-only conflict = %+v", result)
	}
	if skipped := service.SkipConflict(context.Background(), documentID, 0, result.Preview.DetectedDiskVersion); skipped.Status != apperr.ConflictStatusRefused {
		t.Fatalf("read-only Skip = %+v", skipped)
	}
	if cancelled := service.CancelConflict(context.Background(), documentID, 0, result.Preview.DetectedDiskVersion); cancelled.Status != apperr.ConflictStatusCancelled {
		t.Fatalf("read-only Cancel = %+v", cancelled)
	}
}

func openConflictDocument(t *testing.T, content string) (*AppModelService, string, string) {
	t.Helper()
	path := filepath.Join(t.TempDir(), "document.md")
	writeConflictFile(t, path, content)
	service := NewAppModelService(&recordingEmitter{})
	opened := service.OpenPath(context.Background(), path, 0)
	if opened.Error != nil || opened.DocumentID == "" {
		t.Fatalf("open %q = %+v", path, opened)
	}
	return service, path, opened.DocumentID
}

func writeConflictFile(t *testing.T, path, content string) {
	t.Helper()
	if err := os.WriteFile(path, []byte(content), 0o640); err != nil {
		t.Fatalf("write %q: %v", path, err)
	}
}

func readConflictFile(t *testing.T, path string) string {
	t.Helper()
	data, err := os.ReadFile(path)
	if err != nil {
		t.Fatalf("read %q: %v", path, err)
	}
	return string(data)
}

func serviceTabRevision(t *testing.T, service *AppModelService) uint64 {
	t.Helper()
	state, err := service.GetState(context.Background())
	if err != nil {
		t.Fatalf("state: %v", err)
	}
	return state.Snapshot.TabSetRevision
}

func currentTabRevision(t *testing.T, service *AppModelService) uint64 {
	return serviceTabRevision(t, service)
}

// Proves: FR-FT-021 — the clause that the conflict prompt "visibly identify
// which side is truncated", which requires the reported count to describe the
// text actually shown. The 12-line cap, the 4,096-byte cap and the
// no-split-code-point rule are proved by TestConflictPreviewBoundsNeverSplitUTF8
// and are unchanged.
//
// The budget-exhaustion branch returned lineCount+1 unconditionally. When the
// byte budget lands exactly on a line boundary the inner rune guard breaks
// before writing any byte of the next line, so the count claimed a line the
// text does not contain.
func TestConflictPreviewCountsOnlyTheLinesItActuallyRendered(t *testing.T) {
	// Four 1,024-byte lines exhaust the 4,096-byte budget exactly, well inside
	// the 12-line cap, so the fifth line is reached with a remaining budget of 0.
	const lineLength = 1024
	content := strings.Repeat(strings.Repeat("a", lineLength-1)+"\n", 4) + "fifth line\n"

	side := boundedConflictSide(content)

	rendered := strings.Count(side.Text, "\n")
	if !side.Truncated {
		t.Fatalf("side.Truncated = false, want a truncated side for %d bytes of input", len(content))
	}
	if side.ByteCount != maxConflictPreviewBytes {
		t.Fatalf("side.ByteCount = %d, want the exhausted budget %d", side.ByteCount, maxConflictPreviewBytes)
	}
	if side.LineCount != rendered {
		t.Fatalf("side.LineCount = %d but Text contains %d lines: the prompt would name a line the reader cannot see", side.LineCount, rendered)
	}
}

// Proves: FR-FT-021 — the same accurate-count clause, for the case where the
// budget runs out part-way through a line rather than exactly on its boundary.
// That partially rendered line is visible, so it must still be counted; this
// pins the fix to the zero-bytes-written case and stops it over-correcting.
func TestConflictPreviewStillCountsAPartiallyRenderedLine(t *testing.T) {
	const lineLength = 1024
	content := strings.Repeat(strings.Repeat("a", lineLength-1)+"\n", 3) + strings.Repeat("b", 2000) + "\n"

	side := boundedConflictSide(content)

	if !side.Truncated || side.ByteCount != maxConflictPreviewBytes {
		t.Fatalf("side = %+v, want a truncated side that used the whole budget", side)
	}
	if side.LineCount != 4 {
		t.Fatalf("side.LineCount = %d, want 4: three whole lines plus the partly rendered fourth", side.LineCount)
	}
}
