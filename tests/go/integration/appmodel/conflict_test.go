package appmodel_test

import (
	"context"
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/sanyokkua/go_mark_edit/internal/apperr"
	. "github.com/sanyokkua/go_mark_edit/internal/appmodel"
)

func TestExternalChangeComparisonKeepsDistantLinesAndFullCounts(t *testing.T) {
	service := NewAppModelServiceForHost(WithEmitter(&recordingEmitter{}), AppModelOption{AutosaveTimer: &fakeAutosaveClock{}})
	path, documentID := openAutosaveDocument(t, service, "base\n")
	yours := strings.Repeat("line\n", 20) + strings.Repeat("é", 2500) + "\nlast"
	if err := service.UpdateBuffer(context.Background(), documentID, yours); err != nil {
		t.Fatalf("UpdateBuffer: %v", err)
	}
	onDisk := strings.Repeat("line\n", 20) + strings.Repeat("é", 2500) + "\nchanged"
	if err := os.WriteFile(path, []byte(onDisk), 0o640); err != nil {
		t.Fatalf("external replacement: %v", err)
	}
	checked := service.CheckExternalChanges(context.Background(), documentID)
	if checked.Preview == nil {
		t.Fatalf("CheckExternalChanges = %+v, want comparison", checked)
	}
	if got := checked.Preview.OnDisk; got.Text != onDisk || got.LineCount != 22 {
		t.Fatalf("On disk = %+v, want complete 22-line text", got)
	}
	if got := checked.Preview.Yours; got.Text != yours || got.LineCount != 22 {
		t.Fatalf("Yours = %+v, want complete 22-line text", got)
	}
}

func TestExternalChangeComparisonReportsPhysicalAndExpectedEncodedBytes(t *testing.T) {
	service := NewAppModelServiceForHost(WithEmitter(&recordingEmitter{}), AppModelOption{AutosaveTimer: &fakeAutosaveClock{}})
	path, documentID := openAutosaveDocument(t, service, "\xef\xbb\xbfbase\r\n")
	if err := service.UpdateBuffer(context.Background(), documentID, "é\nnext\n"); err != nil {
		t.Fatalf("UpdateBuffer: %v", err)
	}
	if err := os.WriteFile(path, []byte("other\n"), 0o640); err != nil {
		t.Fatalf("external replacement: %v", err)
	}
	checked := service.CheckExternalChanges(context.Background(), documentID)
	if checked.Preview == nil {
		t.Fatalf("CheckExternalChanges = %+v, want comparison", checked)
	}
	if checked.Preview.OnDisk.Text != "other\n" || checked.Preview.OnDisk.LineCount != 2 || checked.Preview.Yours.LineCount != 3 {
		t.Fatalf("comparison sides = %+v, want canonical text and full line counts", checked.Preview)
	}
	encoded, err := json.Marshal(checked.Preview)
	if err != nil {
		t.Fatalf("marshal comparison: %v", err)
	}
	var wire struct {
		OnDisk struct {
			ByteCount *int64 `json:"byteCount"`
		} `json:"onDisk"`
		Yours struct {
			ByteCount *int64 `json:"byteCount"`
		} `json:"yours"`
	}
	if err := json.Unmarshal(encoded, &wire); err != nil {
		t.Fatalf("decode comparison: %v", err)
	}
	if wire.OnDisk.ByteCount == nil || *wire.OnDisk.ByteCount != 6 || wire.Yours.ByteCount == nil || *wire.Yours.ByteCount != 13 {
		t.Fatalf("comparison bytes = %s, want physical 6 and expected saved 13", encoded)
	}
}

func TestExternalChangeComparisonKeepsEmptyAndTrailingLines(t *testing.T) {
	service := NewAppModelServiceForHost(WithEmitter(&recordingEmitter{}), AppModelOption{AutosaveTimer: &fakeAutosaveClock{}})
	path, documentID := openAutosaveDocument(t, service, "base")
	if err := service.UpdateBuffer(context.Background(), documentID, "mine\n"); err != nil {
		t.Fatalf("UpdateBuffer: %v", err)
	}
	if err := os.WriteFile(path, nil, 0o640); err != nil {
		t.Fatalf("external replacement: %v", err)
	}
	checked := service.CheckExternalChanges(context.Background(), documentID)
	if checked.Preview == nil {
		t.Fatalf("CheckExternalChanges = %+v, want comparison", checked)
	}
	if got := checked.Preview.OnDisk; got.Text != "" || got.LineCount != 1 || got.ByteCount == nil || *got.ByteCount != 0 {
		t.Fatalf("empty On disk = %+v, want one line and zero physical bytes", got)
	}
	if got := checked.Preview.Yours; got.Text != "mine\n" || got.LineCount != 2 || got.ByteCount == nil || *got.ByteCount != 5 {
		t.Fatalf("trailing-line Yours = %+v, want two lines and five saved bytes", got)
	}
}

