package appmodel

import (
	"context"
	"os"
	"path/filepath"
	"strings"
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

// Proves: FR-FT-012 (partial — the Save-As fallback and .md append; rejection of an unsupported suffix through SaveAs is unproven; T157)
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

// Proves: FR-FT-006 (partial — the pre-disk write refusal; editing/format/lint unavailability is unproven; T157)
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
