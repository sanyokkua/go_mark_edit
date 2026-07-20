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

// Settings is the bridge DTO for the settings groups available in Stage 1.
type Settings struct {
	Appearance     AppearanceSettings     `json:"appearance"`
	Markdown       MarkdownSettings       `json:"markdown"`
	ContentPrivacy ContentPrivacySettings `json:"contentPrivacy"`
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
