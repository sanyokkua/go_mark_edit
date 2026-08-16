package appmodel

import (
	"context"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"testing"

	"github.com/sanyokkua/go_mark_edit/internal/apperr"
	"github.com/sanyokkua/go_mark_edit/internal/file"
)

type saveDialogFixture struct {
	path            string
	confirm         bool
	chooseCalls     int
	confirmCalls    int
	mutateOnConfirm func(string)
}

func (dialog *saveDialogFixture) ChooseSaveFile(_ context.Context, _ SaveDialogRequest) (string, error) {
	dialog.chooseCalls++
	return dialog.path, nil
}

func (dialog *saveDialogFixture) ConfirmOverwrite(_ context.Context, subject string) (bool, error) {
	dialog.confirmCalls++
	if dialog.mutateOnConfirm != nil {
		dialog.mutateOnConfirm(subject)
	}
	return dialog.confirm, nil
}

func newSaveDocument(t *testing.T, service *AppModelService, content string) string {
	t.Helper()
	state, err := service.GetState(context.Background())
	if err != nil {
		t.Fatalf("state before New: %v", err)
	}
	created := service.NewDocument(context.Background(), state.Snapshot.TabSetRevision)
	if created.Data == nil {
		t.Fatalf("New result = %+v", created)
	}
	if err := service.UpdateBuffer(context.Background(), created.Data.DocumentID, content); err != nil {
		t.Fatalf("UpdateBuffer: %v", err)
	}
	return created.Data.DocumentID
}

// Proves: FR-FT-012 (partial — the Save-As fallback and the .md append; the
// unsupported-suffix rejection is proved by the sibling below)
func TestSaveAndSaveAs(t *testing.T) {
	target := filepath.Join(t.TempDir(), "Untitled")
	dialog := &saveDialogFixture{path: target, confirm: true}
	service := NewEmptyAppModelService(&recordingEmitter{})
	service.SetDocumentSaveDialog(dialog)
	documentID := newSaveDocument(t, service, "# saved\n")

	result := service.Save(context.Background(), documentID, 1, "")
	if result.Status != apperr.WriteStatusCommitted || result.Data == nil || !result.Data.TargetPathAdopted {
		t.Fatalf("Save result = %+v, want committed adopted path", result)
	}
	if dialog.chooseCalls != 1 || dialog.confirmCalls != 0 {
		t.Fatalf("Save dialog calls = choose %d confirm %d, want Save As choice without overwrite", dialog.chooseCalls, dialog.confirmCalls)
	}
	if filepath.Ext(result.Data.TargetPath) != ".md" {
		t.Fatalf("Save adopted target = %q, want .md suffix", result.Data.TargetPath)
	}
	bytes, err := os.ReadFile(result.Data.TargetPath)
	if err != nil || string(bytes) != "# saved\n" {
		t.Fatalf("saved bytes = %q/%v", bytes, err)
	}
	state, err := service.GetState(context.Background())
	if err != nil {
		t.Fatalf("state after Save: %v", err)
	}
	document := state.Snapshot.Documents[documentID]
	if document.Path != result.Data.TargetPath || document.Dirty || document.Status != string(SaveStatusSaved) {
		t.Fatalf("saved metadata = %+v, want adopted clean saved document", document)
	}
}

