package appmodel

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
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

func (repository *SqliteFileMetadataRepository) ReadView(ctx context.Context, canonicalPath string) (FileViewMetadata, bool, error) {
	entry, found, err := repository.store.Get(ctx, documentViewKey(canonicalPath))
	if err != nil {
		return FileViewMetadata{}, false, fmt.Errorf("read document view: %w", err)
	}
	if !found {
		return FileViewMetadata{}, false, nil
	}
	var stored struct {
		Version     int             `json:"version"`
		Arrangement string          `json:"arrangement"`
		SplitRatio  json.RawMessage `json:"splitRatio"`
	}
	valid, err := kv.DecodeVersionedJSON(entry.Value, 1, &stored)
	if err != nil || !valid || !validArrangement(stored.Arrangement) {
		return FileViewMetadata{}, false, nil
	}
	ratio := defaultSplitRatio
	var decoded float64
	if len(stored.SplitRatio) != 0 && json.Unmarshal(stored.SplitRatio, &decoded) == nil && validSplitRatio(decoded) {
		ratio = decoded
	}
	return FileViewMetadata{Arrangement: stored.Arrangement, SplitRatio: ratio}, true, nil
}

func (repository *SqliteFileMetadataRepository) WriteView(ctx context.Context, canonicalPath string, view FileViewMetadata) error {
	if !validArrangement(view.Arrangement) || !validSplitRatio(view.SplitRatio) {
		return fmt.Errorf("invalid document view")
	}
	encoded, err := kv.EncodeVersionedJSON(1, struct {
		Arrangement string  `json:"arrangement"`
		SplitRatio  float64 `json:"splitRatio"`
	}{Arrangement: view.Arrangement, SplitRatio: view.SplitRatio})
	if err != nil {
		return fmt.Errorf("encode document view: %w", err)
	}
	if err := repository.store.Upsert(ctx, kv.KVEntry{Key: documentViewKey(canonicalPath), Value: encoded, Type: "document.view.v1"}); err != nil {
		return fmt.Errorf("write document view: %w", err)
	}
	return nil
}

func documentViewKey(canonicalPath string) string {
	hash := sha256.Sum256([]byte(canonicalPath))
	return documentViewSettingPrefix + hex.EncodeToString(hash[:])
}

var _ FileMetadataRepository = (*SqliteFileMetadataRepository)(nil)
