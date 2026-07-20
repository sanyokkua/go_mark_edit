package settings

import (
	"context"
	"reflect"
	"testing"

	"github.com/sanyokkua/go_mark_edit/internal/apperr"
)

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
