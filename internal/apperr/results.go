package apperr

import (
	"encoding/json"
	"fmt"
	"strconv"
)

// AppearanceSettings contains the persisted appearance settings.
type AppearanceSettings struct {
	Theme           string `json:"theme"`
	Mode            string `json:"mode"`
	DefaultOpenMode string `json:"defaultOpenMode"`
}

// MarkdownSettings contains the persisted Markdown and canonical-style settings.
type MarkdownSettings struct {
	Standard       string `json:"standard"`
	FormatOnSave   bool   `json:"formatOnSave"`
	LintOnSave     bool   `json:"lintOnSave"`
	BulletMarker   string `json:"bulletMarker"`
	EmphasisMarker string `json:"emphasisMarker"`
	HeadingStyle   string `json:"headingStyle"`
}

// ContentPrivacySettings contains the persisted remote-content policy.
type ContentPrivacySettings struct {
	RemotePolicy string `json:"remotePolicy"`
}

// EditorSettings controls acknowledged display options for the source editor.
type EditorSettings struct {
	LineNumbers bool `json:"lineNumbers"`
	WordWrap    bool `json:"wordWrap"`
	FontSize    int  `json:"fontSize"`
}

// FileSettings controls file lifecycle automation.
type FileSettings struct {
	Autosave bool `json:"autosave"`
}

// Settings is the bridge DTO for the settings groups available in Stage 1.
type Settings struct {
	Appearance     AppearanceSettings     `json:"appearance"`
	Markdown       MarkdownSettings       `json:"markdown"`
	ContentPrivacy ContentPrivacySettings `json:"contentPrivacy"`
	Editor         EditorSettings         `json:"editor"`
	File           FileSettings           `json:"file"`
}

// VoidResult is the envelope for a successful operation with no payload.
type VoidResult struct {
	Error *WireError `json:"error,omitempty"`
}

// ClassifiedVoidResult is the no-payload envelope for a command whose failures
// belong to the classified category and remediation contract rather than to the
// internal wire vocabulary.
//
// VoidResult carries a WireError, whose code and Retryable flag are an internal
// taxonomy: the frontend renders it through the generic notification catalogue
// and can offer no remediation control, because a WireError names none. Native
// close needs the other shape — FR-FT-027 requires a drain failure to reach the
// user as a classified io-failure offering Retry — so it returns this instead.
type ClassifiedVoidResult struct {
	Error *ClassifiedError `json:"error,omitempty"`
}

// StringResult is the envelope for a single string payload.
type StringResult struct {
	Data  string     `json:"data"`
	Error *WireError `json:"error,omitempty"`
}

// SettingsResult is the envelope for the complete typed settings registry.
type SettingsResult struct {
	Data  *Settings  `json:"data,omitempty"`
	Error *WireError `json:"error,omitempty"`
}

// CursorPosition is a one-based document position.
type CursorPosition struct {
	Line   int `json:"line"`
	Column int `json:"column"`
}

// SelectionRange is an inclusive document range with one-based endpoints.
type SelectionRange struct {
	Start CursorPosition `json:"start"`
	End   CursorPosition `json:"end"`
}

// ScrollOffsets contains restorable editor and preview offsets.
type ScrollOffsets struct {
	Editor  int `json:"editor"`
	Preview int `json:"preview"`
}

// DocView is metadata for a document's panes and restorable editor state.
type DocView struct {
	Arrangement    string         `json:"arrangement"`
	EditorVisible  bool           `json:"editorVisible"`
	PreviewVisible bool           `json:"previewVisible"`
	Cursor         CursorPosition `json:"cursor"`
	Selection      SelectionRange `json:"selection"`
	Scroll         ScrollOffsets  `json:"scroll"`
}

// DocViewInput is the command payload used to update a document's view.
type DocViewInput struct {
	EditorVisible  bool           `json:"editorVisible"`
	PreviewVisible bool           `json:"previewVisible"`
	Cursor         CursorPosition `json:"cursor"`
	Selection      SelectionRange `json:"selection"`
	Scroll         ScrollOffsets  `json:"scroll"`
}