func TestExternalChangeComparisonShowsMetadataOnlyChangesWithBothByteSizes(t *testing.T) {
	service := NewAppModelServiceForHost(WithEmitter(&recordingEmitter{}))
	path, documentID := openAutosaveDocument(t, service, "base\n")
	if err := os.WriteFile(path, []byte("\xef\xbb\xbfbase\r\n"), 0o640); err != nil {
		t.Fatalf("external replacement: %v", err)
	}
	info, err := os.Stat(path)
	if err != nil {
		t.Fatalf("stat external replacement: %v", err)
	}
	checked := service.CheckExternalChanges(context.Background(), documentID)
	if checked.Preview == nil {
		t.Fatalf("CheckExternalChanges = %+v, want comparison", checked)
	}
	preview := checked.Preview
	if preview.OnDisk.Text != "base\n" || preview.Yours.Text != "base\n" || len(preview.MetadataDifferences) == 0 {
		t.Fatalf("metadata-only comparison = %+v, want equal canonical text and characteristic change", preview)
	}
	if preview.OnDisk.ByteCount == nil || *preview.OnDisk.ByteCount != info.Size() || *preview.OnDisk.ByteCount != 9 || preview.Yours.ByteCount == nil || *preview.Yours.ByteCount != 5 {
		t.Fatalf("metadata-only bytes = %+v, want physical BOM+CRLF 9 and expected LF 5", preview)
	}
}

func TestExternalChangeComparisonReportsUnavailableSavedBytesForMixedAndUnsafeContent(t *testing.T) {
	for _, testCase := range []struct {
		name   string
		base   string
		reason apperr.ConflictByteCountUnavailableReason
	}{
		{name: "mixed line endings", base: "first\r\nsecond\n", reason: apperr.ConflictByteCountNormalizationRequired},
		{name: "unsupported encoding", base: "invalid\xff", reason: apperr.ConflictByteCountUnsupportedEncoding},
		{name: "unsafe content", base: "nul\x00byte", reason: apperr.ConflictByteCountUnsafeContent},
	} {
		t.Run(testCase.name, func(t *testing.T) {
			service := NewAppModelServiceForHost(WithEmitter(&recordingEmitter{}))
			path, documentID := openAutosaveDocument(t, service, testCase.base)
			if err := os.WriteFile(path, []byte("external\n"), 0o640); err != nil {
				t.Fatalf("external replacement: %v", err)
			}
			checked := service.CheckExternalChanges(context.Background(), documentID)
			if checked.Preview == nil {
				t.Fatalf("CheckExternalChanges = %+v, want comparison", checked)
			}
			if checked.Preview.Yours.ByteCount != nil || checked.Preview.Yours.ByteCountUnavailableReason != testCase.reason {
				t.Fatalf("Yours = %+v, want unavailable reason %q", checked.Preview.Yours, testCase.reason)
			}
			encoded, err := json.Marshal(checked.Preview.Yours)
			if err != nil || !strings.Contains(string(encoded), `"byteCount":null`) {
				t.Fatalf("Yours JSON = %s, error=%v; want explicit null byte count", encoded, err)
			}
		})
	}
}

