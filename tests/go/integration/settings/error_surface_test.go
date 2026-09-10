package settings_test

import (
	"context"
	"errors"
	"testing"

	"github.com/sanyokkua/go_mark_edit/internal/apperr"
	"github.com/sanyokkua/go_mark_edit/internal/bridge"
	"github.com/sanyokkua/go_mark_edit/internal/settings"
)

// Proves: FR-056
func TestResetAppearanceReadBackFailureIsReturnedToTheBridge(t *testing.T) {
	repository := &resetReadBackFailureRepository{}
	handler := settings.NewSettingsHandler(
		settings.NewSettingsService(repository),
		nil,
		func() context.Context { return context.Background() },
	)
	result := handler.ResetAppearance(bridge.Request{ID: "reset-read-back"})
	if result.Error == nil {
		t.Fatal("ResetAppearance succeeded despite a read-back failure")
	}
	if result.Error.Code != apperr.CodeIO {
		t.Fatalf("reset read-back code = %q, want %q", result.Error.Code, apperr.CodeIO)
	}
	if result.Error.Details["operation"] != "read reset appearance" {
		t.Fatalf("reset read-back details = %+v, want the stated read operation", result.Error.Details)
	}
}

type resetReadBackFailureRepository struct{}

func (resetReadBackFailureRepository) GetAppearance(context.Context) (apperr.AppearanceSettings, error) {
	return apperr.AppearanceSettings{}, errors.New("reset read-back unavailable")
}

func (resetReadBackFailureRepository) ResetAppearance(context.Context) error { return nil }

func (resetReadBackFailureRepository) GetMarkdown(context.Context) (apperr.MarkdownSettings, error) {
	return apperr.MarkdownSettings{}, nil
}

func (resetReadBackFailureRepository) GetContentPrivacy(context.Context) (apperr.ContentPrivacySettings, error) {
	return apperr.ContentPrivacySettings{}, nil
}

func (resetReadBackFailureRepository) GetEditor(context.Context) (apperr.EditorSettings, error) {
	return apperr.EditorSettings{}, nil
}

func (resetReadBackFailureRepository) GetFile(context.Context) (apperr.FileSettings, error) {
	return apperr.FileSettings{}, nil
}

func (resetReadBackFailureRepository) UpdateAppearance(context.Context, apperr.AppearanceSettings) error {
	return nil
}

func (resetReadBackFailureRepository) UpdateMarkdown(context.Context, apperr.MarkdownSettings) error {
	return nil
}

func (resetReadBackFailureRepository) UpdateContentPrivacy(context.Context, apperr.ContentPrivacySettings) error {
	return nil
}

func (resetReadBackFailureRepository) UpdateEditor(context.Context, apperr.EditorSettings) error {
	return nil
}

func (resetReadBackFailureRepository) UpdateFile(context.Context, apperr.FileSettings) error {
	return nil
}