// UILayout is a mergeable application-level layout payload. Pointer fields
// preserve an intentional false or zero when commands and patches cross Wails.
type UILayout struct {
	WindowWidth        *int    `json:"windowWidth,omitempty"`
	WindowHeight       *int    `json:"windowHeight,omitempty"`
	WindowMaximized    *bool   `json:"windowMaximized,omitempty"`
	SidebarVisible     *bool   `json:"sidebarVisible,omitempty"`
	SidebarWidth       *int    `json:"sidebarWidth,omitempty"`
	ViewArrangement    *string `json:"viewArrangement,omitempty"`
	EditorPaneVisible  *bool   `json:"editorPaneVisible,omitempty"`
	PreviewPaneVisible *bool   `json:"previewPaneVisible,omitempty"`
	AssistantVisible   *bool   `json:"assistantVisible,omitempty"`
	AssistantWidth     *int    `json:"assistantWidth,omitempty"`
}

// DocumentMetadata is the content-free projection of one open document.
type DocumentMetadata struct {
	DocumentID      string  `json:"documentId"`
	Title           string  `json:"title"`
	Path            string  `json:"path"`
	DisplayName     string  `json:"displayName,omitempty"`
	ParentName      string  `json:"parentName,omitempty"`
	Dirty           bool    `json:"dirty"`
	Encoding        string  `json:"encoding"`
	BOM             string  `json:"bom,omitempty"`
	LineEnding      string  `json:"lineEnding"`
	WordCount       int     `json:"wordCount"`
	ContentRevision uint64  `json:"contentRevision,omitempty"`
	Capability      string  `json:"capability,omitempty"`
	SizeClass       string  `json:"sizeClass,omitempty"`
	Detached        bool    `json:"detached,omitempty"`
	ConflictBlocked bool    `json:"conflictBlocked,omitempty"`
	WriteInFlight   bool    `json:"writeInFlight,omitempty"`
	Status          string  `json:"status,omitempty"`
	View            DocView `json:"view"`
}

// AppStateSnapshot is the metadata-only frontend projection of the live model.
type AppStateSnapshot struct {
	Revision           uint64                      `json:"revision"`
	TabSetRevision     uint64                      `json:"tabSetRevision"`
	ApplicationVersion string                      `json:"applicationVersion"`
	Documents          map[string]DocumentMetadata `json:"documents"`
	OrderedDocumentIDs []string                    `json:"orderedDocumentIds"`
	ActiveDocumentID   string                      `json:"activeDocumentId,omitempty"`
	ActiveDocument     *string                     `json:"activeDocument,omitempty"`
	RecentFiles        []string                    `json:"recentFiles,omitempty"`
	CanReopenLastFile  bool                        `json:"canReopenLastFile"`
	UI                 UILayout                    `json:"ui"`
}

// ActiveBuffer carries the canonical content only during explicit state hydration.
type ActiveBuffer struct {
	DocumentID         string `json:"documentId"`
	DocumentRevision   uint64 `json:"documentRevision"`
	ProjectionRevision uint64 `json:"projectionRevision"`
	Content            string `json:"content"`
}

// ActiveBufferAcknowledgement is the identity and projection barrier for a newly active source.
type ActiveBufferAcknowledgement = ActiveBuffer

// DocumentTransitionResult is the data-or-classified-error envelope for backend New transitions.
type DocumentTransitionResult struct {
	Data     *ActiveBufferAcknowledgement `json:"data,omitempty"`
	Conflict *ConflictPreview             `json:"conflict,omitempty"`
	Error    *ClassifiedError             `json:"error,omitempty"`
}

// DocumentTransitionOutcome is the contract-level descriptive alias used by lifecycle callers.
type DocumentTransitionOutcome = DocumentTransitionResult

// TabTransitionStatus describes a backend-confirmed tab-session transition.
type TabTransitionStatus string

