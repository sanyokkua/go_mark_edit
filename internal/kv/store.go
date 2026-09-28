// Package kv owns the small SQLite key-value persistence contract shared by
// settings and application metadata repositories.
package kv

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
)

const (
	getEntryStatement = `
SELECT key, value, type
FROM settings
WHERE key = ?
`
	upsertEntryStatement = `
INSERT INTO settings (key, value, type)
VALUES (?, ?, ?)
ON CONFLICT(key) DO UPDATE SET
	value = excluded.value,
	type = excluded.type
`
)

// KVEntry is the persisted row shape. Value remains text so each owner can
// choose the scalar or versioned-JSON representation appropriate to its key.
type KVEntry struct {
	Key   string
	Value string
	Type  string
}

// Store provides reads, writes, and transactions over the settings table.
type Store struct {
	database *sql.DB
}

// New constructs a key-value store over an opened database connection.
func New(database *sql.DB) *Store {
	return &Store{database: database}
}

// Get returns found=false for a missing key. A database or scan failure is
// returned as an error and is never confused with an absent row.
func (store *Store) Get(ctx context.Context, key string) (KVEntry, bool, error) {
	if err := store.validate(key); err != nil {
		return KVEntry{}, false, err
	}
	entry, err := get(ctx, store.database, key)
	if errors.Is(err, sql.ErrNoRows) {
		return KVEntry{}, false, nil
	}
	if err != nil {
		return KVEntry{}, false, fmt.Errorf("get key %q: %w", key, err)
	}
	return entry, true, nil
}

// Upsert stores one entry using the helper's sole parameterised write.
func (store *Store) Upsert(ctx context.Context, entry KVEntry) error {
	if err := store.validate(entry.Key); err != nil {
		return err
	}
	return upsert(ctx, store.database, entry)
}

// Tx runs fn in one transaction. Returning an error rolls the transaction
// back; a successful callback is committed only after every operation has
// completed successfully.
func (store *Store) Tx(ctx context.Context, fn func(*Tx) error) error {
	if store == nil || store.database == nil {
		return errors.New("key-value database is not configured")
	}
	if fn == nil {
		return errors.New("key-value transaction callback is required")
	}
	ctx = normalizeContext(ctx)
	transaction, err := store.database.BeginTx(ctx, nil)
	if err != nil {
		return fmt.Errorf("begin key-value transaction: %w", err)
	}
	defer func() { _ = transaction.Rollback() }()

	if err := fn(&Tx{transaction: transaction}); err != nil {
		return err
	}
	if err := transaction.Commit(); err != nil {
		return fmt.Errorf("commit key-value transaction: %w", err)
	}
	return nil
}

// TxImmediate runs fn in a write transaction that acquires SQLite's reserved
// lock before the callback reads. A deferred transaction can read a WAL
// snapshot and then fail its write upgrade immediately when another writer is
// active, so write/read-modify-write callers use this form when waiting for
// the busy timeout is part of their contract.
func (store *Store) TxImmediate(ctx context.Context, fn func(*Tx) error) error {
	if store == nil || store.database == nil {
		return errors.New("key-value database is not configured")
	}
	if fn == nil {
		return errors.New("key-value transaction callback is required")
	}
	ctx = normalizeContext(ctx)
	connection, err := store.database.Conn(ctx)
	if err != nil {
		return fmt.Errorf("reserve key-value connection: %w", err)
	}
	transactionStarted := false
	defer func() {
		if transactionStarted {
			_, _ = connection.ExecContext(context.Background(), "ROLLBACK")
		}
		_ = connection.Close()
	}()
	if _, err := connection.ExecContext(ctx, "BEGIN IMMEDIATE"); err != nil {
		return fmt.Errorf("begin immediate key-value transaction: %w", err)
	}
	transactionStarted = true
	if err := fn(&Tx{transaction: connection}); err != nil {
		return err
	}
	if _, err := connection.ExecContext(ctx, "COMMIT"); err != nil {
		return fmt.Errorf("commit immediate key-value transaction: %w", err)
	}
	transactionStarted = false
	return nil
}

// Tx is the transaction-scoped view of the same key-value operations.
type Tx struct {
	transaction queryExecutor
}

// Get reads a row without leaving the transaction.
func (transaction *Tx) Get(ctx context.Context, key string) (KVEntry, bool, error) {
	if transaction == nil || transaction.transaction == nil {
		return KVEntry{}, false, errors.New("key-value transaction is not configured")
	}
	if key == "" {
		return KVEntry{}, false, errors.New("key-value key is required")
	}
	entry, err := get(ctx, transaction.transaction, key)
	if errors.Is(err, sql.ErrNoRows) {
		return KVEntry{}, false, nil
	}
	if err != nil {
		return KVEntry{}, false, fmt.Errorf("get key %q: %w", key, err)
	}
	return entry, true, nil
}

// Upsert writes a row without leaving the transaction.
func (transaction *Tx) Upsert(ctx context.Context, entry KVEntry) error {
	if transaction == nil || transaction.transaction == nil {
		return errors.New("key-value transaction is not configured")
	}
	if entry.Key == "" {
		return errors.New("key-value key is required")
	}
	return upsert(ctx, transaction.transaction, entry)
}

type queryExecutor interface {
	QueryRowContext(context.Context, string, ...any) *sql.Row
	ExecContext(context.Context, string, ...any) (sql.Result, error)
}

func get(ctx context.Context, query queryExecutor, key string) (KVEntry, error) {
	ctx = normalizeContext(ctx)
	var entry KVEntry
	err := query.QueryRowContext(ctx, getEntryStatement, key).Scan(&entry.Key, &entry.Value, &entry.Type)
	return entry, err
}

func upsert(ctx context.Context, query queryExecutor, entry KVEntry) error {
	ctx = normalizeContext(ctx)
	_, err := query.ExecContext(ctx, upsertEntryStatement, entry.Key, entry.Value, entry.Type)
	if err != nil {
		return fmt.Errorf("upsert key %q: %w", entry.Key, err)
	}
	return nil
}

func (store *Store) validate(key string) error {
	if store == nil || store.database == nil {
		return errors.New("key-value database is not configured")
	}
	if key == "" {
		return errors.New("key-value key is required")
	}
	return nil
}

func normalizeContext(ctx context.Context) context.Context {
	if ctx == nil {
		return context.Background()
	}
	return ctx
}