func TestExternalChangeCheckProvidesARevisionBoundPreview(t *testing.T) {
	service := NewAppModelServiceForHost(WithEmitter(&recordingEmitter{}))
	path, documentID := openAutosaveDocument(t, service, "base\n")
	if err := os.WriteFile(path, []byte("external\n"), 0o640); err != nil {
		t.Fatalf("external replacement: %v", err)
	}

	checked := service.CheckExternalChanges(context.Background(), documentID)
	if checked.Status != apperr.ConflictStatusDetected || checked.Preview == nil {
		t.Fatalf("CheckExternalChanges = %+v, want a preview", checked)
	}
	preview := checked.Preview
	if preview.DocumentID != documentID || preview.ContentRevision != checked.DocumentRevision || preview.Path == "" || preview.OnDisk.Text != "external\n" || preview.Yours.Text != "base\n" {
		t.Fatalf("conflict preview = %+v, want identity, revision, path and bounded sides", preview)
	}

	skipped := service.SkipConflict(context.Background(), documentID, preview.ContentRevision, preview.DetectedDiskVersion)
	if skipped.Status != apperr.ConflictStatusSkipped || skipped.Error != nil {
		t.Fatalf("SkipConflict = %+v, want skipped", skipped)
	}
	state, err := service.GetState(context.Background())
	if err != nil {
		t.Fatalf("GetState after skip: %v", err)
	}
	if state.Snapshot.Documents[documentID].ConflictBlocked {
		t.Fatal("skipping a conflict left the document blocked")
	}
}

func TestReloadFromDiskReplacesTheBufferAndAdvancesItsRevision(t *testing.T) {
	service := NewAppModelServiceForHost(WithEmitter(&recordingEmitter{}))
	path, documentID := openAutosaveDocument(t, service, "base\n")
	if err := os.WriteFile(path, []byte("reloaded\n"), 0o640); err != nil {
		t.Fatalf("external replacement: %v", err)
	}
	detected := service.CheckExternalChanges(context.Background(), documentID)
	if detected.Preview == nil {
		t.Fatalf("CheckExternalChanges = %+v, want preview", detected)
	}

	reloaded := service.ReloadFromDisk(context.Background(), documentID, detected.Preview.ContentRevision, detected.Preview.DetectedDiskVersion)
	if reloaded.Status != apperr.ConflictStatusReloaded || reloaded.ActiveBuffer == nil || reloaded.ActiveBuffer.Content != "reloaded\n" {
		t.Fatalf("ReloadFromDisk = %+v, want the external buffer", reloaded)
	}
	if reloaded.DocumentRevision <= detected.Preview.ContentRevision {
		t.Fatalf("reloaded revision = %d, want greater than detected %d", reloaded.DocumentRevision, detected.Preview.ContentRevision)
	}
	state, err := service.GetState(context.Background())
	if err != nil {
		t.Fatalf("GetState after reload: %v", err)
	}
	metadata := state.Snapshot.Documents[documentID]
	if metadata.Dirty || metadata.ConflictBlocked || metadata.Status != string(SaveStatusSaved) {
		t.Fatalf("reloaded metadata = %+v, want clean unblocked document", metadata)
	}
}

func TestMissingBackingFileBecomesADetachedDocument(t *testing.T) {
	service := NewAppModelServiceForHost(WithEmitter(&recordingEmitter{}))
	path, documentID := openAutosaveDocument(t, service, "base\n")
	if err := os.Remove(path); err != nil {
		t.Fatalf("remove backing file: %v", err)
	}

	result := service.CheckExternalChanges(context.Background(), documentID)
	if result.Status != apperr.ConflictStatusDetached || result.Error != nil {
		t.Fatalf("CheckExternalChanges after deletion = %+v, want detached", result)
	}
	state, err := service.GetState(context.Background())
	if err != nil {
		t.Fatalf("GetState after deletion: %v", err)
	}
	if !state.Snapshot.Documents[documentID].Detached {
		t.Fatal("missing backing file did not mark the document detached")
	}
}