// Proves: FR-FT-012 — the clause that Save As "MUST … reject an unsupported
// suffix before writing", which `file.IsSupportedDocumentSuffix`'s own unit
// test could not reach: that test proves the predicate, not that Save As
// consults it, nor that the refusal precedes the disk.
//
// "Before writing" is asserted three ways, because a refusal that arrives after
// the native overwrite prompt has already been shown, or after a temporary file
// has been created beside the target, is not a refusal before the write: the
// overwrite confirmer must not have been called, no file may appear at the
// selected path, and no entry may be left in the target-reservation table.
func TestSaveAsRefusesAnUnsupportedSuffixBeforeWriting(t *testing.T) {
	root := t.TempDir()
	for _, name := range []string{"notes.rtf", "notes.docx", "notes.md.exe"} {
		t.Run(name, func(t *testing.T) {
			target := filepath.Join(root, name)
			dialog := &saveDialogFixture{path: target, confirm: true}
			service := NewEmptyAppModelService(&recordingEmitter{})
			service.SetDocumentSaveDialog(dialog)
			documentID := newSaveDocument(t, service, "# rejected\n")

			result := service.SaveAs(context.Background(), documentID, 1, "")

			if result.Status != apperr.WriteStatusRefused {
				t.Fatalf("Save As to %q = %q, want %q", name, result.Status, apperr.WriteStatusRefused)
			}
			if result.Error == nil || result.Error.Category != apperr.ClassifiedUnsupportedInput {
				t.Fatalf("Save As refusal = %+v, want an unsupported-input classification", result.Error)
			}
			if dialog.confirmCalls != 0 {
				t.Fatalf("overwrite confirmations = %d, want none: the suffix must be rejected before the write is prepared", dialog.confirmCalls)
			}
			if _, err := os.Stat(target); !os.IsNotExist(err) {
				t.Fatalf("stat %q after the refusal = %v, want the file never to have been created", target, err)
			}
			entries, err := os.ReadDir(filepath.Dir(target))
			if err != nil {
				t.Fatalf("read target directory: %v", err)
			}
			for _, entry := range entries {
				if entry.Name() == name || strings.HasPrefix(entry.Name(), name+".") {
					t.Fatalf("the refused Save As left %q beside the target", entry.Name())
				}
			}
			if len(service.saveReservations) != 0 {
				t.Fatalf("save reservations after the refusal = %d, want none", len(service.saveReservations))
			}
			state, err := service.GetState(context.Background())
			if err != nil {
				t.Fatalf("GetState after the refusal: %v", err)
			}
			if document := state.Snapshot.Documents[documentID]; document.Path != "" || !document.Dirty {
				t.Fatalf("document after the refusal = %+v, want an unadopted path and unsaved content", document)
			}
		})
	}
}

// Proves: FR-FT-011 (partial — the single-use authorization; the prompt's copy and focus are proven by NormalizationPrompt.test.tsx)
func TestMixedEndingAuthorization(t *testing.T) {
	root := t.TempDir()
	path := filepath.Join(root, "mixed.md")
	if err := os.WriteFile(path, []byte("one\ntwo\r\n"), 0o640); err != nil {
		t.Fatalf("write mixed fixture: %v", err)
	}
	service := NewEmptyAppModelService(&recordingEmitter{})
	opened := service.OpenPath(context.Background(), path, 0)
	if opened.ActiveBuffer == nil {
		t.Fatalf("Open result = %+v", opened)
	}
	if err := service.UpdateBuffer(context.Background(), opened.DocumentID, "edited\ncontent\n"); err != nil {
		t.Fatalf("UpdateBuffer: %v", err)
	}
	blocked := service.Save(context.Background(), opened.DocumentID, 1, "")
	if blocked.Status != apperr.WriteStatusNeedsNormalization || blocked.DecisionToken == "" || blocked.ProposedEnding != "lf" {
		t.Fatalf("mixed Save = %+v, want one LF authorization", blocked)
	}
	if result := service.Save(context.Background(), opened.DocumentID, 1, blocked.DecisionToken); result.Status != apperr.WriteStatusCommitted {
		t.Fatalf("authorized mixed Save = %+v, want committed", result)
	}
	if len(service.normalizations) != 0 {
		t.Fatalf("normalization authorizations = %d, want consumed after commit", len(service.normalizations))
	}
	state, err := service.GetState(context.Background())
	if err != nil {
		t.Fatalf("state after mixed Save: %v", err)
	}
	if got := state.Snapshot.Documents[opened.DocumentID].LineEnding; got != "lf" {
		t.Fatalf("normalized line ending = %q, want lf", got)
	}
}

