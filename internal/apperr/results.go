package apperr

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

// Settings is the bridge DTO for the settings groups available in Stage 1.
type Settings struct {
	Appearance     AppearanceSettings     `json:"appearance"`
	Markdown       MarkdownSettings       `json:"markdown"`
	ContentPrivacy ContentPrivacySettings `json:"contentPrivacy"`
	Editor         EditorSettings         `json:"editor"`
}

// VoidResult is the envelope for a successful operation with no payload.
type VoidResult struct {
	Error *WireError `json:"error,omitempty"`
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
	Data  *ActiveBufferAcknowledgement `json:"data,omitempty"`
	Error *ClassifiedError             `json:"error,omitempty"`
}

// DocumentTransitionOutcome is the contract-level descriptive alias used by lifecycle callers.
type DocumentTransitionOutcome = DocumentTransitionResult

type OpenStatus string

const (
	OpenStatusCancelled OpenStatus = "cancelled"
	OpenStatusFocused   OpenStatus = "focused"
	OpenStatusOpened    OpenStatus = "opened"
	OpenStatusRefused   OpenStatus = "refused"
)

// OpenOutcome describes canonical Open without placing source in the metadata projection.
type OpenOutcome struct {
	Status             OpenStatus                   `json:"status"`
	DocumentID         string                       `json:"documentId,omitempty"`
	ProjectionRevision uint64                       `json:"projectionRevision,omitempty"`
	ActiveBuffer       *ActiveBufferAcknowledgement `json:"activeBuffer,omitempty"`
	Error              *ClassifiedError             `json:"error,omitempty"`
}

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
	OrderedDocumentIDs []string             `json:"orderedDocumentIds,omitempty"`
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
