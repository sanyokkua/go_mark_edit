package kv_test

import (
	"context"
	"errors"
	"path/filepath"
	"testing"

	"github.com/sanyokkua/go_mark_edit/internal/apperr"
	"github.com/sanyokkua/go_mark_edit/internal/db"
	"github.com/sanyokkua/go_mark_edit/internal/kv"
	"github.com/sanyokkua/go_mark_edit/internal/settings"
)

func TestStoreRoundTripsEntriesAndReportsMissingRows(t *testing.T) {
	store := openStore(t)
	ctx := context.Background()

	entry, found, err := store.Get(ctx, "missing.key")
	if err != nil {
		t.Fatalf("read missing entry: %v", err)
	}
	if found || entry != (kv.KVEntry{}) {
		t.Fatalf("missing entry = %+v, found=%t; want zero entry and absent", entry, found)
	}

	want := kv.KVEntry{Key: "owned.key", Value: "value", Type: "string"}
	if err := store.Upsert(ctx, want); err != nil {
		t.Fatalf("write entry: %v", err)
	}
	got, found, err := store.Get(ctx, want.Key)
	if err != nil || !found {
		t.Fatalf("read entry = %+v, found=%t, error=%v", got, found, err)
	}
	if got != want {
		t.Fatalf("round-tripped entry = %+v, want %+v", got, want)
	}
}

func TestStoreTransactionsCommitTogetherAndRollBackTogether(t *testing.T) {
	store := openStore(t)
	ctx := context.Background()

	if err := store.Tx(ctx, func(transaction *kv.Tx) error {
		if err := transaction.Upsert(ctx, kv.KVEntry{Key: "group.first", Value: "one", Type: "string"}); err != nil {
			return err
		}
		return transaction.Upsert(ctx, kv.KVEntry{Key: "group.second", Value: "two", Type: "string"})
	}); err != nil {
		t.Fatalf("commit transaction: %v", err)
	}
	for key, want := range map[string]string{"group.first": "one", "group.second": "two"} {
		entry, found, err := store.Get(ctx, key)
		if err != nil || !found || entry.Value != want {
			t.Fatalf("committed %q = %+v, found=%t, error=%v; want %q", key, entry, found, err, want)
		}
	}

	sentinel := errors.New("rollback")
	if err := store.Tx(ctx, func(transaction *kv.Tx) error {
		if err := transaction.Upsert(ctx, kv.KVEntry{Key: "group.first", Value: "changed", Type: "string"}); err != nil {
			return err
		}
		return sentinel
	}); !errors.Is(err, sentinel) {
		t.Fatalf("rollback error = %v, want %v", err, sentinel)
	}
	entry, found, err := store.Get(ctx, "group.first")
	if err != nil || !found || entry.Value != "one" {
		t.Fatalf("rolled-back entry = %+v, found=%t, error=%v; want original value", entry, found, err)
	}
}

func TestVersionedJSONDistinguishesValidUnknownAndCorruptValues(t *testing.T) {
	type payload struct {
		Name string `json:"name"`
	}
	encoded, err := kv.EncodeVersionedJSON(1, payload{Name: "local"})
	if err != nil {
		t.Fatalf("encode versioned value: %v", err)
	}

	var decoded struct {
		Version int    `json:"version"`
		Name    string `json:"name"`
	}
	found, err := kv.DecodeVersionedJSON(encoded, 1, &decoded)
	if err != nil || !found {
		t.Fatalf("decode current version = found %t, error %v", found, err)
	}
	if decoded.Version != 1 || decoded.Name != "local" {
		t.Fatalf("decoded current version = %+v", decoded)
	}

	found, err = kv.DecodeVersionedJSON(`{"version":99,"name":"future"}`, 1, &decoded)
	if err != nil || found {
		t.Fatalf("decode unknown version = found %t, error %v; want absent without error", found, err)
	}
	found, err = kv.DecodeVersionedJSON("not-json", 1, &decoded)
	if err == nil || found {
		t.Fatalf("decode corrupt value = found %t, error %v; want a decode error", found, err)
	}
	for name, corrupt := range map[string]string{
		"trailing bytes":  encoded + "garbage",
		"second document": encoded + ` {"version":1,"name":"other"}`,
	} {
		t.Run(name, func(t *testing.T) {
			found, err := kv.DecodeVersionedJSON(corrupt, 1, &decoded)
			if err == nil || found {
				t.Fatalf("decode %s = found %t, error %v; want a decode error", name, found, err)
			}
		})
	}
}

func TestSettingsUpdateLeavesForeignRowsByteForByteUntouched(t *testing.T) {
	ctx := context.Background()
	database, err := db.Open(ctx, filepath.Join(t.TempDir(), "settings.db"))
	if err != nil {
		t.Fatalf("open temporary database: %v", err)
	}
	t.Cleanup(func() { _ = database.Close() })
	store := kv.New(database.DB)
	foreign := kv.KVEntry{Key: "future.owner.setting", Value: `{"opaque":[1,2,3]}`, Type: "future.v9"}
	if err := store.Upsert(ctx, foreign); err != nil {
		t.Fatalf("seed foreign row: %v", err)
	}

	if err := settings.NewSqliteSettingsRepository(database).UpdateAppearance(ctx, apperr.AppearanceSettings{
		Theme:           settings.ThemeGlass,
		Mode:            settings.ModeDark,
		DefaultOpenMode: settings.OpenModeViewer,
	}); err != nil {
		t.Fatalf("update owned appearance rows: %v", err)
	}
	got, found, err := store.Get(ctx, foreign.Key)
	if err != nil || !found {
		t.Fatalf("read foreign row = %+v, found=%t, error=%v", got, found, err)
	}
	if got != foreign {
		t.Fatalf("foreign row after owned update = %+v, want %+v", got, foreign)
	}
}

func openStore(t *testing.T) *kv.Store {
	t.Helper()
	database, err := db.Open(context.Background(), filepath.Join(t.TempDir(), "settings.db"))
	if err != nil {
		t.Fatalf("open temporary database: %v", err)
	}
	t.Cleanup(func() {
		if err := database.Close(); err != nil {
			t.Errorf("close temporary database: %v", err)
		}
	})
	return kv.New(database.DB)
}
