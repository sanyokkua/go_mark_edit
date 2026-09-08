package logging

import (
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/rs/zerolog"
)

// Proves: STORY-003-AC-1
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
	if logger.sink == nil {
		t.Fatal("configured logger has no local rotating sink")
	}
	if logger.sink.Filename != filepath.Join(logDirectory, logFileName) {
		t.Fatalf("sink filename = %q, want %q", logger.sink.Filename, filepath.Join(logDirectory, logFileName))
	}
	if logger.sink.MaxSize != 10 || logger.sink.MaxBackups != 3 || logger.sink.MaxAge != 30 || !logger.sink.Compress {
		t.Fatalf("rotation = size %d MiB, backups %d, age %d days, compress %t; want 10, 3, 30, true",
			logger.sink.MaxSize, logger.sink.MaxBackups, logger.sink.MaxAge, logger.sink.Compress)
	}

	const message = "local rotating sink test"
	logger.Info(message)
	contents, err := os.ReadFile(filepath.Join(logDirectory, logFileName))
	if err != nil {
		t.Fatalf("read local log file: %v", err)
	}
	if !strings.Contains(string(contents), message) {
		t.Fatalf("local log file does not contain %q: %s", message, contents)
	}
}