func TestKeepMineAuthorizationIsSingleUseAndSavesTheCurrentBuffer(t *testing.T) {
	service := NewAppModelServiceForHost(WithEmitter(&recordingEmitter{}), AppModelOption{AutosaveTimer: &fakeAutosaveClock{}})
	path, documentID := openAutosaveDocument(t, service, "base\n")
	if err := service.UpdateBuffer(context.Background(), documentID, "mine\n"); err != nil {
		t.Fatalf("edit: %v", err)
	}
	if err := os.WriteFile(path, []byte("external\n"), 0o640); err != nil {
		t.Fatalf("external replacement: %v", err)
	}
	detected := service.CheckExternalChanges(context.Background(), documentID)
	if detected.Preview == nil {
		t.Fatalf("CheckExternalChanges = %+v, want preview", detected)
	}
	state, err := service.GetState(context.Background())
	if err != nil {
		t.Fatalf("GetState before authorization: %v", err)
	}
	authorized := service.AuthorizeKeepMine(context.Background(), documentID, detected.Preview.ContentRevision, state.Snapshot.Documents[documentID].Path, detected.Preview.DetectedDiskVersion)
	if authorized.Status != apperr.ConflictStatusAuthorized || authorized.DecisionToken == "" {
		t.Fatalf("AuthorizeKeepMine = %+v, want one decision token", authorized)
	}

	saved := service.Save(context.Background(), documentID, detected.Preview.ContentRevision, authorized.DecisionToken)
	if saved.Status != apperr.WriteStatusCommitted {
		t.Fatalf("Save with keep-mine token = %+v, want committed", saved)
	}
	disk, err := os.ReadFile(path)
	if err != nil {
		t.Fatalf("read saved file: %v", err)
	}
	if string(disk) != "mine\n" {
		t.Fatalf("saved bytes = %q, want current buffer", disk)
	}
	if err := os.WriteFile(path, []byte("changed again\n"), 0o640); err != nil {
		t.Fatalf("second external replacement: %v", err)
	}
	secondDetected := service.CheckExternalChanges(context.Background(), documentID)
	if secondDetected.Preview == nil {
		t.Fatalf("second CheckExternalChanges = %+v, want preview", secondDetected)
	}
	second := service.Save(context.Background(), documentID, saved.Data.WrittenContentRevision, authorized.DecisionToken)
	if second.Status == apperr.WriteStatusCommitted {
		t.Fatal("reused keep-mine authorization committed a second write")
	}
}

func TestKeepMineWritesWhenExternalBytesRevertWithCommittedMetadata(t *testing.T) {
	ctx := context.Background()
	service := NewAppModelServiceForHost(WithEmitter(&recordingEmitter{}), AppModelOption{AutosaveTimer: &fakeAutosaveClock{}})
	path, documentID := openAutosaveDocument(t, service, "base\n")
	if err := service.UpdateBuffer(ctx, documentID, "mine\n"); err != nil {
		t.Fatalf("edit: %v", err)
	}
	state, err := service.GetState(ctx)
	if err != nil {
		t.Fatalf("GetState before first save: %v", err)
	}
	revision := state.Snapshot.Documents[documentID].ContentRevision
	firstSave := service.Save(ctx, documentID, revision, "")
	if firstSave.Status != apperr.WriteStatusCommitted {
		t.Fatalf("first save = %+v, want committed", firstSave)
	}
	committedInfo, err := os.Stat(path)
	if err != nil {
		t.Fatalf("stat committed file: %v", err)
	}
	if err := os.WriteFile(path, []byte("base\n"), 0o640); err != nil {
		t.Fatalf("restore original bytes externally: %v", err)
	}
	if err := os.Chtimes(path, committedInfo.ModTime(), committedInfo.ModTime()); err != nil {
		t.Fatalf("restore committed timestamps: %v", err)
	}
	restoredInfo, err := os.Stat(path)
	if err != nil {
		t.Fatalf("stat externally restored file: %v", err)
	}
	if !os.SameFile(committedInfo, restoredInfo) || restoredInfo.Size() != committedInfo.Size() || !restoredInfo.ModTime().Equal(committedInfo.ModTime()) || restoredInfo.Mode().Perm() != committedInfo.Mode().Perm() {
		t.Fatalf("restored file metadata = %+v, want committed metadata %+v", restoredInfo, committedInfo)
	}

	detected := service.CheckExternalChanges(ctx, documentID)
	if detected.Preview == nil {
		t.Fatalf("CheckExternalChanges = %+v, want conflict preview", detected)
	}
	state, err = service.GetState(ctx)
	if err != nil {
		t.Fatalf("GetState before authorization: %v", err)
	}
	authorized := service.AuthorizeKeepMine(ctx, documentID, revision, state.Snapshot.Documents[documentID].Path, detected.Preview.DetectedDiskVersion)
	if authorized.Status != apperr.ConflictStatusAuthorized || authorized.DecisionToken == "" {
		t.Fatalf("AuthorizeKeepMine = %+v, want one decision token", authorized)
	}
	saved := service.Save(ctx, documentID, revision, authorized.DecisionToken)
	if saved.Status != apperr.WriteStatusCommitted {
		t.Fatalf("Save with keep-mine token = %+v, want committed", saved)
	}
	disk, err := os.ReadFile(path)
	if err != nil {
		t.Fatalf("read saved file: %v", err)
	}
	if string(disk) != "mine\n" {
		t.Fatalf("saved bytes = %q, want current buffer", disk)
	}
}

