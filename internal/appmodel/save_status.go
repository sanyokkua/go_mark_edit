package appmodel

import "github.com/sanyokkua/go_mark_edit/internal/file"

// SaveStatus is the authoritative five-value document status projected to the UI.
type SaveStatus string

const (
	SaveStatusNotSaved       SaveStatus = "not-saved"
	SaveStatusUnsavedChanges SaveStatus = "unsaved-changes"
	SaveStatusSaved          SaveStatus = "saved"
	SaveStatusAutosaved      SaveStatus = "autosaved"
	SaveStatusReadOnly       SaveStatus = "read-only"
)

// SaveOrigin identifies the operation that established a clean disk baseline.
type SaveOrigin string

const (
	SaveOriginOpen         SaveOrigin = "open"
	SaveOriginReload       SaveOrigin = "reload"
	SaveOriginExplicitSave SaveOrigin = "explicit-save"
	SaveOriginSaveAs       SaveOrigin = "save-as"
	SaveOriginAutosave     SaveOrigin = "autosave"
)

func saveStatusForDocument(document *openDocument) SaveStatus {
	if document.metadata.Capability != "" && document.metadata.Capability != string(file.CapabilityWritable) {
		return SaveStatusReadOnly
	}
	if document.metadata.Path == "" && document.content == "" {
		return SaveStatusNotSaved
	}
	if document.content != document.baseline || document.detached || (document.metadata.Path == "" && document.content != "") || document.failedWrite || document.metadata.ContentRevision > document.committedRevision {
		return SaveStatusUnsavedChanges
	}
	if document.baselineOrigin == SaveOriginAutosave {
		return SaveStatusAutosaved
	}
	return SaveStatusSaved
}

func markFailedWrite(document *openDocument) {
	document.failedWrite = true
	document.metadata.Dirty = true
}

func applyCommittedBaseline(document *openDocument, snapshot WriteSnapshot, version file.DiskVersion, origin SaveOrigin) {
	document.baseline = snapshot.CanonicalContent
	document.baselineVersion = version
	document.baselineOrigin = origin
	document.committedRevision = snapshot.ContentRevision
	document.failedWrite = false
	document.metadata.Dirty = document.content != document.baseline
}
