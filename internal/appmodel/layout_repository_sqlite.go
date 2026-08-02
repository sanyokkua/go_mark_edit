package appmodel

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"strconv"
	"strings"

	"github.com/sanyokkua/go_mark_edit/internal/db"
)

const layoutSettingPrefix = "layout."

// SqliteLayoutRepository stores versioned layout envelopes in the existing
// additive settings KV table. Each durable field arbitrates independently.
type SqliteLayoutRepository struct {
	database          *sql.DB
	afterReadDecision func()
}

func NewSqliteLayoutRepository(database *db.Database) *SqliteLayoutRepository {
	return &SqliteLayoutRepository{database: database.DB}
}

func (repository *SqliteLayoutRepository) Read(ctx context.Context, field string) (VersionedLayoutValue, bool, error) {
	var encoded string
	err := repository.database.QueryRowContext(ctx, "SELECT value FROM settings WHERE key = ?", layoutKey(field)).Scan(&encoded)
	if err == sql.ErrNoRows {
		return VersionedLayoutValue{}, false, nil
	}
	if err != nil {
		return VersionedLayoutValue{}, false, fmt.Errorf("read layout field: %w", err)
	}
	value, err := decodeLayoutValue(encoded)
	if err != nil {
		return VersionedLayoutValue{}, false, err
	}
	return value, true, nil
}

func (repository *SqliteLayoutRepository) Write(ctx context.Context, field string, candidate VersionedLayoutValue) (LayoutWriteResult, error) {
	if err := validateVersionedLayoutValue(field, candidate); err != nil {
		return LayoutWriteResult{}, err
	}
	encodedBytes, err := json.Marshal(candidate)
	if err != nil {
		return LayoutWriteResult{}, fmt.Errorf("encode layout value: %w", err)
	}
	if repository.afterReadDecision != nil {
		repository.afterReadDecision()
	}
	result, err := repository.database.ExecContext(ctx, `
INSERT INTO settings (key, value, type)
VALUES (?, ?, ?)
ON CONFLICT(key) DO UPDATE SET
	value = excluded.value,
	type = excluded.type
WHERE
	settings.type != 'layout.versioned'
	OR COALESCE(CAST(json_extract(settings.value, '$.changedAtUnixNano') AS INTEGER), -9223372036854775808) < ?
	OR (
		COALESCE(CAST(json_extract(settings.value, '$.changedAtUnixNano') AS INTEGER), -9223372036854775808) = ?
		AND COALESCE(CAST(json_extract(settings.value, '$.writerId') AS TEXT), '') < ?
	)
	OR (
		COALESCE(CAST(json_extract(settings.value, '$.changedAtUnixNano') AS INTEGER), -9223372036854775808) = ?
		AND COALESCE(CAST(json_extract(settings.value, '$.writerId') AS TEXT), '') = ?
		AND COALESCE(CAST(json_extract(settings.value, '$.sequence') AS INTEGER), 0) < ?
	)
`, layoutKey(field), string(encodedBytes), "layout.versioned",
		candidate.ChangedAtUnixNano,
		candidate.ChangedAtUnixNano, candidate.WriterID,
		candidate.ChangedAtUnixNano, candidate.WriterID, int64(candidate.Sequence))
	if err != nil {
		return LayoutWriteResult{}, fmt.Errorf("write layout value: %w", err)
	}
	rowsAffected, err := result.RowsAffected()
	if err != nil {
		return LayoutWriteResult{}, fmt.Errorf("inspect layout write result: %w", err)
	}
	if rowsAffected > 0 {
		return LayoutWriteResult{Applied: true, Value: candidate}, nil
	}
	stored, found, err := repository.Read(ctx, field)
	if err != nil {
		return LayoutWriteResult{}, err
	}
	if !found {
		return LayoutWriteResult{}, fmt.Errorf("read stored layout winner: no row after stale write")
	}
	return LayoutWriteResult{Value: stored}, nil
}

func layoutKey(field string) string { return layoutSettingPrefix + field }

func decodeLayoutValue(encoded string) (VersionedLayoutValue, error) {
	var value VersionedLayoutValue
	decoder := json.NewDecoder(strings.NewReader(encoded))
	decoder.UseNumber()
	if err := decoder.Decode(&value); err != nil {
		legacyWidth, legacyErr := strconv.Atoi(encoded)
		if legacyErr == nil {
			return VersionedLayoutValue{Version: 1, Value: legacyWidth}, nil
		}
		return VersionedLayoutValue{}, fmt.Errorf("decode layout value: %w", err)
	}
	if number, ok := value.Value.(json.Number); ok {
		integer, err := number.Int64()
		if err != nil {
			return VersionedLayoutValue{}, fmt.Errorf("decode integer layout value: %w", err)
		}
		value.Value = int(integer)
	}
	if value.Version < 1 || value.WriterID == "" || value.Sequence == 0 {
		return VersionedLayoutValue{}, fmt.Errorf("invalid versioned layout value")
	}
	return value, nil
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

var _ LayoutRepositoryAPI = (*SqliteLayoutRepository)(nil)
