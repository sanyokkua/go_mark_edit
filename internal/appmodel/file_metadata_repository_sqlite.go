package appmodel

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"fmt"

	"github.com/sanyokkua/go_mark_edit/internal/db"
	"github.com/sanyokkua/go_mark_edit/internal/kv"
)

const documentViewSettingPrefix = "document.view."

type SqliteFileMetadataRepository struct {
	store *kv.Store
}

func NewSqliteFileMetadataRepository(database *db.Database) *SqliteFileMetadataRepository {
	if database == nil {
		return &SqliteFileMetadataRepository{store: kv.New(nil)}
	}
	return &SqliteFileMetadataRepository{store: kv.New(database.DB)}
}

func (repository *SqliteFileMetadataRepository) ReadArrangement(ctx context.Context, canonicalPath string) (string, bool, error) {
	entry, found, err := repository.store.Get(ctx, documentViewKey(canonicalPath))
	if err != nil {
		return "", false, fmt.Errorf("read document arrangement: %w", err)
	}
	if !found {
		return "", false, nil
	}
	var stored struct {
		Version     int    `json:"version"`
		Arrangement string `json:"arrangement"`
	}
	valid, err := kv.DecodeVersionedJSON(entry.Value, 1, &stored)
	if err != nil || !valid || !validArrangement(stored.Arrangement) {
		return "", false, nil
	}
	return stored.Arrangement, true, nil
}

func (repository *SqliteFileMetadataRepository) WriteArrangement(ctx context.Context, canonicalPath, arrangement string) error {
	if !validArrangement(arrangement) {
		return fmt.Errorf("invalid document arrangement")
	}
	encoded, err := kv.EncodeVersionedJSON(1, struct {
		Arrangement string `json:"arrangement"`
	}{Arrangement: arrangement})
	if err != nil {
		return fmt.Errorf("encode document arrangement: %w", err)
	}
	if err := repository.store.Upsert(ctx, kv.KVEntry{Key: documentViewKey(canonicalPath), Value: encoded, Type: "document.view.v1"}); err != nil {
		return fmt.Errorf("write document arrangement: %w", err)
	}
	return nil
}

func documentViewKey(canonicalPath string) string {
	hash := sha256.Sum256([]byte(canonicalPath))
	return documentViewSettingPrefix + hex.EncodeToString(hash[:])
}

var _ FileMetadataRepository = (*SqliteFileMetadataRepository)(nil)
