package appmodel

import (
	"bytes"
	"context"
	"errors"
	"os"
	"path/filepath"
	"slices"
	"strings"
	"sync"
	"testing"

	"github.com/sanyokkua/go_mark_edit/internal/apperr"
	"github.com/sanyokkua/go_mark_edit/internal/file"
)

type saveDialogFixture struct {
	path            string
	confirm         bool
	chooseErr       error
	confirmErr      error
	chooseCalls     int
	confirmCalls    int
	mutateOnConfirm func(string)
}

func (dialog *saveDialogFixture) ChooseSaveFile(_ context.Context, _ SaveDialogRequest) (string, error) {
	dialog.chooseCalls++
	return dialog.path, dialog.chooseErr
}

func (dialog *saveDialogFixture) ConfirmOverwrite(_ context.Context, subject string) (bool, error) {
	dialog.confirmCalls++
	if dialog.mutateOnConfirm != nil {
		dialog.mutateOnConfirm(subject)
	}
	return dialog.confirm, dialog.confirmErr
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
	service := NewEmptyAppModelService(WithEmitter(&recordingEmitter{}), WithDialogs(nil, dialog))
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
			service := NewEmptyAppModelService(WithEmitter(&recordingEmitter{}), WithDialogs(nil, dialog))
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
			if count := saveReservationCount(service); count != 0 {
				t.Fatalf("save reservations after the refusal = %d, want none", count)
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
	service := NewEmptyAppModelService(WithEmitter(&recordingEmitter{}))
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
	if count := normalizationTokenCount(service); count != 0 {
		t.Fatalf("normalization authorizations = %d, want consumed after commit", count)
	}
	state, err := service.GetState(context.Background())
	if err != nil {
		t.Fatalf("state after mixed Save: %v", err)
	}
	if got := state.Snapshot.Documents[opened.DocumentID].LineEnding; got != "lf" {
		t.Fatalf("normalized line ending = %q, want lf", got)
	}
	/*
	 * T183. Everything above reads the *projection*. A normalization that
	 * updated the model and wrote the old bytes would satisfy every assertion
	 * so far, so SC-FT-001's mixed-ending family was proved only as far as the
	 * model. This is the disk.
	 */
	written, readErr := os.ReadFile(path)
	if readErr != nil {
		t.Fatalf("read back after normalization: %v", readErr)
	}
	if bytes.Contains(written, []byte("\r")) {
		t.Fatalf("bytes on disk = %q, want every CR normalized away", string(written))
	}
	if string(written) != "edited\ncontent\n" {
		t.Fatalf("bytes on disk = %q, want the edited text with LF endings", string(written))
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
	reader := &saveAsDiskVersionReader{}
	dialog := &saveDialogFixture{path: targetPath, confirm: true}
	service := NewEmptyAppModelService(WithEmitter(&recordingEmitter{}), WithConflictReaders(nil, reader.version), WithDialogs(nil, dialog))
	opened := service.OpenPath(context.Background(), sourcePath, 0)
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
	reader.mutateAfterVersion(thirdTarget, 5, []byte("hash-after!"))
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
	reader := &saveAsDiskVersionReader{}
	dialog := &saveDialogFixture{path: targetPath, confirm: true}
	service := NewEmptyAppModelService(WithEmitter(&recordingEmitter{}), WithConflictReaders(nil, reader.version), WithDialogs(nil, dialog))
	opened := service.OpenPath(context.Background(), sourcePath, 0)
	reader.mutateAfterVersion(targetPath, 5, []byte("654321"))
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
	dialog := &saveDialogFixture{path: filepath.Join(root, "cancel.md"), confirm: false}
	if err := os.WriteFile(dialog.path, []byte("existing"), 0o644); err != nil {
		t.Fatalf("write cancellation target: %v", err)
	}
	service := NewEmptyAppModelService(WithEmitter(&recordingEmitter{}), WithDialogs(nil, dialog))
	opened := service.OpenPath(context.Background(), sourcePath, 0)
	if result := service.SaveAs(context.Background(), opened.DocumentID, 0, ""); result.Status != apperr.WriteStatusCancelled || saveReservationCount(service) != 0 {
		t.Fatalf("cancel result/reservations = %+v/%d", result, saveReservationCount(service))
	}
	dialog.path = filepath.Join(root, "failure.md")
	dialog.chooseErr = errors.New("save picker failed")
	if result := service.SaveAs(context.Background(), opened.DocumentID, 0, ""); result.Status != apperr.WriteStatusRefused || saveReservationCount(service) != 0 {
		t.Fatalf("failure result/reservations = %+v/%d", result, saveReservationCount(service))
	}
}

func TestSaveUsesStableDocumentIdentity(t *testing.T) {
	path := filepath.Join(t.TempDir(), "stable.md")
	dialog := &saveDialogFixture{path: path, confirm: true}
	service := NewEmptyAppModelService(WithEmitter(&recordingEmitter{}), WithDialogs(nil, dialog))
	documentID := newSaveDocument(t, service, "stable")
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
	service := NewEmptyAppModelService(WithEmitter(&recordingEmitter{}))
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
	service := NewEmptyAppModelService(WithEmitter(&recordingEmitter{}))
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
	service := NewEmptyAppModelService(WithEmitter(&recordingEmitter{}))
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

type saveAsDiskVersionReader struct {
	mu             sync.Mutex
	calls          map[string]int
	mutateBase     string
	mutateOnCall   int
	mutatedContent []byte
}

func (reader *saveAsDiskVersionReader) version(path string) (file.DiskVersion, error) {
	version, err := file.CurrentDiskVersion(path)
	reader.mu.Lock()
	if reader.calls == nil {
		reader.calls = make(map[string]int)
	}
	reader.calls[path]++
	mutate := filepath.Base(path) == reader.mutateBase && reader.calls[path] == reader.mutateOnCall
	content := append([]byte(nil), reader.mutatedContent...)
	reader.mu.Unlock()
	if mutate {
		if writeErr := os.WriteFile(path, content, 0o644); writeErr != nil {
			return version, writeErr
		}
	}
	return version, err
}

func (reader *saveAsDiskVersionReader) mutateAfterVersion(path string, call int, content []byte) {
	reader.mu.Lock()
	reader.mutateBase = filepath.Base(path)
	reader.mutateOnCall = call
	reader.mutatedContent = append([]byte(nil), content...)
	reader.mu.Unlock()
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
	count := 0
	for _, document := range service.state.documents {
		if document.normalization != nil {
			count++
		}
	}
	return count
}

func saveReservationCount(service *AppModelService) int {
	service.mu.RLock()
	defer service.mu.RUnlock()
	count := 0
	for _, document := range service.state.documents {
		if document.saveReservation != nil {
			count++
		}
	}
	return count
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
	readers := &countingDiskReaders{}
	service := NewAppModelService(WithEmitter(&recordingEmitter{}), WithConflictReaders(readers.stable, readers.version))
	service.SetAutosaveEnabled(false)
	_, documentID := writeMixedDocument(t, service, "first\r\nsecond\nthird\n")

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
	service := NewAppModelService(WithEmitter(&recordingEmitter{}))
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

/*
T168 — FR-FT-011's cancellation arm for the manual prompt.

A mixed-ending Save mints a single-use authorization into service.normalizations
and hands it back as WriteResult.DecisionToken, which is how the prompt is
raised. Confirming consumes it; the requirement also says "cancellation MUST
resume nothing", and nothing released it when the user dismissed the prompt
instead. The authorization stayed for the process lifetime and the next Save
minted another, so service.normalizations grew one entry per dismissal and was
never swept.

T135 closed the same leak on the autosave arm by routing a refused attempt
through CancelNormalization. This is the arm a person actually drives.
*/
// Proves: FR-FT-011
func TestCancelNormalizationReleasesADismissedAuthorization(t *testing.T) {
	root := t.TempDir()
	path := filepath.Join(root, "mixed.md")
	if err := os.WriteFile(path, []byte("one\ntwo\r\n"), 0o640); err != nil {
		t.Fatalf("write mixed fixture: %v", err)
	}
	service := NewEmptyAppModelService(WithEmitter(&recordingEmitter{}))
	opened := service.OpenPath(context.Background(), path, 0)
	if opened.ActiveBuffer == nil {
		t.Fatalf("Open result = %+v", opened)
	}
	if err := service.UpdateBuffer(context.Background(), opened.DocumentID, "edited\ncontent\n"); err != nil {
		t.Fatalf("UpdateBuffer: %v", err)
	}
	blocked := service.Save(context.Background(), opened.DocumentID, 1, "")
	if blocked.Status != apperr.WriteStatusNeedsNormalization || blocked.DecisionToken == "" {
		t.Fatalf("mixed Save = %+v, want one authorization", blocked)
	}
	if count := normalizationTokenCount(service); count != 1 {
		t.Fatalf("authorizations after prompt = %d, want 1", count)
	}

	// The user dismisses the prompt rather than authorizing it.
	cancelled := service.CancelNormalization(opened.DocumentID, blocked.DecisionToken)
	if cancelled.Error != nil {
		t.Fatalf("CancelNormalization = %+v, want no error", cancelled)
	}
	if count := normalizationTokenCount(service); count != 0 {
		t.Fatalf("authorizations after dismissal = %d, want 0", count)
	}

	// The release must be real, not a bookkeeping trim: the dismissed token must
	// buy nothing afterwards. Without this a no-op that merely stopped counting
	// would pass the assertion above.
	replayed := service.Save(context.Background(), opened.DocumentID, 1, blocked.DecisionToken)
	if replayed.Status != apperr.WriteStatusNeedsNormalization {
		t.Fatalf("Save with a dismissed token = %+v, want a fresh normalization request", replayed)
	}
	if replayed.DecisionToken == blocked.DecisionToken {
		t.Fatalf("re-minted token = %q, want a new one rather than the dismissed one", replayed.DecisionToken)
	}
}

/*
T162. The classified error contract permits `system-command-failure` only Retry
and Copy path, and these two sites requested Cancel — which permittedRemediations
dropped, leaving the row served as message-only where the contract names an
action. Both refusals are a missing host dialog, and both are genuinely
re-issuable: the Retry re-invokes the same command, which is what makes offering
it honest rather than a control with nothing behind it.

The third site that stated the same forbidden pairing, close_plan.go's Save
dialog refusal, is deliberately message-only instead: T164 records that a
close-plan failure cannot be re-issued from where it is reported, so Retry there
would be exactly the button-that-calls-nothing this contract exists to prevent.

Asserted on the emitted error rather than on the literal, because the literal is
already covered by TestArchitectureClassifiedRemediationsMatchTheirCategory. The
other thirty corrected sites became message-only, which is byte-for-byte what
the coercion already produced, so only these two changed what a user receives.
*/
// Proves: the classified error contract's `system-command-failure` row
func TestUnavailableHostDialogsOfferRetryRatherThanNothing(t *testing.T) {
	service := NewEmptyAppModelService(WithEmitter(&recordingEmitter{}))

	opened := service.OpenFromDialog(context.Background(), 0)
	if opened.Error == nil || opened.Error.Category != apperr.ClassifiedSystemCommandFailure {
		t.Fatalf("Open with no dialog = %+v, want a system-command-failure", opened)
	}
	if !slices.Contains(opened.Error.Remediations, apperr.RemediationRetry) {
		t.Fatalf("Open dialog refusal remediations = %v, want Retry", opened.Error.Remediations)
	}

	// Revision 1, not 0: newSaveDocument edits the buffer, so revision 0 would
	// be refused as a stale-revision conflict before the dialog check is reached.
	documentID := newSaveDocument(t, service, "content")
	saved := service.SaveAs(context.Background(), documentID, 1, "")
	if saved.Error == nil || saved.Error.Category != apperr.ClassifiedSystemCommandFailure {
		t.Fatalf("Save As with no dialog = %+v, want a system-command-failure", saved)
	}
	if !slices.Contains(saved.Error.Remediations, apperr.RemediationRetry) {
		t.Fatalf("Save dialog refusal remediations = %v, want Retry", saved.Error.Remediations)
	}
}

/*
T183 — SC-FT-001's CRLF, BOM and permission-mode fixture families, joined end to
end.

Each of the three was proved at one end only. CRLF and BOM were proved at
`EncodeDocument`, a pure function whose output is compared in memory, and at the
reader's classification; nothing opened a fixture, edited it through
`appmodel.Save` and read the bytes back off disk. Permission mode was proved at
`file.AtomicReplace` and nowhere above it.

Deliberately NOT citing `internal/file/atomic_replace_test.go:44` for CRLF: it
moves "before\r\n" → "after\r\n" as opaque payload and exercises no line-ending
logic whatsoever. A fixture family is joined only when the convention survives
the encoder *and* the write path together.

Ownership is out of scope, and that is a reading of the criterion rather than an
omission. SC-FT-001 names a "**permission-mode**" fixture, and Constitution V
says "preserve permissions"; neither says ownership, and `atomic_replace.go` has
no `Chown` at all. Asserting ownership here would fail by design against a
requirement nothing states.
*/
// Proves: SC-FT-001 (the CRLF fixture family, encoder through disk)
func TestSaveKeepsAUniformlyCRLFDocumentCRLFOnDisk(t *testing.T) {
	root := t.TempDir()
	path := filepath.Join(root, "crlf.md")
	if err := os.WriteFile(path, []byte("one\r\ntwo\r\n"), 0o644); err != nil {
		t.Fatalf("write CRLF fixture: %v", err)
	}
	service := NewEmptyAppModelService(WithEmitter(&recordingEmitter{}))
	opened := service.OpenPath(context.Background(), path, 0)
	if opened.ActiveBuffer == nil {
		t.Fatalf("Open result = %+v", opened)
	}
	// The working copy carries LF, as the editor always does; the declared
	// convention is what must reach disk.
	if err := service.UpdateBuffer(context.Background(), opened.DocumentID, "one\nedited\n"); err != nil {
		t.Fatalf("UpdateBuffer: %v", err)
	}
	if result := service.Save(context.Background(), opened.DocumentID, 1, ""); result.Status != apperr.WriteStatusCommitted {
		t.Fatalf("Save = %+v, want committed", result)
	}

	written, err := os.ReadFile(path)
	if err != nil {
		t.Fatalf("read back: %v", err)
	}
	if string(written) != "one\r\nedited\r\n" {
		t.Fatalf("bytes on disk = %q, want CRLF preserved through the edit", string(written))
	}
}

// Proves: SC-FT-001 (the UTF-8 BOM fixture family, encoder through disk)
func TestSaveKeepsASingleUTF8BOMOnDisk(t *testing.T) {
	root := t.TempDir()
	path := filepath.Join(root, "bom.md")
	fixture := append([]byte{0xEF, 0xBB, 0xBF}, []byte("one\ntwo\n")...)
	if err := os.WriteFile(path, fixture, 0o644); err != nil {
		t.Fatalf("write BOM fixture: %v", err)
	}
	service := NewEmptyAppModelService(WithEmitter(&recordingEmitter{}))
	opened := service.OpenPath(context.Background(), path, 0)
	if opened.ActiveBuffer == nil {
		t.Fatalf("Open result = %+v", opened)
	}
	if err := service.UpdateBuffer(context.Background(), opened.DocumentID, "one\nedited\n"); err != nil {
		t.Fatalf("UpdateBuffer: %v", err)
	}
	if result := service.Save(context.Background(), opened.DocumentID, 1, ""); result.Status != apperr.WriteStatusCommitted {
		t.Fatalf("Save = %+v, want committed", result)
	}

	written, err := os.ReadFile(path)
	if err != nil {
		t.Fatalf("read back: %v", err)
	}
	if len(written) < 3 || written[0] != 0xEF || written[1] != 0xBB || written[2] != 0xBF {
		t.Fatalf("bytes on disk = % x, want a UTF-8 BOM as the first three bytes", written)
	}
	// The reader strips the BOM from the content and the encoder re-adds it, so
	// the failure this guards against is a *doubled* mark rather than a missing
	// one — which a byte-count or prefix check alone would not see.
	if bytes.HasPrefix(written[3:], []byte{0xEF, 0xBB, 0xBF}) {
		t.Fatalf("bytes on disk = % x, want exactly one BOM", written)
	}
	if string(written[3:]) != "one\nedited\n" {
		t.Fatalf("content after the BOM = %q, want the edited text", string(written[3:]))
	}
}

// Proves: SC-FT-001 (the permission-mode fixture family, at appmodel.Save)
func TestSavePreservesThePermissionModeAboveAtomicReplace(t *testing.T) {
	root := t.TempDir()
	path := filepath.Join(root, "mode.md")
	if err := os.WriteFile(path, []byte("base\n"), 0o640); err != nil {
		t.Fatalf("write mode fixture: %v", err)
	}
	service := NewEmptyAppModelService(WithEmitter(&recordingEmitter{}))
	opened := service.OpenPath(context.Background(), path, 0)
	if opened.ActiveBuffer == nil {
		t.Fatalf("Open result = %+v", opened)
	}
	if err := service.UpdateBuffer(context.Background(), opened.DocumentID, "edited\n"); err != nil {
		t.Fatalf("UpdateBuffer: %v", err)
	}
	if result := service.Save(context.Background(), opened.DocumentID, 1, ""); result.Status != apperr.WriteStatusCommitted {
		t.Fatalf("Save = %+v, want committed", result)
	}

	info, err := os.Stat(path)
	if err != nil {
		t.Fatalf("stat after save: %v", err)
	}
	if info.Mode().Perm() != 0o640 {
		t.Fatalf("mode after save = %v, want 0640 preserved through appmodel.Save", info.Mode().Perm())
	}
}

/*
T183 — SC-FT-001's write-failure family, for a *single explicit Save*.

The criterion's "or" has two halves: the edit reaches disk with the required
characteristics, **or** the original file stays byte-for-byte intact and visibly
modified. Both halves together were asserted in exactly one place —
`close_plan_test.go:55`, a Save-all across a close plan — which is another
requirement's test doing this family's work by accident. A single document
saved explicitly is the ordinary path and had no such test.

`file.AtomicReplace`'s own six pre-commit subtests prove the bytes survive at
that layer, but they have no concept of a dirty document, so they cannot assert
the second half of the "or" at all.
*/
// Proves: SC-FT-001 (the write-failure family, for a single explicit Save)
func TestFailedExplicitSaveLeavesTheFileIntactAndTheDocumentDirty(t *testing.T) {
	root := t.TempDir()
	path := filepath.Join(root, "intact.md")
	if err := os.WriteFile(path, []byte("original\n"), 0o644); err != nil {
		t.Fatalf("write fixture: %v", err)
	}
	service := NewEmptyAppModelService(WithEmitter(&recordingEmitter{}), WithWriteExecutor(func(WriteSnapshot) (file.DiskVersion, error) {
		return file.DiskVersion{}, errors.New("write failed")
	}))
	service.SetAutosaveEnabled(false)
	opened := service.OpenPath(context.Background(), path, 0)
	if opened.ActiveBuffer == nil {
		t.Fatalf("Open result = %+v", opened)
	}
	if err := service.UpdateBuffer(context.Background(), opened.DocumentID, "edited\n"); err != nil {
		t.Fatalf("UpdateBuffer: %v", err)
	}
	result := service.Save(context.Background(), opened.DocumentID, 1, "")
	if result.Error == nil || result.Error.Category != apperr.ClassifiedIOFailure {
		t.Fatalf("failed Save = %+v, want a classified io-failure", result)
	}

	// Half one of the criterion's "or": the original bytes are untouched.
	written, readErr := os.ReadFile(path)
	if readErr != nil {
		t.Fatalf("read back after a failed save: %v", readErr)
	}
	if string(written) != "original\n" {
		t.Fatalf("bytes on disk = %q, want the original byte-for-byte", string(written))
	}

	// Half two, and the half `file.AtomicReplace`'s own tests cannot reach:
	// the document is still visibly modified, so the work is not silently lost.
	state, err := service.GetState(context.Background())
	if err != nil {
		t.Fatalf("state after a failed save: %v", err)
	}
	if !state.Snapshot.Documents[opened.DocumentID].Dirty {
		t.Fatalf("document after a failed save = clean, want still dirty")
	}
}
