// Package settings owns GoMarkEdit's typed, KV-backed settings registry.
package settings

import "github.com/sanyokkua/go_mark_edit/internal/apperr"

const (
	ThemeGlass    = "glass"
	ThemeMaterial = "material"
	ThemeMinimal  = "minimal"

	ModeAuto  = "auto"
	ModeLight = "light"
	ModeDark  = "dark"

	OpenModeEditor = "editor"
	OpenModeViewer = "viewer"

	MarkdownMinimal = "minimal"
	MarkdownGFM     = "gfm"
	MarkdownFull    = "full"

	BulletMarkerDash     = "-"
	BulletMarkerAsterisk = "*"
	BulletMarkerPlus     = "+"

	EmphasisMarkerUnderscore = "_"
	EmphasisMarkerAsterisk   = "*"

	HeadingStyleATX    = "atx"
	HeadingStyleSetext = "setext"

	RemotePolicyAsk   = "ask"
	RemotePolicyAllow = "allow"
	RemotePolicyBlock = "block"
)

// DefaultSettings returns the documented defaults for the currently exposed
// typed settings groups.
func DefaultSettings() apperr.Settings {
	return apperr.Settings{
		Appearance: apperr.AppearanceSettings{
			Theme:           ThemeMaterial,
			Mode:            ModeAuto,
			DefaultOpenMode: OpenModeEditor,
		},
		Markdown: apperr.MarkdownSettings{
			Standard:       MarkdownGFM,
			FormatOnSave:   false,
			LintOnSave:     true,
			BulletMarker:   BulletMarkerDash,
			EmphasisMarker: EmphasisMarkerUnderscore,
			HeadingStyle:   HeadingStyleATX,
		},
		ContentPrivacy: apperr.ContentPrivacySettings{
			RemotePolicy: RemotePolicyAsk,
		},
	}
}
