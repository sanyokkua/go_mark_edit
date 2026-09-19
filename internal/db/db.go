// Package db opens GoMarkEdit's local SQLite persistence store.
package db

import (
	"context"
	"crypto/rand"
	"database/sql"
	"embed"
	"errors"
	"fmt"
	"io/fs"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"

	"github.com/pressly/goose/v3"
	_ "modernc.org/sqlite"
)

const (
	busyTimeoutMilliseconds = 5000
	corruptFileMarker       = ".corrupt-"
	freshOpenRetryTimeout   = time.Duration(busyTimeoutMilliseconds) * time.Millisecond
	freshOpenRetryDelay     = 25 * time.Millisecond
	migrationOpenAttempts   = 5
	migrationRetryDelay     = 25 * time.Millisecond
)

var (
	// ErrUnsupportedSchema reports a database created by a newer GoMarkEdit schema.
	ErrUnsupportedSchema    = errors.New("database schema is newer than this application supports")
	errCorruptDatabaseMoved = errors.New("corrupt database was moved by another opener")

	corruptRecoveryMu sync.Mutex

	//go:embed migrations/*.sql
	migrationFiles embed.FS
)

// Database owns an open SQLite connection.
type Database struct {
	DB *sql.DB
}

// Open opens path with the SQLite multi-instance pragmas, applies pending additive migrations, and
// exposes the opened connection. Recognized corruption is retained beside the database before a
// clean database is created. A schema newer than this binary supports is never recovered or changed.
func Open(ctx context.Context, path string) (*Database, error) {
	if ctx == nil {
		ctx = context.Background()
	}
	if path == "" {
		return nil, errors.New("database path is required")
	}
	if err := os.MkdirAll(filepath.Dir(path), 0o700); err != nil {
		return nil, fmt.Errorf("create database directory: %w", err)
	}
	corruptFile, statErr := os.Stat(path)
	if statErr != nil && !errors.Is(statErr, os.ErrNotExist) {
		return nil, fmt.Errorf("inspect database: %w", statErr)
	}

	var (
		database *Database
		err      error
	)
	if errors.Is(statErr, os.ErrNotExist) || corruptFile != nil && corruptFile.Size() == 0 {
		database, err = openFreshAndMigrate(ctx, path)
	} else {
		database, err = openAndMigrate(ctx, path)
	}
	if err == nil || !isSQLiteCorruption(err) {
		return database, err
	}
	if err := preserveCorruptDatabase(path, corruptFile); err != nil {
		if !errors.Is(err, errCorruptDatabaseMoved) {
			return nil, fmt.Errorf("preserve corrupt database: %w", err)
		}
	}

	database, err = openFreshAndMigrate(ctx, path)
	if err != nil {
		return nil, fmt.Errorf("open replacement database: %w", err)
	}
	return database, nil
}

// Close releases the database connection.
func (database *Database) Close() error {
	if database == nil || database.DB == nil {
		return nil
	}
	return database.DB.Close()
}

func openAndMigrate(ctx context.Context, path string) (_ *Database, retErr error) {
	database, err := openSQLiteConnection(ctx, path)
	if err != nil {
		return nil, err
	}
	return migrateOpenConnection(ctx, database)
}

func openFreshAndMigrate(ctx context.Context, path string) (*Database, error) {
	// modernc applies the DSN journal_mode pragma during Ping. Concurrent initializers can receive
	// SQLITE_BUSY there before migrations begin, so only that connection-establishment step polls.
	deadline := time.Now().Add(freshOpenRetryTimeout)
	for {
		database, err := openSQLiteConnection(ctx, path)
		if err == nil {
			return migrateOpenConnection(ctx, database)
		}
		if !isTransientSQLiteBusy(err) {
			return nil, err
		}

		remaining := time.Until(deadline)
		if remaining <= 0 {
			return nil, err
		}
		delay := min(freshOpenRetryDelay, remaining)
		if waitErr := waitForRetry(ctx, delay); waitErr != nil {
			return nil, waitErr
		}
	}
}

