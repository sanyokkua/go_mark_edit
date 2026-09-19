package appmodel

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"strconv"
	"strings"

	"github.com/sanyokkua/go_mark_edit/internal/db"
	"github.com/sanyokkua/go_mark_edit/internal/kv"
)

const layoutSettingPrefix = "layout."

// SqliteLayoutRepository stores versioned layout envelopes in the existing
// additive settings KV table. Each durable field arbitrates independently.
type SqliteLayoutRepository struct {
	store             *kv.Store
	afterReadDecision func()
}

func NewSqliteLayoutRepository(database *db.Database) *SqliteLayoutRepository {
	if database == nil {
		return &SqliteLayoutRepository{store: kv.New(nil)}
	}
	return &SqliteLayoutRepository{store: kv.New(database.DB)}
}

func (repository *SqliteLayoutRepository) Read(ctx context.Context, field string) (VersionedLayoutValue, bool, error) {
	entry, found, err := repository.store.Get(ctx, layoutKey(field))
	if err != nil {
		return VersionedLayoutValue{}, false, fmt.Errorf("read layout field: %w", err)
	}
	if !found {
		return VersionedLayoutValue{}, false, nil
	}
	value, valid, err := decodeLayoutValue(entry.Value)
	if err != nil || !valid {
		return VersionedLayoutValue{}, false, nil
	}
	return value, true, nil
}

func (repository *SqliteLayoutRepository) Write(ctx context.Context, field string, candidate VersionedLayoutValue) (LayoutWriteResult, error) {
	if err := validateVersionedLayoutValue(field, candidate); err != nil {
		return LayoutWriteResult{}, err
	}
	encoded, err := kv.EncodeVersionedJSON(1, map[string]any{
		"value":             candidate.Value,
		"changedAtUnixNano": candidate.ChangedAtUnixNano,
		"writerId":          candidate.WriterID,
		"sequence":          candidate.Sequence,
	})
	if err != nil {
		return LayoutWriteResult{}, fmt.Errorf("encode layout value: %w", err)
	}

	for attempt := 0; attempt < 3; attempt++ {
		result := LayoutWriteResult{}
		err := repository.store.Tx(ctx, func(transaction *kv.Tx) error {
			storedEntry, found, err := transaction.Get(ctx, layoutKey(field))
			if err != nil {
				return err
			}
			if repository.afterReadDecision != nil {
				hook := repository.afterReadDecision
				repository.afterReadDecision = nil
				hook()
			}
			if found {
				stored, valid, decodeErr := decodeLayoutValue(storedEntry.Value)
				if decodeErr == nil && valid && !layoutValueIsNewer(candidate, stored) {
					result.Value = stored
					return nil
				}
			}
			if err := transaction.Upsert(ctx, kv.KVEntry{Key: layoutKey(field), Value: encoded, Type: "layout.versioned"}); err != nil {
				return err
			}
			result = LayoutWriteResult{Applied: true, Value: candidate}
			return nil
		})
		if err == nil {
			return result, nil
		}
		if !isSQLiteBusy(err) {
			return LayoutWriteResult{}, fmt.Errorf("write layout value: %w", err)
		}
	}
	return LayoutWriteResult{}, errors.New("layout transaction remained busy")
}

func layoutKey(field string) string { return layoutSettingPrefix + field }

func decodeLayoutValue(encoded string) (VersionedLayoutValue, bool, error) {
	var value VersionedLayoutValue
	found, err := kv.DecodeVersionedJSON(encoded, 1, &value)
	if err != nil {
		legacyWidth, legacyErr := strconv.Atoi(strings.TrimSpace(encoded))
		if legacyErr == nil {
			return VersionedLayoutValue{Version: 1, Value: legacyWidth}, true, nil
		}
		return VersionedLayoutValue{}, false, err
	}
	if !found {
		return VersionedLayoutValue{}, false, nil
	}
	if number, ok := value.Value.(json.Number); ok {
		integer, err := number.Int64()
		if err != nil {
			return VersionedLayoutValue{}, false, fmt.Errorf("decode integer layout value: %w", err)
		}
		value.Value = int(integer)
	}
	if value.Version != 1 || value.WriterID == "" || value.Sequence == 0 {
		return VersionedLayoutValue{}, false, nil
	}
	return value, true, nil
}

func validateVersionedLayoutValue(field string, value VersionedLayoutValue) error {
	if value.Version != 1 || value.WriterID == "" || value.Sequence == 0 {
		return fmt.Errorf("invalid layout value identity")
	}
	integer, ok := value.Value.(int)
	switch field {
	case LayoutWindowWidth:
		if !ok || integer < 375 {
			return fmt.Errorf("invalid native window width")
		}
	case LayoutWindowHeight:
		if !ok || integer < 480 {
			return fmt.Errorf("invalid native window height")
		}
	case LayoutWindowMaximized, LayoutWorkspaceVisible:
		if _, ok := value.Value.(bool); !ok {
			return fmt.Errorf("invalid boolean layout value")
		}
	case LayoutWorkspaceWidth:
		if !ok || integer < 0 {
			return fmt.Errorf("invalid workspace width")
		}
	case LayoutArrangementBackup:
		arrangement, ok := value.Value.(string)
		if !ok || (arrangement != ArrangementEditor && arrangement != ArrangementSplit && arrangement != ArrangementPreview) {
			return fmt.Errorf("invalid arrangement fallback")
		}
	default:
		return fmt.Errorf("unknown layout field")
	}
	return nil
}

func layoutValueIsNewer(candidate, stored VersionedLayoutValue) bool {
	if candidate.ChangedAtUnixNano != stored.ChangedAtUnixNano {
		return candidate.ChangedAtUnixNano > stored.ChangedAtUnixNano
	}
	if candidate.WriterID != stored.WriterID {
		return candidate.WriterID > stored.WriterID
	}
	return candidate.Sequence > stored.Sequence
}

func isSQLiteBusy(err error) bool {
	if err == nil {
		return false
	}
	message := strings.ToLower(err.Error())
	return strings.Contains(message, "busy") || strings.Contains(message, "locked")
}

var _ LayoutRepositoryAPI = (*SqliteLayoutRepository)(nil)
