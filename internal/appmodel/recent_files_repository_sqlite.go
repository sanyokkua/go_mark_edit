package appmodel

import (
	"context"
	"errors"
	"fmt"
	"os"
	"strings"

	"github.com/sanyokkua/go_mark_edit/internal/db"
	"github.com/sanyokkua/go_mark_edit/internal/file"
	"github.com/sanyokkua/go_mark_edit/internal/kv"
)

// SqliteRecentFilesRepository stores only the versioned recent-path envelope
// in the existing settings KV table. It owns no document/session state.
type SqliteRecentFilesRepository struct {
	store             *kv.Store
	afterReadDecision func()
}

func NewSqliteRecentFilesRepository(database *db.Database) *SqliteRecentFilesRepository {
	if database == nil {
		return &SqliteRecentFilesRepository{store: kv.New(nil)}
	}
	return &SqliteRecentFilesRepository{store: kv.New(database.DB)}
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
	if repository == nil || repository.store == nil {
		return nil, errors.New("recent files database is not configured")
	}
	if ctx == nil {
		ctx = context.Background()
	}
	// The first optimistic attempt may fail its WAL write upgrade immediately;
	// keep the same three busy-timeout windows after that fast failure so a
	// writer held for the case-6 14-second lever can still complete the
	// promotion instead of being reported as an early warning.
	for attempt := 0; attempt < 4; attempt++ {
		entries, retry, err := repository.withEntriesAttempt(ctx, mutate, attempt > 0)
		if err == nil || !retry {
			return entries, err
		}
	}
	return nil, errors.New("recent files transaction remained busy")
}

func (repository *SqliteRecentFilesRepository) withEntriesAttempt(ctx context.Context, mutate func([]string) ([]string, bool, error), immediate bool) ([]string, bool, error) {
	var result []string
	transaction := repository.store.Tx
	if immediate {
		transaction = repository.store.TxImmediate
	}
	err := transaction(ctx, func(transaction *kv.Tx) error {
		entries, err := readRecentFilesTx(ctx, transaction)
		if err != nil {
			return err
		}
		if repository.afterReadDecision != nil {
			hook := repository.afterReadDecision
			repository.afterReadDecision = nil
			hook()
		}
		next, changed, err := mutate(entries)
		if err != nil {
			return err
		}
		next = normalizeRecentFiles(next)
		if changed {
			if err := writeRecentFilesTx(ctx, transaction, next); err != nil {
				return err
			}
		}
		result = next
		return nil
	})
	if err != nil {
		return nil, isRecentSQLiteBusy(err), err
	}
	return result, false, nil
}

func readRecentFilesTx(ctx context.Context, query *kv.Tx) ([]string, error) {
	entry, found, err := query.Get(ctx, recentFilesSettingKey)
	if err != nil {
		return nil, fmt.Errorf("read recent files: %w", err)
	}
	if !found {
		return nil, nil
	}
	var value recentFilesValue
	valid, err := kv.DecodeVersionedJSON(entry.Value, 1, &value)
	if err != nil || !valid {
		// Recent-file metadata is optional presentation state. A corrupt or
		// unknown value must not prevent startup or block later promotion.
		return nil, nil
	}
	return value.Entries, nil
}

func writeRecentFilesTx(ctx context.Context, query *kv.Tx, entries []string) error {
	encoded, err := kv.EncodeVersionedJSON(1, struct {
		Entries []string `json:"entries"`
	}{Entries: entries})
	if err != nil {
		return fmt.Errorf("encode recent files: %w", err)
	}
	if err := query.Upsert(ctx, kv.KVEntry{Key: recentFilesSettingKey, Value: encoded, Type: recentFilesSettingType}); err != nil {
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
