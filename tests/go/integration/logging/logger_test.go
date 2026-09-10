package logging_test

import (
	. "github.com/sanyokkua/go_mark_edit/internal/logging"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/rs/zerolog"
)

// Configured logging writes a development event to a rotating file entirely inside the supplied local directory.
func TestConfiguredLoggerWritesLocalRotatingSink(t *testing.T) {
	t.Parallel()

	logDirectory := t.TempDir()
	logger, err := NewLogger(logDirectory, true)
	if err != nil {
		t.Fatalf("configure local logger: %v", err)
	}
	t.Cleanup(func() {
		if closeErr := logger.Close(); closeErr != nil {
			t.Errorf("close local logger: %v", closeErr)
		}
	})

	if got := logger.Zerolog().GetLevel(); got != zerolog.DebugLevel {
		t.Fatalf("development logger level = %s, want %s", got, zerolog.DebugLevel)
	}
	const message = "local rotating sink test"
	logger.Info(message)
	contents, err := os.ReadFile(filepath.Join(logDirectory, "gomarkedit.log"))
	if err != nil {
		t.Fatalf("read local log file: %v", err)
	}
	if !strings.Contains(string(contents), message) {
		t.Fatalf("local log file does not contain %q: %s", message, contents)
	}
}