const (
	TabTransitionActivated TabTransitionStatus = "activated"
	TabTransitionReordered TabTransitionStatus = "reordered"
	TabTransitionClosed    TabTransitionStatus = "closed"
	TabTransitionNoop      TabTransitionStatus = "noop"
	TabTransitionRefused   TabTransitionStatus = "refused"
)

// TabTransitionResult is the order/active projection barrier returned by tab commands.
// No caller may infer a new order or active identity before this result is accepted.
type TabTransitionResult struct {
	Status             TabTransitionStatus          `json:"status"`
	DocumentID         string                       `json:"documentId,omitempty"`
	ProjectionRevision uint64                       `json:"projectionRevision,omitempty"`
	TabSetRevision     uint64                       `json:"tabSetRevision,omitempty"`
	OrderedDocumentIDs []string                     `json:"orderedDocumentIds"`
	ActiveDocumentID   string                       `json:"activeDocumentId,omitempty"`
	ActiveBuffer       *ActiveBufferAcknowledgement `json:"activeBuffer,omitempty"`
	Conflict           *ConflictPreview             `json:"conflict,omitempty"`
	Error              *ClassifiedError             `json:"error,omitempty"`
}

// TabTransitionOutcome is the contract-level name used by tab callers.
type TabTransitionOutcome = TabTransitionResult

// ClosePlanKind identifies the operation that selected a set of tabs for a
// transactional close. The backend orders the supplied targets by its own tab
// order regardless of the order in the request.
type ClosePlanKind string

const (
	ClosePlanSingle ClosePlanKind = "single"
	ClosePlanOthers ClosePlanKind = "others"
	ClosePlanRight  ClosePlanKind = "right"
	ClosePlanWindow ClosePlanKind = "window"
	ClosePlanQuit   ClosePlanKind = "quit"
)

// ClosePlanStatus is deliberately terminal for failed/cancelled plans. A
// retry must prepare a fresh revision snapshot and collect fresh choices.
type ClosePlanStatus string

const (
	ClosePlanCollecting ClosePlanStatus = "collecting"
	ClosePlanReady      ClosePlanStatus = "ready"
	ClosePlanExecuting  ClosePlanStatus = "executing"
	ClosePlanFailed     ClosePlanStatus = "failed"
	ClosePlanCancelled  ClosePlanStatus = "cancelled"
	ClosePlanComplete   ClosePlanStatus = "complete"
)

// CloseChoice is the per-document choice collected before any close side
// effect. Save all and Discard all are normalized to save/discard choices by
// the backend before execution.
type CloseChoice string

const (
	CloseChoiceSave       CloseChoice = "save"
	CloseChoiceDiscard    CloseChoice = "discard"
	CloseChoiceCancel     CloseChoice = "cancel"
	CloseChoiceSaveAll    CloseChoice = "save-all"
	CloseChoiceDiscardAll CloseChoice = "discard-all"
)

// ClosePlanDecision binds a user choice and an optional already-authorized
// write decision (for example mixed-line-ending normalization or Keep mine) to
// one exact document identity.
type ClosePlanDecision struct {
	DocumentID    string      `json:"documentId"`
	Choice        CloseChoice `json:"choice"`
	DecisionToken string      `json:"decisionToken,omitempty"`
}

// CloseTarget is a content-free immutable close-plan target snapshot. The
// normalization fields are transient requirements returned while a plan is
// being resolved; they never become application state.
type CloseTarget struct {
	DocumentID         string           `json:"documentId"`
	Title              string           `json:"title"`
	Path               string           `json:"path,omitempty"`
	SavePath           string           `json:"savePath,omitempty"`
	DisplayName        string           `json:"displayName,omitempty"`
	ContentRevision    uint64           `json:"contentRevision"`
	Dirty              bool             `json:"dirty"`
	Capability         string           `json:"capability,omitempty"`
	WriteInFlight      bool             `json:"writeInFlight,omitempty"`
	Status             string           `json:"status,omitempty"`
	Choice             CloseChoice      `json:"choice,omitempty"`
	NormalizationToken string           `json:"normalizationToken,omitempty"`
	ProposedEnding     string           `json:"proposedEnding,omitempty"`
	Conflict           *ConflictPreview `json:"conflict,omitempty"`
}

