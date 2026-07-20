package settings

import (
	"context"
	"reflect"
	"testing"

	"github.com/sanyokkua/go_mark_edit/internal/apperr"
)

// Proves: STORY-009-AC-3
// Unsupported Appearance and Markdown enum/style members return validation envelopes without writing any part of their group.
func TestSettingsHandlerRejectsUnsupportedGroupUpdatesWithoutWriting(t *testing.T) {
	original := apperr.Settings{
		Appearance: apperr.AppearanceSettings{Theme: ThemeMinimal, Mode: ModeLight, DefaultOpenMode: OpenModeViewer},
		Markdown: apperr.MarkdownSettings{
			Standard:       MarkdownMinimal,
			FormatOnSave:   true,
			LintOnSave:     false,
			BulletMarker:   BulletMarkerAsterisk,
			EmphasisMarker: EmphasisMarkerAsterisk,
			HeadingStyle:   HeadingStyleSetext,
		},
		ContentPrivacy: apperr.ContentPrivacySettings{RemotePolicy: RemotePolicyAllow},
	}

	t.Run("appearance enum values", func(t *testing.T) {
		testCases := []struct {
			name  string
			input apperr.AppearanceSettings
		}{
			{name: "theme", input: apperr.AppearanceSettings{Theme: "vaporwave", Mode: original.Appearance.Mode, DefaultOpenMode: original.Appearance.DefaultOpenMode}},
			{name: "mode", input: apperr.AppearanceSettings{Theme: original.Appearance.Theme, Mode: "midnight", DefaultOpenMode: original.Appearance.DefaultOpenMode}},
			{name: "default open mode", input: apperr.AppearanceSettings{Theme: original.Appearance.Theme, Mode: original.Appearance.Mode, DefaultOpenMode: "split"}},
		}
		for _, testCase := range testCases {
			t.Run(testCase.name, func(t *testing.T) {
				repository := fakeSettingsRepository{appearance: original.Appearance, markdown: original.Markdown, contentPrivacy: original.ContentPrivacy}
				handler := NewSettingsHandler(NewSettingsService(&repository), nil, nil)

				result := handler.UpdateAppearance(testCase.input)
				if result.Error == nil || result.Error.Code != apperr.CodeValidation {
					t.Fatalf("invalid appearance envelope = %+v, want validation error", result)
				}
				if repository.appearance != original.Appearance || repository.appearanceUpdates != 0 {
					t.Fatalf("appearance after rejected update = %+v with %d writes, want %+v and zero writes", repository.appearance, repository.appearanceUpdates, original.Appearance)
				}
			})
		}
	})

	t.Run("markdown enum and style values", func(t *testing.T) {
		testCases := []struct {
			name  string
			input apperr.MarkdownSettings
		}{
			{name: "standard", input: apperr.MarkdownSettings{Standard: "plain-text", FormatOnSave: original.Markdown.FormatOnSave, LintOnSave: original.Markdown.LintOnSave, BulletMarker: original.Markdown.BulletMarker, EmphasisMarker: original.Markdown.EmphasisMarker, HeadingStyle: original.Markdown.HeadingStyle}},
			{name: "bullet marker", input: apperr.MarkdownSettings{Standard: original.Markdown.Standard, FormatOnSave: original.Markdown.FormatOnSave, LintOnSave: original.Markdown.LintOnSave, BulletMarker: "•", EmphasisMarker: original.Markdown.EmphasisMarker, HeadingStyle: original.Markdown.HeadingStyle}},
			{name: "emphasis marker", input: apperr.MarkdownSettings{Standard: original.Markdown.Standard, FormatOnSave: original.Markdown.FormatOnSave, LintOnSave: original.Markdown.LintOnSave, BulletMarker: original.Markdown.BulletMarker, EmphasisMarker: "~", HeadingStyle: original.Markdown.HeadingStyle}},
			{name: "heading style", input: apperr.MarkdownSettings{Standard: original.Markdown.Standard, FormatOnSave: original.Markdown.FormatOnSave, LintOnSave: original.Markdown.LintOnSave, BulletMarker: original.Markdown.BulletMarker, EmphasisMarker: original.Markdown.EmphasisMarker, HeadingStyle: "underlined"}},
		}
		for _, testCase := range testCases {
			t.Run(testCase.name, func(t *testing.T) {
				repository := fakeSettingsRepository{appearance: original.Appearance, markdown: original.Markdown, contentPrivacy: original.ContentPrivacy}
				handler := NewSettingsHandler(NewSettingsService(&repository), nil, nil)

				result := handler.UpdateMarkdown(testCase.input)
				if result.Error == nil || result.Error.Code != apperr.CodeValidation {
					t.Fatalf("invalid markdown envelope = %+v, want validation error", result)
				}
				if repository.markdown != original.Markdown || repository.markdownUpdates != 0 {
					t.Fatalf("markdown after rejected update = %+v with %d writes, want %+v and zero writes", repository.markdown, repository.markdownUpdates, original.Markdown)
				}
			})
		}
	})
}

