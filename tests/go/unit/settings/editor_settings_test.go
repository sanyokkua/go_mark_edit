package settings_test

import (
	"context"
	. "github.com/sanyokkua/go_mark_edit/internal/settings"
	"testing"

	"github.com/sanyokkua/go_mark_edit/internal/apperr"
)

func TestEditorSettingsDefaultsAndAcceptedFontSizes(t *testing.T) {
	repository := &editorSettingsTestRepository{}
	service := NewSettingsService(repository)

	got, err := service.Get(context.Background())
	if err != nil {
		t.Fatalf("get editor settings: %v", err)
	}
	if got.Editor != (apperr.EditorSettings{LineNumbers: true, WordWrap: false, FontSize: 14}) {
		t.Fatalf("default editor settings = %+v", got.Editor)
	}

	for _, fontSize := range []int{13, 14, 16} {
		want := apperr.EditorSettings{LineNumbers: false, WordWrap: true, FontSize: fontSize}
		if err := service.UpdateEditor(context.Background(), want); err != nil {
			t.Fatalf("update editor settings %d: %v", fontSize, err)
		}
		if repository.editor != want {
			t.Fatalf("stored editor settings = %+v, want %+v", repository.editor, want)
		}
	}
}

func TestEditorSettingsRejectUnsupportedFontSizeWithoutWrite(t *testing.T) {
	repository := &editorSettingsTestRepository{editor: apperr.EditorSettings{LineNumbers: true, FontSize: 14}}
	service := NewSettingsService(repository)

	err := service.UpdateEditor(context.Background(), apperr.EditorSettings{LineNumbers: false, FontSize: 15})
	if err == nil {
		t.Fatal("unsupported editor font size was accepted")
	}
	if repository.editorUpdates != 0 {
		t.Fatalf("rejected editor update wrote %d times", repository.editorUpdates)
	}
}

type editorSettingsTestRepository struct {
	editor        apperr.EditorSettings
	editorUpdates int
}

func (repository *editorSettingsTestRepository) GetAppearance(context.Context) (apperr.AppearanceSettings, error) {
	return DefaultSettings().Appearance, nil
}
func (repository *editorSettingsTestRepository) GetMarkdown(context.Context) (apperr.MarkdownSettings, error) {
	return DefaultSettings().Markdown, nil
}
func (repository *editorSettingsTestRepository) GetContentPrivacy(context.Context) (apperr.ContentPrivacySettings, error) {
	return DefaultSettings().ContentPrivacy, nil
}
func (repository *editorSettingsTestRepository) GetEditor(context.Context) (apperr.EditorSettings, error) {
	if repository.editor.FontSize == 0 {
		return DefaultSettings().Editor, nil
	}
	return repository.editor, nil
}
func (repository *editorSettingsTestRepository) GetFile(context.Context) (apperr.FileSettings, error) {
	return DefaultSettings().File, nil
}
func (repository *editorSettingsTestRepository) UpdateAppearance(context.Context, apperr.AppearanceSettings) error {
	return nil
}
func (repository *editorSettingsTestRepository) ResetAppearance(context.Context) error { return nil }
func (repository *editorSettingsTestRepository) UpdateMarkdown(context.Context, apperr.MarkdownSettings) error {
	return nil
}
func (repository *editorSettingsTestRepository) UpdateContentPrivacy(context.Context, apperr.ContentPrivacySettings) error {
	return nil
}
func (repository *editorSettingsTestRepository) UpdateEditor(_ context.Context, editor apperr.EditorSettings) error {
	repository.editor = editor
	repository.editorUpdates++
	return nil
}
func (repository *editorSettingsTestRepository) UpdateFile(context.Context, apperr.FileSettings) error {
	return nil
}

var _ SettingsRepositoryAPI = (*editorSettingsTestRepository)(nil)
