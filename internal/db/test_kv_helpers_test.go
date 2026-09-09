package db

import (
	"context"
	"database/sql"

	"github.com/sanyokkua/go_mark_edit/internal/kv"
)

type testSetting struct {
	Key   string
	Value string
	Type  string
}

func writeTestSetting(database *Database, ctx context.Context, setting testSetting) error {
	return kv.New(database.DB).Upsert(ctx, kv.KVEntry{Key: setting.Key, Value: setting.Value, Type: setting.Type})
}

func readTestSetting(database *Database, ctx context.Context, key string) (testSetting, error) {
	entry, found, err := kv.New(database.DB).Get(ctx, key)
	if err != nil {
		return testSetting{}, err
	}
	if !found {
		return testSetting{}, sql.ErrNoRows
	}
	return testSetting{Key: entry.Key, Value: entry.Value, Type: entry.Type}, nil
}
