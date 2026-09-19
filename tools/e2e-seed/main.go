// Command e2e-seed prepares disposable profile databases for the real-backend
// end-to-end tests. It is a test tool and is not included in the application
// binary.
package main

import (
	"context"
	"errors"
	"fmt"
	"os"
	"os/signal"
	"path/filepath"
	"strconv"
	"strings"
	"syscall"
	"time"

	"github.com/sanyokkua/go_mark_edit/internal/db"
	"github.com/sanyokkua/go_mark_edit/internal/kv"
)

const (
	recentFilesKey  = "recent.files"
	recentFilesType = "recent.files.v1"
	maxRecentFiles  = 6

	appearanceInsertTrigger = `
CREATE TRIGGER IF NOT EXISTS e2e_reject_insert
BEFORE INSERT ON settings
WHEN NEW.key LIKE 'appearance.%'
BEGIN
	SELECT RAISE(ABORT, 'e2e');
END;`
	appearanceUpdateTrigger = `
CREATE TRIGGER IF NOT EXISTS e2e_reject_update
BEFORE UPDATE ON settings
WHEN NEW.key LIKE 'appearance.%'
BEGIN
	SELECT RAISE(ABORT, 'e2e');
END;`
)

const maxLockSeconds = (1<<63 - 1) / int64(time.Second)

func main() {
	if err := run(os.Args[1:]); err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
}

func run(args []string) error {
	if len(args) < 2 {
		return usageError()
	}
	profileDir := strings.TrimSpace(args[0])
	if profileDir == "" {
		return errors.New("profile directory is required")
	}

	switch args[1] {
	case "seed-recents":
		if len(args) < 3 {
			return errors.New("seed-recents requires at least one file")
		}
		return seedRecents(context.Background(), profileDir, args[2:])
	case "add-trigger":
		if len(args) != 3 || args[2] != "appearance" {
			return errors.New("add-trigger requires the appearance target")
		}
		return addAppearanceTriggers(context.Background(), profileDir)
	case "hold-lock":
		if len(args) != 3 {
			return errors.New("hold-lock requires a duration in seconds")
		}
		duration, err := parseLockDuration(args[2])
		if err != nil {
			return err
		}
		ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
		defer stop()
		ready := make(chan struct{})
		done := make(chan error, 1)
		go func() {
			done <- holdLock(ctx, profileDir, duration, ready)
		}()
		select {
		case <-ready:
			if _, err := fmt.Fprintln(os.Stdout, "lock acquired"); err != nil {
				return err
			}
			return <-done
		case err := <-done:
			return err
		}
	default:
		return fmt.Errorf("unknown command %q", args[1])
	}
}

func usageError() error {
	return errors.New("usage: go run ./tools/e2e-seed <profile-dir> <seed-recents|add-trigger|hold-lock> …")
}

func databasePath(profileDir string) string {
	return filepath.Join(profileDir, "settings.db")
}

func openProfileDatabase(ctx context.Context, profileDir string) (*db.Database, error) {
	if ctx == nil {
		ctx = context.Background()
	}
	database, err := db.Open(ctx, databasePath(profileDir))
	if err != nil {
		return nil, fmt.Errorf("open profile database: %w", err)
	}
	return database, nil
}

func seedRecents(ctx context.Context, profileDir string, paths []string) (retErr error) {
	database, err := openProfileDatabase(ctx, profileDir)
	if err != nil {
		return err
	}
	defer func() {
		retErr = errors.Join(retErr, closeProfileDatabase(database))
	}()

	if len(paths) > maxRecentFiles {
		paths = paths[:maxRecentFiles]
	}
	encoded, err := kv.EncodeVersionedJSON(1, struct {
		Entries []string `json:"entries"`
	}{Entries: append([]string(nil), paths...)})
	if err != nil {
		return fmt.Errorf("encode recent files: %w", err)
	}
	if err := kv.New(database.DB).Upsert(ctx, kv.KVEntry{
		Key:   recentFilesKey,
		Value: encoded,
		Type:  recentFilesType,
	}); err != nil {
		return fmt.Errorf("write recent files: %w", err)
	}
	return nil
}

func addAppearanceTriggers(ctx context.Context, profileDir string) (retErr error) {
	database, err := openProfileDatabase(ctx, profileDir)
	if err != nil {
		return err
	}
	defer func() {
		retErr = errors.Join(retErr, closeProfileDatabase(database))
	}()

	transaction, err := database.DB.BeginTx(ctx, nil)
	if err != nil {
		return fmt.Errorf("begin trigger transaction: %w", err)
	}
	defer func() { _ = transaction.Rollback() }()
	triggers := []struct {
		name      string
		statement string
	}{
		{name: "insert", statement: appearanceInsertTrigger},
		{name: "update", statement: appearanceUpdateTrigger},
	}
	for _, trigger := range triggers {
		if _, err := transaction.ExecContext(ctx, trigger.statement); err != nil {
			return fmt.Errorf("install appearance %s trigger: %w", trigger.name, err)
		}
	}
	if err := transaction.Commit(); err != nil {
		return fmt.Errorf("commit appearance triggers: %w", err)
	}
	return nil
}

func holdLock(ctx context.Context, profileDir string, duration time.Duration, ready chan<- struct{}) (retErr error) {
	if duration < 0 {
		return errors.New("hold-lock duration cannot be negative")
	}
	if ctx == nil {
		ctx = context.Background()
	}
	database, err := openProfileDatabase(ctx, profileDir)
	if err != nil {
		return err
	}
	connection, err := database.DB.Conn(ctx)
	if err != nil {
		_ = database.Close()
		return fmt.Errorf("reserve profile database connection: %w", err)
	}
	defer func() {
		retErr = errors.Join(retErr, connection.Close(), database.Close())
	}()

	if _, err := connection.ExecContext(ctx, "BEGIN IMMEDIATE"); err != nil {
		return fmt.Errorf("begin immediate profile lock: %w", err)
	}
	if ready != nil {
		close(ready)
	}

	timer := time.NewTimer(duration)
	defer timer.Stop()
	select {
	case <-ctx.Done():
	case <-timer.C:
	}
	if _, err := connection.ExecContext(context.Background(), "ROLLBACK"); err != nil {
		return fmt.Errorf("rollback profile lock: %w", err)
	}
	return nil
}

func parseLockDuration(value string) (time.Duration, error) {
	seconds, err := strconv.ParseInt(value, 10, 64)
	if err != nil || seconds < 0 {
		return 0, fmt.Errorf("hold-lock seconds must be a non-negative integer: %q", value)
	}
	if seconds > maxLockSeconds {
		return 0, fmt.Errorf("hold-lock seconds are too large: %q", value)
	}
	return time.Duration(seconds) * time.Second, nil
}

func closeProfileDatabase(database *db.Database) error {
	if err := database.Close(); err != nil {
		return fmt.Errorf("close profile database: %w", err)
	}
	return nil
}
