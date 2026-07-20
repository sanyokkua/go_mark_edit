// Package settings owns GoMarkEdit's typed, KV-backed settings registry.
package settings

import "github.com/sanyokkua/go_mark_edit/internal/apperr"

const (
	ThemeLiquidGlass = "liquid-glass"
	ThemeMaterial    = "material"
	ThemeMinimal     = "minimal"

	ModeAuto  = "auto"
	ModeLight = "light"
	ModeDark  = "dark"

	MarkdownMinimal = "minimal"
	MarkdownGFM     = "gfm"
	MarkdownFull    = "full"

	RemotePolicyAsk   = "ask"
	RemotePolicyAllow = "allow"
	RemotePolicyBlock = "block"
)

// DefaultSettings returns the documented defaults for the currently exposed
// typed settings groups.
func DefaultSettings() apperr.Settings {
	return apperr.Settings{
		Appearance: apperr.AppearanceSettings{
			Theme: ThemeMaterial,
			Mode:  ModeAuto,
		},
		Markdown: apperr.MarkdownSettings{
			Standard: MarkdownGFM,
		},
		ContentPrivacy: apperr.ContentPrivacySettings{
			RemotePolicy: RemotePolicyAsk,
		},
	}
}
