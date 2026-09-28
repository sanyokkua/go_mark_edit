// Package logging configures GoMarkEdit's local rotating diagnostic log.
package logging

import (
	"os"
	"path/filepath"
	"sync"

	"github.com/rs/zerolog"
	"gopkg.in/natefinch/lumberjack.v2"
)

const logFileName = "gomarkedit.log"

// Logger is the local-file Wails logger and the structured application logger.
type Logger struct {
	mu     sync.RWMutex
	logger zerolog.Logger
	sink   *lumberjack.Logger
}

type synchronizedWriter struct {
	logger *Logger
}

// NewLogger creates a rotating local log sink for the current build flavour.
func NewLogger(logDirectory string, isDev bool) (*Logger, error) {
	level := zerolog.WarnLevel
	if isDev {
		level = zerolog.DebugLevel
	}

	logger := &Logger{}
	if err := logger.reconfigure(logDirectory, level); err != nil {
		return nil, err
	}

	return logger, nil
}

// reconfigure replaces the local sink and log level without racing active writers.
func (logger *Logger) reconfigure(logDirectory string, level zerolog.Level) error {
	if err := os.MkdirAll(logDirectory, 0o750); err != nil {
		return err
	}

	newSink := &lumberjack.Logger{
		Filename:   filepath.Join(logDirectory, logFileName),
		MaxSize:    10,
		MaxBackups: 3,
		MaxAge:     30,
		Compress:   true,
	}
	logger.mu.Lock()
	previousSink := logger.sink
	logger.sink = newSink
	logger.logger = zerolog.New(synchronizedWriter{logger: logger}).Level(level).With().Timestamp().Logger()
	logger.mu.Unlock()

	if previousSink != nil {
		return previousSink.Close()
	}

	return nil
}

// Zerolog returns a copy of the configured structured logger.
func (logger *Logger) Zerolog() zerolog.Logger {
	logger.mu.RLock()
	defer logger.mu.RUnlock()

	return logger.logger
}

// Close closes the local sink. It is safe to call more than once.
func (logger *Logger) Close() error {
	logger.mu.Lock()
	sink := logger.sink
	logger.sink = nil
	logger.logger = zerolog.Nop()
	logger.mu.Unlock()

	if sink == nil {
		return nil
	}

	return sink.Close()
}

// Print implements logger.Logger.
func (logger *Logger) Print(message string) {
	logger.write(zerolog.InfoLevel, message)
}

// Trace implements logger.Logger.
func (logger *Logger) Trace(message string) {
	logger.write(zerolog.TraceLevel, message)
}

// Debug implements logger.Logger.
func (logger *Logger) Debug(message string) {
	logger.write(zerolog.DebugLevel, message)
}

// Info implements logger.Logger.
func (logger *Logger) Info(message string) {
	logger.write(zerolog.InfoLevel, message)
}

// Warning implements logger.Logger.
func (logger *Logger) Warning(message string) {
	logger.write(zerolog.WarnLevel, message)
}

// Error implements logger.Logger.
func (logger *Logger) Error(message string) {
	logger.write(zerolog.ErrorLevel, message)
}

// Fatal implements logger.Logger without terminating the process.
func (logger *Logger) Fatal(message string) {
	logger.mu.RLock()
	configuredLogger := logger.logger
	logger.mu.RUnlock()

	configuredLogger.WithLevel(zerolog.FatalLevel).Msg(message)
}

func (logger *Logger) write(level zerolog.Level, message string) {
	logger.mu.RLock()
	configuredLogger := logger.logger
	logger.mu.RUnlock()

	configuredLogger.WithLevel(level).Msg(message)
}

func (writer synchronizedWriter) Write(bytes []byte) (int, error) {
	return writer.WriteLevel(zerolog.NoLevel, bytes)
}

func (writer synchronizedWriter) WriteLevel(_ zerolog.Level, bytes []byte) (int, error) {
	writer.logger.mu.RLock()
	defer writer.logger.mu.RUnlock()

	if writer.logger.sink == nil {
		return len(bytes), nil
	}

	return writer.logger.sink.Write(bytes)
}

var _ interface {
	Print(string)
	Trace(string)
	Debug(string)
	Info(string)
	Warning(string)
	Error(string)
	Fatal(string)
} = (*Logger)(nil)