// Proves: FR-FT-013
func TestSaveAsCollisionAndTargetDrift(t *testing.T) {
	root := t.TempDir()
	sourcePath := filepath.Join(root, "source.md")
	targetPath := filepath.Join(root, "target.md")
	if err := os.WriteFile(sourcePath, []byte("source"), 0o644); err != nil {
		t.Fatalf("write source: %v", err)
	}
	if err := os.WriteFile(targetPath, []byte("target"), 0o644); err != nil {
		t.Fatalf("write target: %v", err)
	}
	service := NewEmptyAppModelService(&recordingEmitter{})
	opened := service.OpenPath(context.Background(), sourcePath, 0)
	dialog := &saveDialogFixture{path: targetPath, confirm: true}
	service.SetDocumentSaveDialog(dialog)
	if result := service.SaveAs(context.Background(), opened.DocumentID, 0, ""); result.Status != apperr.WriteStatusCommitted {
		t.Fatalf("Save As overwrite = %+v, want committed", result)
	}
	if dialog.confirmCalls != 1 {
		t.Fatalf("overwrite prompts = %d, want exactly one", dialog.confirmCalls)
	}

	other := newSaveDocument(t, service, "other")
	secondTarget := filepath.Join(root, "second.md")
	if err := os.WriteFile(secondTarget, []byte("before"), 0o644); err != nil {
		t.Fatalf("write second target: %v", err)
	}
	dialog.path = secondTarget
	dialog.confirm = true
	dialog.mutateOnConfirm = func(string) {
		_ = os.WriteFile(secondTarget, []byte("changed"), 0o644)
	}
	result := service.SaveAs(context.Background(), other, 1, "")
	if result.Status != apperr.WriteStatusCommitted {
		t.Fatalf("post-confirmation version change = %+v, want stable capture then commit", result)
	}

	third := newSaveDocument(t, service, "third")
	thirdTarget := filepath.Join(root, "third.md")
	if err := os.WriteFile(thirdTarget, []byte("hash-before"), 0o644); err != nil {
		t.Fatalf("write third target: %v", err)
	}
	dialog.path = thirdTarget
	dialog.mutateOnConfirm = nil
	service.SetBeforeSaveAsRecheck(func(path string) {
		// Preserve size and mode while changing bytes; the save recheck must use the raw hash.
		_ = os.WriteFile(thirdTarget, []byte("hash-after!"), 0o644)
		_ = path
	})
	result = service.SaveAs(context.Background(), third, 1, "")
	if result.Status != apperr.WriteStatusConflict || result.Error == nil || result.Error.Category != apperr.ClassifiedConflict {
		t.Fatalf("raw-byte drift = %+v, want classified conflict", result)
	}
	if dialog.confirmCalls < 3 {
		t.Fatalf("overwrite prompts after drift = %d, want no second prompt in one attempt", dialog.confirmCalls)
	}
}

func TestSaveAsRawByteHashRecheck(t *testing.T) {
	root := t.TempDir()
	sourcePath := filepath.Join(root, "source.md")
	targetPath := filepath.Join(root, "target.md")
	if err := os.WriteFile(sourcePath, []byte("source"), 0o644); err != nil {
		t.Fatalf("write source: %v", err)
	}
	if err := os.WriteFile(targetPath, []byte("123456"), 0o644); err != nil {
		t.Fatalf("write target: %v", err)
	}
	service := NewEmptyAppModelService(&recordingEmitter{})
	opened := service.OpenPath(context.Background(), sourcePath, 0)
	dialog := &saveDialogFixture{path: targetPath, confirm: true}
	service.SetDocumentSaveDialog(dialog)
	service.SetBeforeSaveAsRecheck(func(path string) {
		_ = os.WriteFile(path, []byte("654321"), 0o644)
	})
	result := service.SaveAs(context.Background(), opened.DocumentID, 0, "")
	if result.Status != apperr.WriteStatusConflict || result.Error == nil || result.Error.Category != apperr.ClassifiedConflict {
		t.Fatalf("raw hash recheck = %+v, want conflict", result)
	}
	bytes, err := os.ReadFile(targetPath)
	if err != nil || strings.TrimSpace(string(bytes)) != "654321" {
		t.Fatalf("target bytes after hash conflict = %q/%v", bytes, err)
	}
}

func TestSaveAsTargetReservationReleasedOnEveryTerminalOutcome(t *testing.T) {
	root := t.TempDir()
	sourcePath := filepath.Join(root, "source.md")
	if err := os.WriteFile(sourcePath, []byte("source"), 0o644); err != nil {
		t.Fatalf("write source: %v", err)
	}
	service := NewEmptyAppModelService(&recordingEmitter{})
	opened := service.OpenPath(context.Background(), sourcePath, 0)
	dialog := &saveDialogFixture{path: filepath.Join(root, "cancel.md"), confirm: false}
	if err := os.WriteFile(dialog.path, []byte("existing"), 0o644); err != nil {
		t.Fatalf("write cancellation target: %v", err)
	}
	service.SetDocumentSaveDialog(dialog)
	if result := service.SaveAs(context.Background(), opened.DocumentID, 0, ""); result.Status != apperr.WriteStatusCancelled || len(service.saveReservations) != 0 {
		t.Fatalf("cancel result/reservations = %+v/%d", result, len(service.saveReservations))
	}
	dialog.path = filepath.Join(root, "failure.md")
	service.SetBeforeSaveAsRecheck(func(string) { panic("injected failure") })
	if result := service.SaveAs(context.Background(), opened.DocumentID, 0, ""); result.Status != apperr.WriteStatusRefused || len(service.saveReservations) != 0 {
		t.Fatalf("failure result/reservations = %+v/%d", result, len(service.saveReservations))
	}
}