func openSQLiteConnection(ctx context.Context, path string) (_ *sql.DB, retErr error) {
	database, err := sql.Open("sqlite", dsn(path))
	if err != nil {
		return nil, fmt.Errorf("open sqlite database: %w", err)
	}
	database.SetMaxOpenConns(1)
	defer func() {
		if retErr != nil {
			retErr = errors.Join(retErr, database.Close())
		}
	}()

	if err := database.PingContext(ctx); err != nil {
		return nil, fmt.Errorf("ping sqlite database: %w", err)
	}
	return database, nil
}

func migrateOpenConnection(ctx context.Context, database *sql.DB) (_ *Database, retErr error) {
	defer func() {
		if retErr != nil {
			retErr = errors.Join(retErr, database.Close())
		}
	}()
	migrations, err := fs.Sub(migrationFiles, "migrations")
	if err != nil {
		return nil, fmt.Errorf("load migrations: %w", err)
	}
	if err := applyMigrations(ctx, database, migrations); err != nil {
		return nil, fmt.Errorf("apply database migrations: %w", err)
	}

	return &Database{DB: database}, nil
}

func applyMigrations(ctx context.Context, database *sql.DB, migrations fs.FS) error {
	var conflict error
	for attempt := range migrationOpenAttempts {
		provider, err := goose.NewProvider(goose.DialectSQLite3, database, migrations)
		if err != nil {
			return fmt.Errorf("create migration provider: %w", err)
		}
		currentVersion, targetVersion, err := provider.GetVersions(ctx)
		if err == nil {
			if currentVersion > targetVersion {
				return fmt.Errorf("%w: found %d, maximum %d", ErrUnsupportedSchema, currentVersion, targetVersion)
			}
			if currentVersion == targetVersion {
				return nil
			}
			_, err = provider.Up(ctx)
		}
		if err == nil {
			return nil
		}
		if !isConcurrentMigrationConflict(err) {
			return err
		}
		conflict = err
		if attempt < migrationOpenAttempts-1 {
			if err := waitForMigrationRetry(ctx); err != nil {
				return err
			}
		}
	}
	return fmt.Errorf("concurrent database migration did not reach the expected schema version: %w", conflict)
}

func waitForMigrationRetry(ctx context.Context) error {
	return waitForRetry(ctx, migrationRetryDelay)
}

func waitForRetry(ctx context.Context, delay time.Duration) error {
	timer := time.NewTimer(delay)
	defer timer.Stop()
	select {
	case <-ctx.Done():
		return ctx.Err()
	case <-timer.C:
		return nil
	}
}

func dsn(path string) string {
	return fmt.Sprintf(
		"file:%s?_pragma=busy_timeout(%d)&_pragma=journal_mode(WAL)&_pragma=foreign_keys(ON)&_pragma=synchronous(NORMAL)",
		path,
		busyTimeoutMilliseconds,
	)
}

func isSQLiteCorruption(err error) bool {
	if err == nil {
		return false
	}

	message := strings.ToLower(err.Error())
	for _, fragment := range []string{
		"database disk image is malformed",
		"database corrupt",
		"file is not a database",
		"malformed database schema",
	} {
		if strings.Contains(message, fragment) {
			return true
		}
	}
	return false
}

func isConcurrentMigrationConflict(err error) bool {
	if err == nil {
		return false
	}

	message := strings.ToLower(err.Error())
	return strings.Contains(message, "already exists") &&
		(strings.Contains(message, "migration") || strings.Contains(message, "version table"))
}

func isTransientSQLiteBusy(err error) bool {
	if err == nil {
		return false
	}

	message := strings.ToLower(err.Error())
	return strings.Contains(message, "database is locked") || strings.Contains(message, "database is busy")
}