// ClosePlanSummary is the only data returned to a caller while a close plan
// is being collected or executed. Targets are always in authoritative tab
// order and contain no source copy.
type ClosePlanSummary struct {
	ID             string          `json:"id"`
	Kind           ClosePlanKind   `json:"kind"`
	TabSetRevision uint64          `json:"tabSetRevision"`
	Targets        []CloseTarget   `json:"targets"`
	DirtyTargetIDs []string        `json:"dirtyTargetIds,omitempty"`
	Status         ClosePlanStatus `json:"status"`
}

// ClosePlanResult carries a plan summary or a classified refusal. Execution
// returns the final TabTransitionResult after the summary reaches complete.
type ClosePlanResult struct {
	Data  *ClosePlanSummary `json:"data,omitempty"`
	Error *ClassifiedError  `json:"error,omitempty"`
}

type PathCommandStatus string

const (
	PathCommandCopied      PathCommandStatus = "copied"
	PathCommandRevealed    PathCommandStatus = "revealed"
	PathCommandUnavailable PathCommandStatus = "unavailable"
	PathCommandRefused     PathCommandStatus = "refused"
)

// PathCommandResult contains only the explicit command outcome. The canonical path
// is deliberately not returned: CopyPath hands it to the injected clipboard port.
type PathCommandResult struct {
	Status PathCommandStatus `json:"status"`
	Error  *ClassifiedError  `json:"error,omitempty"`
}

type CopyPathResult = PathCommandResult
type RevealResult = PathCommandResult

type LineEndingOutcome string

const (
	LineEndingPreservedLF    LineEndingOutcome = "preserved-lf"
	LineEndingPreservedCRLF  LineEndingOutcome = "preserved-crlf"
	LineEndingNormalizedLF   LineEndingOutcome = "normalized-lf"
	LineEndingNormalizedCRLF LineEndingOutcome = "normalized-crlf"
	LineEndingNewLF          LineEndingOutcome = "new-lf"
)

type BOMOutcome string

const (
	BOMOutcomePreserved BOMOutcome = "preserved"
	BOMOutcomeAbsent    BOMOutcome = "absent"
)

// CommittedWriteOutcome records the irreversible disk result and the projection barrier state.
type CommittedWriteOutcome struct {
	DocumentID                  string            `json:"documentId"`
	WrittenContentRevision      uint64            `json:"writtenContentRevision"`
	CommittedProjectionRevision uint64            `json:"committedProjectionRevision"`
	TargetPath                  string            `json:"targetPath,omitempty"`
	TargetPathAdopted           bool              `json:"targetPathAdopted"`
	LineEndingOutcome           LineEndingOutcome `json:"lineEndingOutcome"`
	BOMOutcome                  BOMOutcome        `json:"bomOutcome"`
	ResyncRequired              bool              `json:"resyncRequired"`
}

type CommittedWriteResult struct {
	Data  *CommittedWriteOutcome `json:"data,omitempty"`
	Error *ClassifiedError       `json:"error,omitempty"`
}

type WriteStatus string

const (
	WriteStatusCommitted          WriteStatus = "committed"
	WriteStatusCancelled          WriteStatus = "cancelled"
	WriteStatusNeedsNormalization WriteStatus = "needs-normalization"
	WriteStatusConflict           WriteStatus = "conflict"
	WriteStatusRefused            WriteStatus = "refused"
)

// WriteResult distinguishes a committed disk replacement from a cancelled,
// authorization, conflict, or classified refusal outcome.
type WriteResult struct {
	Status           WriteStatus            `json:"status"`
	Data             *CommittedWriteOutcome `json:"data,omitempty"`
	DecisionToken    string                 `json:"decisionToken,omitempty"`
	ProposedEnding   string                 `json:"proposedEnding,omitempty"`
	DocumentRevision uint64                 `json:"documentRevision,omitempty"`
	Conflict         *ConflictPreview       `json:"conflict,omitempty"`
	Error            *ClassifiedError       `json:"error,omitempty"`
}

