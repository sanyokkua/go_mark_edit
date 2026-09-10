package bootstrap_test

import (
	. "github.com/sanyokkua/go_mark_edit/internal/bootstrap"
	"testing"

	"github.com/rs/zerolog"
)

// Bootstrap logging has a usable build-appropriate level without any database configuration.
func TestBootstrapLoggerIsAvailableBeforeDatabaseOpen(t *testing.T) {
	t.Parallel()

	logger := NewLogger()
	wantLevel := zerolog.WarnLevel
	if IsDevBuild() {
		wantLevel = zerolog.DebugLevel
	}
	if got := logger.GetLevel(); got != wantLevel {
		t.Fatalf("bootstrap logger level = %s, want %s", got, wantLevel)
	}

	preDatabaseLogger := logger.With().Str("phase", "pre-db").Logger()
	preDatabaseLogger.Warn().Msg("bootstrap logger available")
}
