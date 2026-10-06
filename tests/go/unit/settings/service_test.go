package settings_test

import (
	"context"
	. "github.com/sanyokkua/go_mark_edit/internal/settings"
	"testing"

	"github.com/sanyokkua/go_mark_edit/internal/apperr"
)

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
				appearance:     apperr.AppearanceSettings{Theme: "neon", Mode: "midnight", DefaultOpenMode: "split", ReadingWidth: "wide"},
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
			if got.Markdown.Standard != MarkdownFull {
				t.Fatalf("normalized Markdown standard = %q, want full", got.Markdown.Standard)
			}
		})
	}
}

func TestDefaultMarkdownSettings(t *testing.T) {
	got := DefaultSettings().Markdown
	want := apperr.MarkdownSettings{
		Standard:       MarkdownFull,
		BulletMarker:   BulletMarkerDash,
		EmphasisMarker: EmphasisMarkerUnderscore,
		HeadingStyle:   HeadingStyleATX,
		FormatOnSave:   false,
		LintOnSave:     true,
	}
	if got != want {
		t.Fatalf("default Markdown settings = %+v, want %+v", got, want)
	}
}

func TestUpdateMarkdownPreservesValidStandardsAndPreferences(t *testing.T) {
	for _, standard := range []string{MarkdownMinimal, MarkdownGFM} {
		t.Run(standard, func(t *testing.T) {
			repository := &fakeSettingsRepository{}
			service := NewSettingsService(repository)
			want := apperr.MarkdownSettings{
				Standard:       standard,
				BulletMarker:   BulletMarkerPlus,
				EmphasisMarker: EmphasisMarkerAsterisk,
				HeadingStyle:   HeadingStyleSetext,
				FormatOnSave:   true,
				LintOnSave:     false,
			}
			if err := service.UpdateMarkdown(context.Background(), want); err != nil {
				t.Fatalf("update Markdown settings: %v", err)
			}
			got, err := service.Get(context.Background())
			if err != nil {
				t.Fatalf("read Markdown settings: %v", err)
			}
			if got.Markdown != want {
				t.Fatalf("Markdown settings = %+v, want %+v", got.Markdown, want)
			}
		})
	}
}

func TestAppearanceUsesTheGlassValueAndReadsTheRetiredValue(t *testing.T) {

	t.Run("accepts glass for an appearance update", func(t *testing.T) {
		repository := fakeSettingsRepository{}
		service := NewSettingsService(&repository)
		appearance := apperr.AppearanceSettings{
			Theme:           "glass",
			Mode:            ModeDark,
			DefaultOpenMode: OpenModeEditor,
			ReadingWidth:    ReadingWidthFull,
		}

		if err := service.UpdateAppearance(context.Background(), appearance); err != nil {
			t.Fatalf("update glass appearance: %v", err)
		}
		if repository.appearance != appearance {
			t.Fatalf("stored appearance = %+v, want %+v", repository.appearance, appearance)
		}
	})

	t.Run("normalizes retired liquid-glass storage to glass", func(t *testing.T) {
		service := NewSettingsService(&fakeSettingsRepository{
			appearance: apperr.AppearanceSettings{
				Theme:           "liquid-glass",
				Mode:            ModeLight,
				DefaultOpenMode: OpenModeEditor,
				ReadingWidth:    ReadingWidthFull,
			},
		})

		got, err := service.Get(context.Background())
		if err != nil {
			t.Fatalf("read retired appearance: %v", err)
		}
		if got.Appearance.Theme != "glass" {
			t.Fatalf("normalized theme = %q, want glass", got.Appearance.Theme)
		}
	})
}

type fakeSettingsRepository struct {
	appearance        apperr.AppearanceSettings
	markdown          apperr.MarkdownSettings
	contentPrivacy    apperr.ContentPrivacySettings
	editor            apperr.EditorSettings
	file              apperr.FileSettings
	fileSet           bool
	panicOperation    string
	appearanceUpdates int
	markdownUpdates   int
	resetError        error
	fileUpdateError   error
}

