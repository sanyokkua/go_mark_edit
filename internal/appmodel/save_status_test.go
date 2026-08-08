package appmodel

import (
	"testing"

	"github.com/sanyokkua/go_mark_edit/internal/apperr"
)

func TestSaveStatusPrecedenceTable(t *testing.T) {
	tests := []struct {
		name string
		doc  openDocument
		want SaveStatus
	}{
		{name: "read-only wins", doc: statusDocument("content", "content", "unsafe-read-only", SaveOriginExplicitSave), want: SaveStatusReadOnly},
		{name: "empty untitled", doc: statusDocument("", "", "writable", SaveOriginNone), want: SaveStatusNotSaved},
		{name: "nonempty untitled", doc: statusDocument("content", "", "writable", SaveOriginNone), want: SaveStatusUnsavedChanges},
		{name: "dirty path", doc: statusDocument("edited", "clean", "writable", SaveOriginOpen), want: SaveStatusUnsavedChanges},
		{name: "detached path", doc: func() openDocument {
			doc := statusDocument("clean", "clean", "writable", SaveOriginOpen)
			doc.detached = true
			return doc
		}(), want: SaveStatusUnsavedChanges},
		{name: "failed write", doc: func() openDocument {
			doc := statusDocument("clean", "clean", "writable", SaveOriginOpen)
			doc.failedWrite = true
			return doc
		}(), want: SaveStatusUnsavedChanges},
		{name: "newer than committed", doc: func() openDocument {
			doc := statusDocument("edited", "clean", "writable", SaveOriginExplicitSave)
			doc.metadata.ContentRevision = 2
			doc.committedRevision = 1
			return doc
		}(), want: SaveStatusUnsavedChanges},
		{name: "saved baseline", doc: statusDocument("clean", "clean", "writable", SaveOriginExplicitSave), want: SaveStatusSaved},
		{name: "autosaved baseline", doc: statusDocument("clean", "clean", "writable", SaveOriginAutosave), want: SaveStatusAutosaved},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			if got := saveStatusForDocument(&test.doc); got != test.want {
				t.Fatalf("saveStatusForDocument() = %q, want %q", got, test.want)
			}
		})
	}
}

func TestBaselineOriginRestoresCleanLabel(t *testing.T) {
	for _, test := range []struct {
		origin SaveOrigin
		want   SaveStatus
	}{
		{origin: SaveOriginOpen, want: SaveStatusSaved},
		{origin: SaveOriginReload, want: SaveStatusSaved},
		{origin: SaveOriginExplicitSave, want: SaveStatusSaved},
		{origin: SaveOriginSaveAs, want: SaveStatusSaved},
		{origin: SaveOriginAutosave, want: SaveStatusAutosaved},
	} {
		t.Run(string(test.origin), func(t *testing.T) {
			doc := statusDocument("base", "base", "writable", test.origin)
			doc.metadata.ContentRevision = 2
			doc.committedRevision = 1
			doc.content = "edited"
			if got := saveStatusForDocument(&doc); got != SaveStatusUnsavedChanges {
				t.Fatalf("edited status = %q, want %q", got, SaveStatusUnsavedChanges)
			}
			doc.content = "base"
			doc.metadata.ContentRevision = doc.committedRevision
			if got := saveStatusForDocument(&doc); got != test.want {
				t.Fatalf("returned-baseline status = %q, want %q", got, test.want)
			}
		})
	}
}

func TestFailedWriteLeavesStatusUnchanged(t *testing.T) {
	doc := statusDocument("edited", "clean", "writable", SaveOriginOpen)
	doc.metadata.ContentRevision = 2
	doc.committedRevision = 1
	before := saveStatusForDocument(&doc)
	markFailedWrite(&doc)
	if got := saveStatusForDocument(&doc); got != before {
		t.Fatalf("failed-write status = %q, want unchanged %q", got, before)
	}
	if doc.baseline != "clean" || doc.content != "edited" {
		t.Fatalf("failed write changed source truth: baseline=%q content=%q", doc.baseline, doc.content)
	}
}

func statusDocument(content, baseline, capability string, origin SaveOrigin) openDocument {
	return openDocument{
		metadata: apperr.DocumentMetadata{Capability: capability, ContentRevision: 1, Path: func() string {
			if origin == SaveOriginNone {
				return ""
			}
			return "/documents/document.md"
		}()},
		content: content, baseline: baseline, baselineOrigin: origin, committedRevision: 1,
	}
}