func TestMixedKeepMineSurvivesSameVersionCheck(t *testing.T) {
	ctx := context.Background()
	service := NewAppModelServiceForHost(WithEmitter(&recordingEmitter{}), AppModelOption{AutosaveTimer: &fakeAutosaveClock{}})
	path, id := openAutosaveDocument(t, service, "a\r\nb\n")
	if err := service.UpdateBuffer(ctx, id, "mine\n"); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(path, []byte("external\n"), 0640); err != nil {
		t.Fatal(err)
	}
	state, _ := service.GetState(ctx)
	revision := state.Snapshot.Documents[id].ContentRevision
	normalization := service.Save(ctx, id, revision, "")
	if normalization.Status != apperr.WriteStatusNeedsNormalization {
		t.Fatalf("normalization = %+v", normalization)
	}
	conflict := service.Save(ctx, id, revision, normalization.DecisionToken)
	if conflict.Status == apperr.WriteStatusCommitted {
		t.Fatal("unexpected write")
	}
	detected := service.CheckExternalChanges(ctx, id)
	if detected.Preview == nil {
		t.Fatalf("conflict = %+v", detected)
	}
	authorized := service.AuthorizeKeepMine(ctx, id, revision, path, detected.Preview.DetectedDiskVersion)
	if authorized.Status != apperr.ConflictStatusAuthorized {
		t.Fatalf("authorization = %+v", authorized)
	}
	service.CheckExternalChanges(ctx, id)
	saved := service.Save(ctx, id, revision, authorized.DecisionToken)
	if saved.Status != apperr.WriteStatusCommitted {
		t.Fatalf("save = %+v, want committed", saved)
	}
	bytes, err := os.ReadFile(path)
	if err != nil || string(bytes) != "mine\r\n" {
		t.Fatalf("disk = %q, %v", bytes, err)
	}
}

func TestMixedKeepMineRejectsNewDiskVersionAndSkipClearsConsent(t *testing.T) {
	ctx := context.Background()
	service := NewAppModelServiceForHost(WithEmitter(&recordingEmitter{}), AppModelOption{AutosaveTimer: &fakeAutosaveClock{}})
	path, id := openAutosaveDocument(t, service, "a\r\nb\n")
	if err := service.UpdateBuffer(ctx, id, "mine\n"); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(path, []byte("external\n"), 0640); err != nil {
		t.Fatal(err)
	}
	state, _ := service.GetState(ctx)
	revision := state.Snapshot.Documents[id].ContentRevision
	n := service.Save(ctx, id, revision, "")
	service.Save(ctx, id, revision, n.DecisionToken)
	detected := service.CheckExternalChanges(ctx, id)
	if detected.Preview == nil {
		t.Fatal("missing conflict")
	}
	k := service.AuthorizeKeepMine(ctx, id, revision, path, detected.Preview.DetectedDiskVersion)
	if k.Status != apperr.ConflictStatusAuthorized {
		t.Fatalf("authorize: %+v", k)
	}
	if err := os.WriteFile(path, []byte("another external version\n"), 0640); err != nil {
		t.Fatal(err)
	}
	result := service.Save(ctx, id, revision, k.DecisionToken)
	if result.Conflict == nil {
		t.Fatalf("new version should conflict: %+v", result)
	}
	bytes, err := os.ReadFile(path)
	if err != nil || string(bytes) != "another external version\n" {
		t.Fatalf("disk = %q, %v", bytes, err)
	}
	skipped := service.SkipConflict(ctx, id, revision, result.Conflict.DetectedDiskVersion)
	if skipped.Status != apperr.ConflictStatusSkipped {
		t.Fatalf("skip: %+v", skipped)
	}
	again := service.Save(ctx, id, revision, n.DecisionToken)
	if again.Status != apperr.WriteStatusNeedsNormalization || again.DecisionToken == n.DecisionToken {
		t.Fatalf("save after skip = %+v", again)
	}
}