func TestSaveUsesStableDocumentIdentity(t *testing.T) {
	service := NewEmptyAppModelService(&recordingEmitter{})
	documentID := newSaveDocument(t, service, "stable")
	path := filepath.Join(t.TempDir(), "stable.md")
	dialog := &saveDialogFixture{path: path, confirm: true}
	service.SetDocumentSaveDialog(dialog)
	result := service.SaveAs(context.Background(), documentID, 1, "")
	if result.Data == nil || result.Data.DocumentID != documentID {
		t.Fatalf("Save As identity = %+v, want %q", result.Data, documentID)
	}
	if _, err := file.CurrentDiskVersion(path); err != nil {
		t.Fatalf("target disk version: %v", err)
	}
}

// Proves: FR-FT-006 (partial — the pre-disk write refusal. Save, Save As,
// format and lint unavailability are proved by actionRegistry.test.ts and
// actionDispatcher.test.ts; editing is unbuilt and filed as T178.)
// Proves: FR-FT-035
func TestRefusedWriteNamesTheFileNotTheDocumentID(t *testing.T) {
	/*
	 * The classified error contract requires every message to "name only the safe
	 * basename or the document's shortest-unique disambiguated tab label", and the
	 * frontend renders `error.safeSubject` as the notification title
	 * (`classifiedNotification.ts:63`). `refusedWrite` passed `documentID` as the
	 * subject, and `NewClassifiedError`'s `filepath.Base` is a no-op on a minted
	 * id, so the title was `doc-0000000000000003`.
	 *
	 * It was invisible until T117: the write path went through `notifyError`,
	 * whose `localizedErrorCopy` replaced the title with catalogue copy. Now that
	 * the backend's own title survives, the synthetic id reaches the user.
	 */
	document := &openDocument{metadata: apperr.DocumentMetadata{DocumentID: mintDocumentID(), Path: "/repo/notes/release-notes.md", DisplayName: "release-notes.md", Capability: string(file.CapabilityUnsafeReadOnly)}, content: "content", baseline: "old"}
	service := NewEmptyAppModelService(&recordingEmitter{})
	service.state.documents[document.metadata.DocumentID] = document
	service.state.orderedDocumentIDs = []string{document.metadata.DocumentID}
	service.state.activeDocumentID = document.metadata.DocumentID

	result := service.Save(context.Background(), document.metadata.DocumentID, 0, "")
	if result.Error == nil {
		t.Fatalf("read-only Save = %+v, want a refusal", result)
	}
	if result.Error.SafeSubject != "release-notes.md" {
		t.Fatalf("refusal names %q, want the safe basename release-notes.md", result.Error.SafeSubject)
	}
	if strings.HasPrefix(result.Error.SafeSubject, "doc-") {
		t.Fatalf("refusal leaked the internal document id %q to the user", result.Error.SafeSubject)
	}
}

// Proves: FR-FT-035
func TestRefusedWriteFallsBackToUntitledForAPathlessDocument(t *testing.T) {
	// An untitled document has no basename to show. It must still not show the id.
	document := &openDocument{metadata: apperr.DocumentMetadata{DocumentID: mintDocumentID(), Title: "Untitled", Capability: string(file.CapabilityUnsafeReadOnly)}, content: "content", baseline: "old"}
	service := NewEmptyAppModelService(&recordingEmitter{})
	service.state.documents[document.metadata.DocumentID] = document
	service.state.orderedDocumentIDs = []string{document.metadata.DocumentID}
	service.state.activeDocumentID = document.metadata.DocumentID

	result := service.Save(context.Background(), document.metadata.DocumentID, 0, "")
	if result.Error == nil {
		t.Fatalf("read-only Save = %+v, want a refusal", result)
	}
	if result.Error.SafeSubject != "Untitled" {
		t.Fatalf("pathless refusal names %q, want Untitled", result.Error.SafeSubject)
	}
}

func TestSaveValidationRefusesReadOnlyBeforeDiskAccess(t *testing.T) {
	document := &openDocument{metadata: apperr.DocumentMetadata{DocumentID: "read-only", Path: "/missing/file.md", Capability: string(file.CapabilityUnsafeReadOnly)}, content: "content", baseline: "old"}
	service := NewEmptyAppModelService(&recordingEmitter{})
	service.state.documents[document.metadata.DocumentID] = document
	service.state.orderedDocumentIDs = []string{document.metadata.DocumentID}
	service.state.activeDocumentID = document.metadata.DocumentID
	result := service.Save(context.Background(), document.metadata.DocumentID, 0, "")
	if result.Status != apperr.WriteStatusRefused || result.Error == nil || result.Error.Category != apperr.ClassifiedPermissionDenied {
		t.Fatalf("read-only Save = %+v, want pre-I/O permission refusal", result)
	}
}