func TestAutosaveSettingDefaultAndPersistence(t *testing.T) {
	repository := &fakeSettingsRepository{}
	service := NewSettingsService(repository)

	got, err := service.Get(context.Background())
	if err != nil {
		t.Fatalf("get default autosave setting: %v", err)
	}
	if !got.File.Autosave {
		t.Fatal("default autosave = false, want true")
	}

	want := apperr.FileSettings{Autosave: false}
	if err := service.UpdateFile(context.Background(), want); err != nil {
		t.Fatalf("persist autosave setting: %v", err)
	}
	if !repository.fileSet || repository.file != want {
		t.Fatalf("persisted autosave = %+v (set=%t), want %+v", repository.file, repository.fileSet, want)
	}
	got, err = service.Get(context.Background())
	if err != nil {
		t.Fatalf("get persisted autosave setting: %v", err)
	}
	if got.File != want {
		t.Fatalf("round-tripped autosave = %+v, want %+v", got.File, want)
	}
}

func TestAutosaveRejectsUnacknowledgedChange(t *testing.T) {
	repository := &fakeSettingsRepository{
		file:            DefaultSettings().File,
		fileSet:         true,
		fileUpdateError: context.DeadlineExceeded,
	}
	service := NewSettingsService(repository)

	err := service.UpdateFile(context.Background(), apperr.FileSettings{Autosave: false})
	if err == nil {
		t.Fatal("autosave update succeeded despite persistence failure")
	}
	got, getErr := service.Get(context.Background())
	if getErr != nil {
		t.Fatalf("get autosave after rejected update: %v", getErr)
	}
	if !got.File.Autosave {
		t.Fatalf("autosave changed before persistence acknowledgement: %+v", got.File)
	}
}

func (repository *fakeSettingsRepository) ResetAppearance(context.Context) error {
	if repository.panicOperation == "reset appearance" {
		panic("reset appearance")
	}
	if repository.resetError != nil {
		return repository.resetError
	}
	repository.appearance = DefaultSettings().Appearance
	return nil
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

func (repository *fakeSettingsRepository) GetEditor(context.Context) (apperr.EditorSettings, error) {
	if repository.panicOperation == "get editor" {
		panic("get editor")
	}
	if repository.editor.FontSize == 0 {
		return DefaultSettings().Editor, nil
	}
	return repository.editor, nil
}

func (repository *fakeSettingsRepository) GetFile(context.Context) (apperr.FileSettings, error) {
	if !repository.fileSet {
		return DefaultSettings().File, nil
	}
	return repository.file, nil
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

func (repository *fakeSettingsRepository) UpdateEditor(_ context.Context, editor apperr.EditorSettings) error {
	if repository.panicOperation == "update editor" {
		panic("update editor")
	}
	repository.editor = editor
	return nil
}

func (repository *fakeSettingsRepository) UpdateFile(_ context.Context, file apperr.FileSettings) error {
	if repository.panicOperation == "update file" {
		panic("update file")
	}
	if repository.fileUpdateError != nil {
		return repository.fileUpdateError
	}
	repository.file = file
	repository.fileSet = true
	return nil
}

var _ SettingsRepositoryAPI = (*fakeSettingsRepository)(nil)

func TestDefaultReadingWidthIsPage(t *testing.T) {
	if got := DefaultSettings().Appearance.ReadingWidth; got != ReadingWidthPage {
		t.Fatalf("default reading width = %q, want %q", got, ReadingWidthPage)
	}
	if ReadingWidthPage != "page" || ReadingWidthFull != "full" {
		t.Fatalf("reading width values = %q and %q, want page and full", ReadingWidthPage, ReadingWidthFull)
	}
}

func TestAppearanceReadingWidthSavedAndRefused(t *testing.T) {
	repository := &fakeSettingsRepository{}
	service := NewSettingsService(repository)
	valid := apperr.AppearanceSettings{Theme: ThemeMaterial, Mode: ModeAuto, DefaultOpenMode: OpenModeEditor, ReadingWidth: ReadingWidthFull}
	if err := service.UpdateAppearance(context.Background(), valid); err != nil {
		t.Fatalf("update full reading width: %v", err)
	}
	got, err := service.Get(context.Background())
	if err != nil {
		t.Fatalf("read reading width: %v", err)
	}
	if got.Appearance.ReadingWidth != ReadingWidthFull {
		t.Fatalf("reading width = %q, want full", got.Appearance.ReadingWidth)
	}

	invalid := valid
	invalid.ReadingWidth = "wide"
	if err := service.UpdateAppearance(context.Background(), invalid); err == nil {
		t.Fatal("update with reading width wide succeeded, want a validation error")
	}
	if repository.appearance.ReadingWidth != ReadingWidthFull {
		t.Fatalf("stored reading width after refused write = %q, want full", repository.appearance.ReadingWidth)
	}
}
