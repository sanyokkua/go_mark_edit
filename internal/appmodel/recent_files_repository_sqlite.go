package appmodel

import (
	"context"
	"errors"
	"fmt"
	"os"
	"strings"

	"github.com/sanyokkua/go_mark_edit/internal/apperr"
	"github.com/sanyokkua/go_mark_edit/internal/db"
	"github.com/sanyokkua/go_mark_edit/internal/file"
	"github.com/sanyokkua/go_mark_edit/internal/kv"
)

// SqliteRecentItemsRepository stores only the versioned recent-item envelope
// in the existing settings KV table. It owns no document/session state.
type SqliteRecentItemsRepository struct {
	store             *kv.Store
	afterReadDecision func()
}

func NewSqliteRecentItemsRepository(database *db.Database) *SqliteRecentItemsRepository {
	if database == nil {
		return &SqliteRecentItemsRepository{store: kv.New(nil)}
	}
	return &SqliteRecentItemsRepository{store: kv.New(database.DB)}
}

type recentItemsValue struct {
	Version int                 `json:"version"`
	Entries []apperr.RecentItem `json:"entries"`
}

type legacyRecentValue struct {
	Version int      `json:"version"`
	Entries []string `json:"entries"`
}

func (repository *SqliteRecentItemsRepository) List(ctx context.Context) ([]apperr.RecentItem, error) {
	return repository.withItems(ctx, false, func(entries []apperr.RecentItem) ([]apperr.RecentItem, bool, error) {
		normalized := normalizeRecentItems(entries)
		changed := false
		filtered := normalized[:0]
		for _, item := range normalized {
			_, statErr := os.Stat(item.Path)
			if statErr == nil {
				filtered = append(filtered, item)
				continue
			}
			if errors.Is(statErr, os.ErrNotExist) {
				changed = true
				continue
			}
			return nil, false, fmt.Errorf("validate recent item: %w", statErr)
		}
		if !sameRecentItems(filtered, normalized) {
			changed = true
		}
		return filtered, changed, nil
	})
}

func (repository *SqliteRecentItemsRepository) Promote(ctx context.Context, path, kind string) ([]apperr.RecentItem, error) {
	if strings.TrimSpace(path) == "" {
		return nil, errors.New("recent item path is required")
	}
	if kind != "file" && kind != "folder" {
		return nil, errors.New("recent item kind is required")
	}
	item := apperr.RecentItem{Path: canonicalRecentPath(path), Kind: kind}
	return repository.withItems(ctx, true, func(entries []apperr.RecentItem) ([]apperr.RecentItem, bool, error) {
		current := normalizeRecentItems(entries)
		promoted := make([]apperr.RecentItem, 0, maxRecentItems)
		promoted = append(promoted, item)
		for _, candidate := range current {
			if candidate.Path == item.Path || len(promoted) == maxRecentItems {
				continue
			}
			promoted = append(promoted, candidate)
		}
		return promoted, !sameRecentItems(current, promoted), nil
	})
}

func (repository *SqliteRecentItemsRepository) Clear(ctx context.Context) error {
	_, err := repository.withItems(ctx, true, func([]apperr.RecentItem) ([]apperr.RecentItem, bool, error) {
		return nil, true, nil
	})
	return err
}

func (repository *SqliteRecentItemsRepository) withItems(ctx context.Context, persistLegacy bool, mutate func([]apperr.RecentItem) ([]apperr.RecentItem, bool, error)) ([]apperr.RecentItem, error) {
	if repository == nil || repository.store == nil {
		return nil, errors.New("recent items database is not configured")
	}
	if ctx == nil {
		ctx = context.Background()
	}
	for attempt := 0; attempt < 4; attempt++ {
		entries, retry, err := repository.withItemsAttempt(ctx, persistLegacy, mutate, attempt > 0)
		if err == nil || !retry {
			return entries, err
		}
	}
	return nil, errors.New("recent items transaction remained busy")
}

func (repository *SqliteRecentItemsRepository) withItemsAttempt(ctx context.Context, persistLegacy bool, mutate func([]apperr.RecentItem) ([]apperr.RecentItem, bool, error), immediate bool) ([]apperr.RecentItem, bool, error) {
	var result []apperr.RecentItem
	transaction := repository.store.Tx
	if immediate {
		transaction = repository.store.TxImmediate
	}
	err := transaction(ctx, func(transaction *kv.Tx) error {
		entries, legacy, err := readRecentItemsTx(ctx, transaction)
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
		next = normalizeRecentItems(next)
		if changed || (legacy && persistLegacy) {
			if err := writeRecentItemsTx(ctx, transaction, next); err != nil {
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

func readRecentItemsTx(ctx context.Context, query *kv.Tx) ([]apperr.RecentItem, bool, error) {
	entry, found, err := query.Get(ctx, recentItemsSettingKey)
	if err != nil {
		return nil, false, fmt.Errorf("read recent items: %w", err)
	}
	if !found {
		return nil, false, nil
	}
	var current recentItemsValue
	valid, err := kv.DecodeVersionedJSON(entry.Value, 2, &current)
	if err != nil {
		return nil, false, nil
	}
	if valid {
		return current.Entries, false, nil
	}
	var legacy legacyRecentValue
	valid, err = kv.DecodeVersionedJSON(entry.Value, 1, &legacy)
	if err != nil || !valid {
		return nil, false, nil
	}
	items := make([]apperr.RecentItem, 0, len(legacy.Entries))
	for _, path := range legacy.Entries {
		items = append(items, apperr.RecentItem{Path: path, Kind: "file"})
	}
	return items, true, nil
}

func writeRecentItemsTx(ctx context.Context, query *kv.Tx, entries []apperr.RecentItem) error {
	encoded, err := kv.EncodeVersionedJSON(2, struct {
		Entries []apperr.RecentItem `json:"entries"`
	}{Entries: entries})
	if err != nil {
		return fmt.Errorf("encode recent items: %w", err)
	}
	if err := query.Upsert(ctx, kv.KVEntry{Key: recentItemsSettingKey, Value: encoded, Type: recentItemsSettingType}); err != nil {
		return fmt.Errorf("write recent items: %w", err)
	}
	return nil
}

func normalizeRecentItems(entries []apperr.RecentItem) []apperr.RecentItem {
	result := make([]apperr.RecentItem, 0, maxRecentItems)
	seen := make(map[string]struct{}, len(entries))
	for _, item := range entries {
		item.Path = canonicalRecentPath(item.Path)
		if item.Path == "" || (item.Kind != "file" && item.Kind != "folder") {
			continue
		}
		if _, exists := seen[item.Path]; exists {
			continue
		}
		seen[item.Path] = struct{}{}
		result = append(result, item)
		if len(result) == maxRecentItems {
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

func sameRecentItems(left, right []apperr.RecentItem) bool {
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

var _ RecentItemsRepository = (*SqliteRecentItemsRepository)(nil)