// Proves: STORY-005-AC-1
// The Wails surface returns only concrete envelopes, has no context argument, and recovers repository panics without partial data.
func TestSettingsHandlerReturnsRecoveredResultEnvelope(t *testing.T) {
	t.Parallel()

	t.Run("success", func(t *testing.T) {
		want := DefaultSettings()
		handler := NewSettingsHandler(NewSettingsService(&fakeSettingsRepository{
			appearance:     want.Appearance,
			markdown:       want.Markdown,
			contentPrivacy: want.ContentPrivacy,
		}), nil, func() context.Context { return context.Background() })

		got := handler.GetSettings()
		if got.Error != nil {
			t.Fatalf("success envelope error = %+v", got.Error)
		}
		if got.Data == nil || *got.Data != want {
			t.Fatalf("success envelope data = %+v, want %+v", got.Data, want)
		}
	})

	t.Run("panic is internal with no partial data", func(t *testing.T) {
		handler := NewSettingsHandler(NewSettingsService(&fakeSettingsRepository{panicOperation: "get appearance"}), nil, nil)

		got := handler.GetSettings()
		if got.Data != nil {
			t.Fatalf("panic envelope data = %+v, want nil", got.Data)
		}
		if got.Error == nil || got.Error.Code != apperr.CodeInternal {
			t.Fatalf("panic envelope error = %+v, want internal", got.Error)
		}
	})

	t.Run("all bound methods recover panics", func(t *testing.T) {
		panicCases := []struct {
			name string
			call func(*SettingsHandler) *apperr.WireError
		}{
			{
				name: "update appearance",
				call: func(handler *SettingsHandler) *apperr.WireError {
					return handler.UpdateAppearance(DefaultSettings().Appearance).Error
				},
			},
			{
				name: "update markdown",
				call: func(handler *SettingsHandler) *apperr.WireError {
					return handler.UpdateMarkdown(DefaultSettings().Markdown).Error
				},
			},
			{
				name: "update content privacy",
				call: func(handler *SettingsHandler) *apperr.WireError {
					return handler.UpdateContentPrivacy(DefaultSettings().ContentPrivacy).Error
				},
			},
		}
		for _, panicCase := range panicCases {
			t.Run(panicCase.name, func(t *testing.T) {
				handler := NewSettingsHandler(NewSettingsService(&fakeSettingsRepository{panicOperation: panicCase.name}), nil, nil)

				wire := panicCase.call(handler)
				if wire == nil || wire.Code != apperr.CodeInternal {
					t.Fatalf("panic envelope error = %+v, want internal", wire)
				}
			})
		}
	})

	t.Run("bound methods take no handler context", func(t *testing.T) {
		handlerType := reflect.TypeOf((*SettingsHandler)(nil))
		contextType := reflect.TypeOf((*context.Context)(nil)).Elem()
		methods := map[string]reflect.Type{
			"GetSettings":          reflect.TypeOf(apperr.SettingsResult{}),
			"UpdateAppearance":     reflect.TypeOf(apperr.VoidResult{}),
			"UpdateMarkdown":       reflect.TypeOf(apperr.VoidResult{}),
			"UpdateContentPrivacy": reflect.TypeOf(apperr.VoidResult{}),
		}
		for name, resultType := range methods {
			method, ok := handlerType.MethodByName(name)
			if !ok {
				t.Fatalf("SettingsHandler has no bound method %s", name)
			}
			if method.Type.NumOut() != 1 || method.Type.Out(0) != resultType {
				t.Fatalf("%s result signature = %s, want one %s", name, method.Type, resultType)
			}
			for index := 1; index < method.Type.NumIn(); index++ {
				if method.Type.In(index) == contextType {
					t.Fatalf("%s accepts context.Context at argument %d", name, index)
				}
			}
		}
	})
}
