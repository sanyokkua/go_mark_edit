package settings_test

import (
	"context"
	"errors"
	"testing"

	"github.com/sanyokkua/go_mark_edit/internal/apperr"
	. "github.com/sanyokkua/go_mark_edit/internal/settings"
)

func validAppearanceWithOpenMode(mode string) apperr.AppearanceSettings {
	appearance := DefaultSettings().Appearance
	appearance.OpenMode = mode
	return appearance
}

func TestDefaultOpenModeIsLastAndTheFiveValuesAreStable(t *testing.T) {
	if got := DefaultSettings().Appearance.OpenMode; got != OpenModeLast {
		t.Fatalf("default open mode = %q, want %q", got, OpenModeLast)
	}
	for constant, want := range map[string]string{
		OpenModeReading: "reading", OpenModeEditor: "editor", OpenModeSplit: "split", OpenModePreview: "preview", OpenModeLast: "last",
	} {
		if constant != want {
			t.Fatalf("open mode constant = %q, want %q", constant, want)
		}
	}
}

func TestEveryOpenModeIsSavedAndRead(t *testing.T) {
	for _, mode := range []string{OpenModeReading, OpenModeEditor, OpenModeSplit, OpenModePreview, OpenModeLast} {
		t.Run(mode, func(t *testing.T) {
			repository := &fakeSettingsRepository{}
			service := NewSettingsService(repository)
			if err := service.UpdateAppearance(context.Background(), validAppearanceWithOpenMode(mode)); err != nil {
				t.Fatalf("update open mode %q: %v", mode, err)
			}
			got, err := service.Get(context.Background())
			if err != nil {
				t.Fatalf("read open mode: %v", err)
			}
			if got.Appearance.OpenMode != mode {
				t.Fatalf("open mode = %q, want %q", got.Appearance.OpenMode, mode)
			}
		})
	}
}

func TestInvalidOpenModeWriteIsRefusedAndNothingIsStored(t *testing.T) {
	for _, invalid := range []string{"viewer", "", "READING", "side-by-side"} {
		t.Run(invalid, func(t *testing.T) {
			stored := validAppearanceWithOpenMode(OpenModePreview)
			repository := &fakeSettingsRepository{appearance: stored}
			service := NewSettingsService(repository)
			err := service.UpdateAppearance(context.Background(), validAppearanceWithOpenMode(invalid))
			var appError *apperr.AppError
			if !errors.As(err, &appError) {
				t.Fatalf("update with open mode %q error = %v, want a validation error", invalid, err)
			}
			if repository.appearance != stored || repository.appearanceUpdates != 0 {
				t.Fatalf("stored appearance = %+v after %d updates, want it untouched", repository.appearance, repository.appearanceUpdates)
			}
		})
	}
}

func TestInvalidStoredOpenModeIsReadAsLast(t *testing.T) {
	for _, stored := range []string{"", "viewer", "Split", "nonsense"} {
		service := NewSettingsService(&fakeSettingsRepository{appearance: validAppearanceWithOpenMode(stored)})
		got, err := service.Get(context.Background())
		if err != nil {
			t.Fatalf("read stored open mode %q: %v", stored, err)
		}
		if got.Appearance.OpenMode != OpenModeLast {
			t.Fatalf("stored open mode %q read as %q, want last", stored, got.Appearance.OpenMode)
		}
	}
}
