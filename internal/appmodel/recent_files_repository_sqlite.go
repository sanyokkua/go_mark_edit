package appmodel

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"strings"

	"github.com/sanyokkua/go_mark_edit/internal/db"
	"github.com/sanyokkua/go_mark_edit/internal/file"
)

// SqliteRecentFilesRepository stores only the versioned recent-path envelope
// in the existing settings KV table. It owns no document/session state.
type SqliteRecentFilesRepository struct {
	database          *sql.DB
	afterReadDecision func()
}

func NewSqliteRecentFilesRepository(database *db.Database) *SqliteRecentFilesRepository {
	if database == nil {
		return &SqliteRecentFilesRepository{}
	}
	return &SqliteRecentFilesRepository{database: database.DB}
}

type recentFilesValue struct {
	Version int      `json:"version"`
	Entries []string `json:"entries"`
}

func (repository *SqliteRecentFilesRepository) List(ctx context.Context) ([]string, error) {
	return repository.withEntries(ctx, func(entries []string) ([]string, bool, error) {
		normalized := normalizeRecentFiles(entries)
		changed := !sameRecentFiles(entries, normalized)
		filtered := normalized[:0]
		for _, path := range normalized {
			_, statErr := os.Stat(path)
			if statErr == nil {
				filtered = append(filtered, path)
				continue
			}
			if errors.Is(statErr, os.ErrNotExist) {
				changed = true
				continue
			}
			return nil, false, fmt.Errorf("validate recent file: %w", statErr)
		}
		if !sameRecentFiles(filtered, normalized) {
			changed = true
		}
		return filtered, changed, nil
	})
}

func (repository *SqliteRecentFilesRepository) Promote(ctx context.Context, path string) ([]string, error) {
	if strings.TrimSpace(path) == "" {
		return nil, errors.New("recent file path is required")
	}
	path = canonicalRecentPath(path)
	return repository.withEntries(ctx, func(entries []string) ([]string, bool, error) {
		current := normalizeRecentFiles(entries)
		promoted := make([]string, 0, maxRecentFiles)
		promoted = append(promoted, path)
		for _, candidate := range current {
			if candidate == path || len(promoted) == maxRecentFiles {
				continue
			}
			promoted = append(promoted, candidate)
		}
		return promoted, !sameRecentFiles(current, promoted), nil
	})
}

func (repository *SqliteRecentFilesRepository) withEntries(ctx context.Context, mutate func([]string) ([]string, bool, error)) ([]string, error) {
	if repository == nil || repository.database == nil {
		return nil, errors.New("recent files database is not configured")
	}
	if ctx == nil {
		ctx = context.Background()
	}
	for attempt := 0; attempt < 3; attempt++ {
		entries, retry, err := repository.withEntriesAttempt(ctx, mutate)
		if err == nil || !retry {
			return entries, err
		}
	}
	return nil, errors.New("recent files transaction remained busy")
}

func (repository *SqliteRecentFilesRepository) withEntriesAttempt(ctx context.Context, mutate func([]string) ([]string, bool, error)) ([]string, bool, error) {
	tx, err := repository.database.BeginTx(ctx, nil)
	if err != nil {
		return nil, isRecentSQLiteBusy(err), fmt.Errorf("begin recent files transaction: %w", err)
	}
	defer func() { _ = tx.Rollback() }()

	entries, err := readRecentFilesTx(ctx, tx)
	if err != nil {
		return nil, isRecentSQLiteBusy(err), err
	}
	if repository.afterReadDecision != nil {
		hook := repository.afterReadDecision
		repository.afterReadDecision = nil
		hook()
	}
	next, changed, err := mutate(entries)
	if err != nil {
		return nil, false, err
	}
	next = normalizeRecentFiles(next)
	if changed {
		if err := writeRecentFilesTx(ctx, tx, next); err != nil {
			return nil, isRecentSQLiteBusy(err), err
		}
	}
	if err := tx.Commit(); err != nil {
		return nil, isRecentSQLiteBusy(err), fmt.Errorf("commit recent files transaction: %w", err)
	}
	return next, false, nil
}

type recentFilesQuerier interface {
	QueryRowContext(context.Context, string, ...any) *sql.Row
	ExecContext(context.Context, string, ...any) (sql.Result, error)
}

func readRecentFilesTx(ctx context.Context, query recentFilesQuerier) ([]string, error) {
	var encoded string
	err := query.QueryRowContext(ctx, "SELECT value FROM settings WHERE key = ?", recentFilesSettingKey).Scan(&encoded)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("read recent files: %w", err)
	}
	var value recentFilesValue
	if err := json.Unmarshal([]byte(encoded), &value); err != nil {
		// Recent-file metadata is optional presentation state. A corrupt value
		// must not prevent startup or block a later promotion from replacing it.
		return nil, nil
	}
	if value.Version != 1 {
		// Unknown versions are treated as empty until a writer that understands
		// the current envelope promotes a new path.
		return nil, nil
	}
	return value.Entries, nil
}

func writeRecentFilesTx(ctx context.Context, query recentFilesQuerier, entries []string) error {
	encoded, err := json.Marshal(recentFilesValue{Version: 1, Entries: entries})
	if err != nil {
		return fmt.Errorf("encode recent files: %w", err)
	}
	if _, err := query.ExecContext(ctx, `
INSERT INTO settings (key, value, type)
VALUES (?, ?, ?)
ON CONFLICT(key) DO UPDATE SET value = excluded.value, type = excluded.type
`, recentFilesSettingKey, string(encoded), recentFilesSettingType); err != nil {
		return fmt.Errorf("write recent files: %w", err)
	}
	return nil
}

func normalizeRecentFiles(entries []string) []string {
	result := make([]string, 0, maxRecentFiles)
	seen := make(map[string]struct{}, len(entries))
	for _, path := range entries {
		path = canonicalRecentPath(path)
		if path == "" {
			continue
		}
		if _, exists := seen[path]; exists {
			continue
		}
		seen[path] = struct{}{}
		result = append(result, path)
		if len(result) == maxRecentFiles {
			break
		}
	}
	return result
}

func canonicalRecentPath(path string) string {
	if strings.TrimSpace(path) == "" {
		return ""
	}
	if canonical, err := file.CanonicalizeCandidateDocumentPath(path); err == nil {
		return canonical.Path
	}
	return path
}

func sameRecentFiles(left, right []string) bool {
	if len(left) != len(right) {
		return false
	}
	for index := range left {
		if left[index] != right[index] {
			return false
		}
	}
	return true
}

func isRecentSQLiteBusy(err error) bool {
	if err == nil {
		return false
	}
	message := strings.ToLower(err.Error())
	return strings.Contains(message, "busy") || strings.Contains(message, "locked")
}

var _ RecentFilesRepository = (*SqliteRecentFilesRepository)(nil)