func preserveCorruptDatabase(path string, original fs.FileInfo) error {
	corruptRecoveryMu.Lock()
	defer corruptRecoveryMu.Unlock()

	if original == nil {
		return errCorruptDatabaseMoved
	}
	current, err := os.Stat(path)
	if errors.Is(err, os.ErrNotExist) {
		return errCorruptDatabaseMoved
	} else if err != nil {
		return fmt.Errorf("inspect %s: %w", path, err)
	}
	if !os.SameFile(original, current) {
		return errCorruptDatabaseMoved
	}

	paths := []string{path, path + "-wal", path + "-shm"}
	for range 10 {
		suffix, err := uniqueCorruptSuffix(paths)
		if err != nil {
			return err
		}
		if err := preserveCorruptFiles(paths, suffix, original); err == nil {
			return nil
		} else if errors.Is(err, os.ErrNotExist) {
			return errCorruptDatabaseMoved
		} else if !errors.Is(err, fs.ErrExist) {
			return err
		}
	}
	return errors.New("allocate unique corrupt database filenames")
}

func preserveCorruptFiles(paths []string, suffix string, expectedPrimary fs.FileInfo) error {
	type corruptFile struct {
		source      string
		destination string
		original    fs.FileInfo
	}

	files := make([]corruptFile, 0, len(paths))
	for index, source := range paths {
		original, err := os.Lstat(source)
		if errors.Is(err, os.ErrNotExist) {
			if index == 0 {
				return errCorruptDatabaseMoved
			}
			continue
		} else if err != nil {
			return fmt.Errorf("inspect %s: %w", source, err)
		}
		if index == 0 {
			if !os.SameFile(expectedPrimary, original) {
				return errCorruptDatabaseMoved
			}
			original = expectedPrimary
		}
		files = append(files, corruptFile{source: source, destination: source + corruptFileMarker + suffix, original: original})
	}
	if len(files) == 0 || files[0].source != paths[0] {
		return errCorruptDatabaseMoved
	}

	// Rename makes preservation and removal of the primary one filesystem operation. The identity
	// check prevents a stale process from claiming a replacement that another opener just created.
	for index, file := range files {
		if index > 0 {
			current, err := os.Lstat(file.source)
			if errors.Is(err, os.ErrNotExist) {
				continue
			} else if err != nil {
				return fmt.Errorf("inspect %s before preservation: %w", file.source, err)
			}
			if !os.SameFile(file.original, current) {
				continue
			}
		}

		if err := os.Rename(file.source, file.destination); err != nil {
			if errors.Is(err, os.ErrNotExist) {
				if index == 0 {
					return errCorruptDatabaseMoved
				}
				continue
			}
			return fmt.Errorf("preserve %s: %w", file.source, err)
		}
		moved, err := os.Lstat(file.destination)
		if err != nil {
			return fmt.Errorf("inspect preserved %s: %w", file.destination, err)
		}
		if os.SameFile(file.original, moved) {
			continue
		}
		if err := restoreMisidentifiedCorruptFile(file.destination, file.source); err != nil {
			return err
		}
		if index == 0 {
			return errCorruptDatabaseMoved
		}
	}
	return nil
}

func restoreMisidentifiedCorruptFile(movedPath, sourcePath string) error {
	if err := os.Link(movedPath, sourcePath); err != nil {
		return fmt.Errorf("restore database file moved during concurrent recovery: %w", err)
	}
	if err := os.Remove(movedPath); err != nil {
		return fmt.Errorf("remove restored recovery candidate: %w", err)
	}
	return nil
}

func uniqueCorruptSuffix(paths []string) (string, error) {
	for range 10 {
		bytes := make([]byte, 8)
		if _, err := rand.Read(bytes); err != nil {
			return "", fmt.Errorf("create corrupt database suffix: %w", err)
		}
		suffix := fmt.Sprintf("%d-%x", time.Now().UnixNano(), bytes)
		collision := false
		for _, path := range paths {
			if _, err := os.Lstat(path + corruptFileMarker + suffix); err == nil {
				collision = true
				break
			} else if !errors.Is(err, os.ErrNotExist) {
				return "", fmt.Errorf("inspect corrupt database destination: %w", err)
			}
		}
		if !collision {
			return suffix, nil
		}
	}
	return "", errors.New("allocate unique corrupt database filename")
}