// DiskVersion is the bridge-safe representation of a filesystem version. It
// intentionally contains only portable stat facts and a stable identity.
type DiskVersion struct {
	Exists           bool   `json:"exists"`
	Size             int64  `json:"size"`
	ModifiedUnixNano int64  `json:"modifiedUnixNano"`
	Mode             uint32 `json:"mode"`
	FileIdentity     string `json:"fileIdentity,omitempty"`
}

// MarshalJSON encodes the nanosecond timestamp as text so the JavaScript
// bridge does not round an int64 beyond Number.MAX_SAFE_INTEGER.
func (version DiskVersion) MarshalJSON() ([]byte, error) {
	type wireDiskVersion struct {
		Exists           bool   `json:"exists"`
		Size             int64  `json:"size"`
		ModifiedUnixNano string `json:"modifiedUnixNano"`
		Mode             uint32 `json:"mode"`
		FileIdentity     string `json:"fileIdentity,omitempty"`
	}
	return json.Marshal(wireDiskVersion{
		Exists:           version.Exists,
		Size:             version.Size,
		ModifiedUnixNano: strconv.FormatInt(version.ModifiedUnixNano, 10),
		Mode:             version.Mode,
		FileIdentity:     version.FileIdentity,
	})
}

// UnmarshalJSON accepts both the current string form and the legacy numeric
// form so persisted or mock bridge payloads remain readable during rollout.
func (version *DiskVersion) UnmarshalJSON(data []byte) error {
	type wireDiskVersion struct {
		Exists           bool            `json:"exists"`
		Size             int64           `json:"size"`
		ModifiedUnixNano json.RawMessage `json:"modifiedUnixNano"`
		Mode             uint32          `json:"mode"`
		FileIdentity     string          `json:"fileIdentity,omitempty"`
	}
	var wire wireDiskVersion
	if err := json.Unmarshal(data, &wire); err != nil {
		return err
	}
	modifiedUnixNano, err := parseDiskVersionTimestamp(wire.ModifiedUnixNano)
	if err != nil {
		return err
	}
	*version = DiskVersion{
		Exists:           wire.Exists,
		Size:             wire.Size,
		ModifiedUnixNano: modifiedUnixNano,
		Mode:             wire.Mode,
		FileIdentity:     wire.FileIdentity,
	}
	return nil
}

func parseDiskVersionTimestamp(raw json.RawMessage) (int64, error) {
	if len(raw) == 0 || string(raw) == "null" {
		return 0, nil
	}
	var text string
	if err := json.Unmarshal(raw, &text); err == nil {
		value, parseErr := strconv.ParseInt(text, 10, 64)
		if parseErr != nil {
			return 0, fmt.Errorf("parse modifiedUnixNano: %w", parseErr)
		}
		return value, nil
	}
	var value int64
	if err := json.Unmarshal(raw, &value); err != nil {
		return 0, fmt.Errorf("parse modifiedUnixNano: %w", err)
	}
	return value, nil
}

// ConflictPreviewSide is bounded transient comparison text. It is never part
// of the metadata projection or persisted state.
type ConflictPreviewSide struct {
	Text      string `json:"text"`
	LineCount int    `json:"lineCount"`
	ByteCount int    `json:"byteCount"`
	Truncated bool   `json:"truncated"`
}

// ConflictPreview carries the exact revision/version pair shown by one
// external-change decision. MetadataDifferences is used when canonical text is
// equal but raw characteristics differ.
type ConflictPreview struct {
	DocumentID          string              `json:"documentId"`
	Path                string              `json:"path,omitempty"`
	DisplayName         string              `json:"displayName,omitempty"`
	ContentRevision     uint64              `json:"contentRevision"`
	DetectedDiskVersion DiskVersion         `json:"detectedDiskVersion"`
	OnDisk              ConflictPreviewSide `json:"onDisk"`
	Yours               ConflictPreviewSide `json:"yours"`
	MetadataDifferences []string            `json:"metadataDifferences,omitempty"`
	ReadOnly            bool                `json:"readOnly"`
}

