// Package bootstrap provides the logger used before application configuration is available.
package bootstrap

import (
	"os"

	"github.com/rs/zerolog"
)

// NewLogger creates the console-only logger used while the configured log sink starts.
func NewLogger() zerolog.Logger {
	level := zerolog.WarnLevel
	if IsDevBuild() {
		level = zerolog.DebugLevel
	}

	return zerolog.New(zerolog.ConsoleWriter{Out: os.Stderr}).
		Level(level).
		With().
		Timestamp().
		Logger()
}
