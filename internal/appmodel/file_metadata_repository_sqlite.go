package appmodel

import (
	"context"
	"crypto/sha256"
	"database/sql"
	"encoding/hex"
	"encoding/json"
	"fmt"

	"github.com/sanyokkua/go_mark_edit/internal/db"
)

const documentViewSettingPrefix = "document.view."

type SqliteFileMetadataRepository struct {
	database *sql.DB
}

func NewSqliteFileMetadataRepository(database *db.Database) *SqliteFileMetadataRepository {
	return &SqliteFileMetadataRepository{database: database.DB}
}

func (repository *SqliteFileMetadataRepository) ReadArrangement(ctx context.Context, canonicalPath string) (string, bool, error) {
	var encoded string
	err := repository.database.QueryRowContext(ctx, "SELECT value FROM settings WHERE key = ?", documentViewKey(canonicalPath)).Scan(&encoded)
	if err == sql.ErrNoRows {
		return "", false, nil
	}
	if err != nil {
		return "", false, fmt.Errorf("read document arrangement: %w", err)
	}
	var stored struct {
		Version     int    `json:"version"`
		Arrangement string `json:"arrangement"`
	}
	if err := json.Unmarshal([]byte(encoded), &stored); err != nil || stored.Version != 1 || !validArrangement(stored.Arrangement) {
		return "", false, nil
	}
	return stored.Arrangement, true, nil
}

func (repository *SqliteFileMetadataRepository) WriteArrangement(ctx context.Context, canonicalPath, arrangement string) error {
	if !validArrangement(arrangement) {
		return fmt.Errorf("invalid document arrangement")
	}
	encoded, err := json.Marshal(struct {
		Version     int    `json:"version"`
		Arrangement string `json:"arrangement"`
	}{Version: 1, Arrangement: arrangement})
	if err != nil {
		return fmt.Errorf("encode document arrangement: %w", err)
	}
	_, err = repository.database.ExecContext(ctx, `
INSERT INTO settings (key, value, type) VALUES (?, ?, ?)
ON CONFLICT(key) DO UPDATE SET value = excluded.value, type = excluded.type
`, documentViewKey(canonicalPath), string(encoded), "document.view.v1")
	if err != nil {
		return fmt.Errorf("write document arrangement: %w", err)
	}
	return nil
}

func documentViewKey(canonicalPath string) string {
	hash := sha256.Sum256([]byte(canonicalPath))
	return documentViewSettingPrefix + hex.EncodeToString(hash[:])
}

var _ FileMetadataRepository = (*SqliteFileMetadataRepository)(nil)
