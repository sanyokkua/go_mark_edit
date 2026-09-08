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
	DocumentID string  `json:"documentId"`
	Title      string  `json:"title"`
	Path       string  `json:"path"`
	Dirty      bool    `json:"dirty"`
	Encoding   string  `json:"encoding"`
	LineEnding string  `json:"lineEnding"`
	WordCount  int     `json:"wordCount"`
	View       DocView `json:"view"`
}

// AppStateSnapshot is the metadata-only frontend projection of the live model.
type AppStateSnapshot struct {
	Revision           uint64                      `json:"revision"`
	ApplicationVersion string                      `json:"applicationVersion"`
	Documents          map[string]DocumentMetadata `json:"documents"`
	ActiveDocumentID   string                      `json:"activeDocumentId"`
	UI                 UILayout                    `json:"ui"`
}

// ActiveBuffer carries the canonical content only during explicit state hydration.
type ActiveBuffer struct {
	DocumentID string `json:"documentId"`
	Content    string `json:"content"`
}

// AppState combines a content-free snapshot with the active canonical buffer.
type AppState struct {
	Snapshot     AppStateSnapshot `json:"snapshot"`
	ActiveBuffer ActiveBuffer     `json:"activeBuffer"`
}

// DocumentsPatch replaces upserted metadata entries and removes named ids.
type DocumentsPatch struct {
	Upsert map[string]DocumentMetadata `json:"upsert,omitempty"`
	Remove []string                    `json:"remove,omitempty"`
}

// AppStatePatch is a content-free, revisioned incremental projection update.
type AppStatePatch struct {
	Revision         uint64          `json:"revision"`
	Documents        *DocumentsPatch `json:"documents,omitempty"`
	ActiveDocumentID *string         `json:"activeDocumentId,omitempty"`
	UI               *UILayout       `json:"ui,omitempty"`
}

// StateResult is the envelope for an application-model hydration query.
type StateResult struct {
	Data  *AppState  `json:"data,omitempty"`
	Error *WireError `json:"error,omitempty"`
}