// countingDiskReaders records how often the two disk seams behind
// prepareWriteDisk are reached, while still returning what the real host would.
type countingDiskReaders struct {
	mu              sync.Mutex
	diskVersionHits int
	stableReadHits  int
}

func (readers *countingDiskReaders) version(path string) (file.DiskVersion, error) {
	readers.mu.Lock()
	readers.diskVersionHits++
	readers.mu.Unlock()
	return file.CurrentDiskVersion(path)
}

func (readers *countingDiskReaders) stable(path string, limit int64) (file.StableClassifiedRead, error) {
	readers.mu.Lock()
	readers.stableReadHits++
	readers.mu.Unlock()
	return file.ReadClassifiedStable(path, limit)
}

func (readers *countingDiskReaders) total() (int, int) {
	readers.mu.Lock()
	defer readers.mu.Unlock()
	return readers.diskVersionHits, readers.stableReadHits
}

func normalizationTokenCount(service *AppModelService) int {
	service.mu.RLock()
	defer service.mu.RUnlock()
	return len(service.normalizations)
}

// Proves: FR-FT-011 — the clause that manual Save "MUST refuse before disk
// access without matching authorization". The Save As, autosave and close-save
// arms of the same requirement are proved elsewhere.
//
// Save ran flushAutosave and then prepareWriteDisk — which stats the file and can
// perform a full stable re-read through inspectDocument — and only reached the
// mixed-line-ending authorization inside snapshotForWrite afterwards. SaveAs
// already gated first; this asserts Save does too, by counting the disk seams
// rather than by inspecting the refusal, because the refusal was already correct.
func TestSaveRefusesMixedEndingsBeforeTouchingTheDisk(t *testing.T) {
	service := NewAppModelService(&recordingEmitter{})
	service.SetAutosaveEnabled(false)
	_, documentID := writeMixedDocument(t, service, "first\r\nsecond\nthird\n")

	readers := &countingDiskReaders{}
	service.SetConflictReadersForTesting(readers.stable, readers.version)

	state, err := service.GetState(context.Background())
	if err != nil {
		t.Fatalf("GetState: %v", err)
	}
	revision := state.Snapshot.Documents[documentID].ContentRevision

	// An empty decision token is the unauthorized case: nothing in
	// service.normalizations can match it.
	result := service.Save(context.Background(), documentID, revision, "")

	if result.Status != apperr.WriteStatusNeedsNormalization {
		t.Fatalf("Save status = %q, want %q", result.Status, apperr.WriteStatusNeedsNormalization)
	}
	versionHits, stableHits := readers.total()
	if versionHits != 0 || stableHits != 0 {
		t.Fatalf("unauthorized Save reached the disk: %d disk-version reads and %d stable reads, want 0 and 0", versionHits, stableHits)
	}
}

// Proves: FR-FT-011 — the same manual-Save clause, observed through the refusal
// the user is given rather than through a call counter.
//
// Ordering is not cosmetic. While the disk inspection ran first, an unauthorized
// Save of a mixed-ending document whose file had also changed underneath reported
// the conflict and never mentioned the line endings, so the normalization the
// requirement demands was never requested.
func TestUnauthorizedSaveAsksForNormalizationEvenWhenTheFileAlsoChanged(t *testing.T) {
	service := NewAppModelService(&recordingEmitter{})
	service.SetAutosaveEnabled(false)
	path, documentID := writeMixedDocument(t, service, "first\r\nsecond\nthird\n")

	state, err := service.GetState(context.Background())
	if err != nil {
		t.Fatalf("GetState: %v", err)
	}
	revision := state.Snapshot.Documents[documentID].ContentRevision

	// Someone else edits the file after it was opened.
	if err := os.WriteFile(path, []byte("changed by another program\r\nand again\n"), 0o640); err != nil {
		t.Fatalf("rewrite fixture: %v", err)
	}

	result := service.Save(context.Background(), documentID, revision, "")

	if result.Status != apperr.WriteStatusNeedsNormalization {
		t.Fatalf("Save status = %q, want %q — the authorization gate must precede the disk inspection", result.Status, apperr.WriteStatusNeedsNormalization)
	}
}
