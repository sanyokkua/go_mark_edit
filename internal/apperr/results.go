package apperr

// AppearanceSettings contains the persisted theme and color-mode settings.
type AppearanceSettings struct {
	Theme string `json:"theme"`
	Mode  string `json:"mode"`
}

// MarkdownSettings contains the persisted Markdown-rendering settings.
type MarkdownSettings struct {
	Standard string `json:"standard"`
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
