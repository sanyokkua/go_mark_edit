package settings

import (
	"context"
	"testing"

	"github.com/sanyokkua/go_mark_edit/internal/apperr"
)

// Proves: STORY-005-AC-3
// Missing and malformed values from every initial group are normalized to the documented defaults.
func TestInvalidOrMissingSettingFallsBackToDefault(t *testing.T) {
	t.Parallel()

	defaults := DefaultSettings()
	testCases := []struct {
		name       string
		repository fakeSettingsRepository
	}{
		{
			name: "missing string scalar values with documented bools",
			repository: fakeSettingsRepository{
				markdown: apperr.MarkdownSettings{
					FormatOnSave: defaults.Markdown.FormatOnSave,
					LintOnSave:   defaults.Markdown.LintOnSave,
				},
			},
		},
		{
			name: "malformed scalar values",
			repository: fakeSettingsRepository{
				appearance:     apperr.AppearanceSettings{Theme: "neon", Mode: "midnight"},
				markdown:       apperr.MarkdownSettings{Standard: "commonmark-plus", FormatOnSave: defaults.Markdown.FormatOnSave, LintOnSave: defaults.Markdown.LintOnSave},
				contentPrivacy: apperr.ContentPrivacySettings{RemotePolicy: "sometimes"},
			},
		},
	}

	for _, testCase := range testCases {
		t.Run(testCase.name, func(t *testing.T) {
			service := NewSettingsService(&testCase.repository)

			got, err := service.Get(context.Background())
			if err != nil {
				t.Fatalf("get settings: %v", err)
			}
			if got != defaults {
				t.Fatalf("normalized settings = %+v, want documented defaults %+v", got, defaults)
			}
		})
	}
}

type fakeSettingsRepository struct {
	appearance        apperr.AppearanceSettings
	markdown          apperr.MarkdownSettings
	contentPrivacy    apperr.ContentPrivacySettings
	panicOperation    string
	appearanceUpdates int
	markdownUpdates   int
}

func (repository *fakeSettingsRepository) GetAppearance(context.Context) (apperr.AppearanceSettings, error) {
	if repository.panicOperation == "get appearance" {
		panic("get appearance")
	}
	return repository.appearance, nil
}

func (repository *fakeSettingsRepository) GetMarkdown(context.Context) (apperr.MarkdownSettings, error) {
	if repository.panicOperation == "get markdown" {
		panic("get markdown")
	}
	return repository.markdown, nil
}

func (repository *fakeSettingsRepository) GetContentPrivacy(context.Context) (apperr.ContentPrivacySettings, error) {
	if repository.panicOperation == "get content privacy" {
		panic("get content privacy")
	}
	return repository.contentPrivacy, nil
}

func (repository *fakeSettingsRepository) UpdateAppearance(_ context.Context, appearance apperr.AppearanceSettings) error {
	if repository.panicOperation == "update appearance" {
		panic("update appearance")
	}
	repository.appearanceUpdates++
	repository.appearance = appearance
	return nil
}

func (repository *fakeSettingsRepository) UpdateMarkdown(_ context.Context, markdown apperr.MarkdownSettings) error {
	if repository.panicOperation == "update markdown" {
		panic("update markdown")
	}
	repository.markdownUpdates++
	repository.markdown = markdown
	return nil
}

func (repository *fakeSettingsRepository) UpdateContentPrivacy(_ context.Context, contentPrivacy apperr.ContentPrivacySettings) error {
	if repository.panicOperation == "update content privacy" {
		panic("update content privacy")
	}
	repository.contentPrivacy = contentPrivacy
	return nil
}

var _ SettingsRepositoryAPI = (*fakeSettingsRepository)(nil)