func TestMixedKeepMineSaveAs(t *testing.T) {
	ctx := context.Background()
	target := filepath.Join(t.TempDir(), "copy.md")
	service := NewAppModelServiceForHost(WithEmitter(&recordingEmitter{}), WithDialogs(nil, saveDialog{path: target}), AppModelOption{AutosaveTimer: &fakeAutosaveClock{}})
	path, id := openAutosaveDocument(t, service, "a\r\nb\n")
	if err := service.UpdateBuffer(ctx, id, "mine\n"); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(path, []byte("external\n"), 0640); err != nil {
		t.Fatal(err)
	}
	state, _ := service.GetState(ctx)
	revision := state.Snapshot.Documents[id].ContentRevision
	n := service.SaveAs(ctx, id, revision, "")
	if n.Status != apperr.WriteStatusNeedsNormalization {
		t.Fatalf("normalization = %+v", n)
	}
	conflict := service.SaveAs(ctx, id, revision, n.DecisionToken)
	if conflict.Conflict == nil {
		t.Fatalf("conflict = %+v", conflict)
	}
	k := service.AuthorizeKeepMine(ctx, id, revision, path, conflict.Conflict.DetectedDiskVersion)
	if k.Status != apperr.ConflictStatusAuthorized {
		t.Fatalf("authorize = %+v", k)
	}
	saved := service.SaveAs(ctx, id, revision, k.DecisionToken)
	if saved.Status != apperr.WriteStatusCommitted {
		t.Fatalf("save as = %+v", saved)
	}
	bytes, err := os.ReadFile(target)
	if err != nil || string(bytes) != "mine\r\n" {
		t.Fatalf("target = %q, %v", bytes, err)
	}
}

func TestExternalChangeWithUnchangedMetadataIsDetected(t *testing.T) {
	service := NewAppModelServiceForHost(WithEmitter(&recordingEmitter{}), AppModelOption{AutosaveTimer: &fakeAutosaveClock{}})
	path, id := openAutosaveDocument(t, service, "base\n")
	info, err := os.Stat(path)
	if err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(path, []byte("disk\n"), info.Mode()); err != nil {
		t.Fatal(err)
	}
	if err := os.Chtimes(path, info.ModTime(), info.ModTime()); err != nil {
		t.Fatal(err)
	}
	result := service.CheckExternalChanges(context.Background(), id)
	if result.Preview == nil || result.Preview.OnDisk.Text != "disk\n" {
		t.Fatalf("check = %+v, want external comparison", result)
	}
}

func TestConflictDecisionsRejectSameMetadataChangedBytes(t *testing.T) {
	for _, action := range []string{"reload", "keep"} {
		t.Run(action, func(t *testing.T) {
			service := NewAppModelServiceForHost(WithEmitter(&recordingEmitter{}), AppModelOption{AutosaveTimer: &fakeAutosaveClock{}})
			path, id := openAutosaveDocument(t, service, "base\n")
			if err := os.WriteFile(path, []byte("disk\n"), 0o640); err != nil {
				t.Fatal(err)
			}
			preview := service.CheckExternalChanges(context.Background(), id).Preview
			if preview == nil {
				t.Fatal("missing preview")
			}
			info, err := os.Stat(path)
			if err != nil {
				t.Fatal(err)
			}
			if err := os.WriteFile(path, []byte("next\n"), info.Mode()); err != nil {
				t.Fatal(err)
			}
			if err := os.Chtimes(path, info.ModTime(), info.ModTime()); err != nil {
				t.Fatal(err)
			}
			var result apperr.ConflictResult
			if action == "reload" {
				result = service.ReloadFromDisk(context.Background(), id, preview.ContentRevision, preview.DetectedDiskVersion)
			} else {
				result = service.AuthorizeKeepMine(context.Background(), id, preview.ContentRevision, preview.Path, preview.DetectedDiskVersion)
			}
			if result.Status == apperr.ConflictStatusReloaded || result.Status == apperr.ConflictStatusAuthorized {
				t.Fatalf("stale decision accepted: %+v", result)
			}
		})
	}
}