// ConflictStatus is the typed outcome of a foreground external-change
// check or one of its revision-bound decisions.
type ConflictStatus string

const (
	ConflictStatusUnchanged  ConflictStatus = "unchanged"
	ConflictStatusDetected   ConflictStatus = "detected"
	ConflictStatusReloaded   ConflictStatus = "reloaded"
	ConflictStatusAuthorized ConflictStatus = "authorized"
	ConflictStatusSkipped    ConflictStatus = "skipped"
	ConflictStatusCancelled  ConflictStatus = "cancelled"
	ConflictStatusDetached   ConflictStatus = "detached"
	ConflictStatusUnstable   ConflictStatus = "unstable"
	ConflictStatusRefused    ConflictStatus = "refused"
)

// ConflictResult is returned separately from WriteResult so foreground checks
// and reload/decision commands can share the same safe envelope.
type ConflictResult struct {
	Status             ConflictStatus               `json:"status"`
	DocumentID         string                       `json:"documentId,omitempty"`
	ProjectionRevision uint64                       `json:"projectionRevision,omitempty"`
	DocumentRevision   uint64                       `json:"documentRevision,omitempty"`
	DecisionToken      string                       `json:"decisionToken,omitempty"`
	ActiveBuffer       *ActiveBufferAcknowledgement `json:"activeBuffer,omitempty"`
	Preview            *ConflictPreview             `json:"preview,omitempty"`
	Error              *ClassifiedError             `json:"error,omitempty"`
}

type OpenStatus string

const (
	OpenStatusCancelled OpenStatus = "cancelled"
	OpenStatusFocused   OpenStatus = "focused"
	OpenStatusOpened    OpenStatus = "opened"
	OpenStatusRefused   OpenStatus = "refused"
)

// OpenResult describes canonical Open without placing source in the metadata projection.
type OpenResult struct {
	Status             OpenStatus                   `json:"status"`
	DocumentID         string                       `json:"documentId,omitempty"`
	ProjectionRevision uint64                       `json:"projectionRevision,omitempty"`
	ActiveBuffer       *ActiveBufferAcknowledgement `json:"activeBuffer,omitempty"`
	Error              *ClassifiedError             `json:"error,omitempty"`
}

// OpenOutcome is the contract-level descriptive alias used by appmodel callers.
type OpenOutcome = OpenResult

// AppState combines a content-free snapshot with the active canonical buffer.
type AppState struct {
	Snapshot     AppStateSnapshot `json:"snapshot"`
	ActiveBuffer *ActiveBuffer    `json:"activeBuffer,omitempty"`
}

// ActiveDocumentPatch explicitly represents both activation and clearing. A nil
// patch member means that activation did not change.
type ActiveDocumentPatch struct {
	Present    bool   `json:"present"`
	DocumentID string `json:"documentId,omitempty"`
}

// DocumentsPatch replaces upserted metadata entries and removes named ids.
type DocumentsPatch struct {
	Upsert map[string]DocumentMetadata `json:"upsert,omitempty"`
	Remove []string                    `json:"remove,omitempty"`
}

// AppStatePatch is a content-free, revisioned incremental projection update.
type AppStatePatch struct {
	Revision           uint64               `json:"revision"`
	TabSetRevision     *uint64              `json:"tabSetRevision,omitempty"`
	OrderedDocumentIDs []string             `json:"orderedDocumentIds"`
	Documents          *DocumentsPatch      `json:"documents,omitempty"`
	ActiveDocumentID   *string              `json:"activeDocumentId,omitempty"`
	ActiveDocument     *ActiveDocumentPatch `json:"activeDocument,omitempty"`
	RecentFiles        []string             `json:"recentFiles,omitempty"`
	CanReopenLastFile  *bool                `json:"canReopenLastFile,omitempty"`
	UI                 *UILayout            `json:"ui,omitempty"`
}

// StateResult is the envelope for an application-model hydration query.
type StateResult struct {
	Data  *AppState  `json:"data,omitempty"`
	Error *WireError `json:"error,omitempty"`
}
