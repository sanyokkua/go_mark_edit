package appmodel

import (
	"context"
	"os"
	"path/filepath"
	"testing"

	"github.com/sanyokkua/go_mark_edit/internal/apperr"
	"github.com/sanyokkua/go_mark_edit/internal/file"
)

type fixedSaveDialog string

func (dialog fixedSaveDialog) ChooseSaveFile(context.Context, SaveDialogRequest) (string, error) {
	return string(dialog), nil
}

func (fixedSaveDialog) ConfirmOverwrite(context.Context, string) (bool, error) { return true, nil }

const mixedFixture = "a\nb\nc\r\n"

// openMixedDocumentWithStaleNormalization returns an edited mixed-ending
// document and an LF normalization token, after which the document's proposed
// ending becomes CRLF. No public command changes the proposed ending while an
// authorization is outstanding, so the record is changed directly; the tests
// show that an authorization for another ending never writes.
func openMixedDocumentWithStaleNormalization(t *testing.T, service *AppModelService) (string, string, uint64, string) {
	t.Helper()
	ctx := context.Background()
	path := filepath.Join(t.TempDir(), "mixed.md")
	if err := os.WriteFile(path, []byte(mixedFixture), 0o644); err != nil {
		t.Fatalf("write document: %v", err)
	}
	opened := service.OpenPath(ctx, path, 0)
	if opened.Status != OpenStatusOpened {
		t.Fatalf("OpenPath = %+v", opened)
	}
	if err := service.UpdateBuffer(ctx, opened.DocumentID, "a\nb\nc\nd\n"); err != nil {
		t.Fatalf("UpdateBuffer: %v", err)
	}
	state, err := service.GetState(ctx)
	if err != nil {
		t.Fatalf("GetState: %v", err)
	}
	revision := state.Snapshot.Documents[opened.DocumentID].ContentRevision
	requested := service.RequestNormalization(opened.DocumentID, revision)
	if requested.Status != apperr.WriteStatusNeedsNormalization || requested.ProposedEnding != string(file.LineEndingLF) {
		t.Fatalf("RequestNormalization = %+v, want an LF proposal", requested)
	}
	service.mu.Lock()
	service.state.documents[opened.DocumentID].normalizationEnding = string(file.LineEndingCRLF)
	service.mu.Unlock()
	return path, opened.DocumentID, revision, requested.DecisionToken
}

func assertMixedFileUnchanged(t *testing.T, path string) {
	t.Helper()
	disk, err := os.ReadFile(path)
	if err != nil || string(disk) != mixedFixture {
		t.Fatalf("disk = %q, %v; want the mixed file unchanged", disk, err)
	}
}

func TestSaveRefusesANormalizationAuthorizedForAnotherLineEnding(t *testing.T) {
	service := NewAppModelServiceForHost(WithEmitter(&retentionEmitter{}))
	path, id, revision, token := openMixedDocumentWithStaleNormalization(t, service)

	result := service.Save(context.Background(), id, revision, token)

	if result.Status != apperr.WriteStatusNeedsNormalization || result.DecisionToken == token || result.ProposedEnding != string(file.LineEndingCRLF) {
		t.Fatalf("Save = %+v, want a fresh CRLF normalization request", result)
	}
	assertMixedFileUnchanged(t, path)
}

func TestSaveAsRefusesANormalizationAuthorizedForAnotherLineEnding(t *testing.T) {
	target := filepath.Join(t.TempDir(), "copy.md")
	service := NewAppModelServiceForHost(WithEmitter(&retentionEmitter{}), WithDialogs(nil, fixedSaveDialog(target)))
	path, id, revision, token := openMixedDocumentWithStaleNormalization(t, service)

	result := service.SaveAs(context.Background(), id, revision, token)

	if result.Status != apperr.WriteStatusNeedsNormalization || result.DecisionToken == token || result.ProposedEnding != string(file.LineEndingCRLF) {
		t.Fatalf("SaveAs = %+v, want a fresh CRLF normalization request", result)
	}
	assertMixedFileUnchanged(t, path)
	if _, err := os.Stat(target); !os.IsNotExist(err) {
		t.Fatalf("Save As target stat error = %v, want no file", err)
	}
}

func TestClosePlanRefusesANormalizationAuthorizedForAnotherLineEnding(t *testing.T) {
	ctx := context.Background()
	service := NewAppModelServiceForHost(WithEmitter(&retentionEmitter{}))
	path, id, _, token := openMixedDocumentWithStaleNormalization(t, service)
	state, err := service.GetState(ctx)
	if err != nil {
		t.Fatalf("GetState: %v", err)
	}
	plan := service.PrepareClose(ctx, apperr.ClosePlanSingle, []string{id}, state.Snapshot.TabSetRevision)
	if plan.Error != nil || plan.Data == nil {
		t.Fatalf("PrepareClose = %+v", plan)
	}

	resolved := service.ResolveClosePlan(ctx, plan.Data.ID, []apperr.ClosePlanDecision{{DocumentID: id, Choice: apperr.CloseChoiceSave, DecisionToken: token}})

	if resolved.Data == nil || resolved.Data.Status == apperr.ClosePlanReady || resolved.Data.Targets[0].NormalizationToken == token || resolved.Data.Targets[0].ProposedEnding != string(file.LineEndingCRLF) {
		t.Fatalf("ResolveClosePlan = %+v, want a fresh CRLF normalization request instead of a ready plan", resolved)
	}
	assertMixedFileUnchanged(t, path)
}
