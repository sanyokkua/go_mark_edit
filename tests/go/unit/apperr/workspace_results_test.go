package apperr_test

import (
	"encoding/json"
	"testing"

	"github.com/sanyokkua/go_mark_edit/internal/apperr"
)

func TestWorkspaceFileNodeOmitsUnreadableAndChildren(t *testing.T) {
	encoded, err := json.Marshal(apperr.WorkspaceNode{Path: "/notes.md", Name: "notes.md", IsDir: false})
	if err != nil {
		t.Fatalf("marshal file node: %v", err)
	}
	var fields map[string]json.RawMessage
	if err := json.Unmarshal(encoded, &fields); err != nil {
		t.Fatalf("decode file node: %v", err)
	}
	for _, optional := range []string{"unreadable", "children"} {
		if _, ok := fields[optional]; ok {
			t.Fatalf("file node JSON %s includes %q: %s", encoded, optional, encoded)
		}
	}
}

func TestWorkspacePatchDistinguishesOmittedFromExplicitNull(t *testing.T) {
	omitted, err := json.Marshal(apperr.AppStatePatch{})
	if err != nil {
		t.Fatalf("marshal omitted workspace patch: %v", err)
	}
	var omittedFields map[string]json.RawMessage
	if err := json.Unmarshal(omitted, &omittedFields); err != nil {
		t.Fatalf("decode omitted workspace patch: %v", err)
	}
	if _, ok := omittedFields["workspace"]; ok {
		t.Fatalf("omitted workspace patch contains workspace: %s", omitted)
	}

	cleared, err := json.Marshal(apperr.AppStatePatch{Workspace: &apperr.WorkspacePatch{}})
	if err != nil {
		t.Fatalf("marshal explicit workspace clear: %v", err)
	}
	var clearedFields map[string]json.RawMessage
	if err := json.Unmarshal(cleared, &clearedFields); err != nil {
		t.Fatalf("decode explicit workspace clear: %v", err)
	}
	if got, ok := clearedFields["workspace"]; !ok || string(got) != "null" {
		t.Fatalf("workspace clear field = %s, present=%t; want explicit null", got, ok)
	}

	workspace := apperr.WorkspaceSnapshot{RootPath: "/notes", RootName: "notes"}
	updated, err := json.Marshal(apperr.AppStatePatch{Workspace: &apperr.WorkspacePatch{Snapshot: &workspace}})
	if err != nil {
		t.Fatalf("marshal workspace update: %v", err)
	}
	var updatedFields map[string]json.RawMessage
	if err := json.Unmarshal(updated, &updatedFields); err != nil {
		t.Fatalf("decode workspace update: %v", err)
	}
	if _, ok := updatedFields["workspace"]; !ok || string(updatedFields["workspace"]) == "null" {
		t.Fatalf("workspace update field = %s; want a snapshot object", updatedFields["workspace"])
	}
}
