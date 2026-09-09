package db

import (
	"context"
	"database/sql"
	"path/filepath"
	"testing"
	"time"
)

// Proves: STORY-004-AC-2
// Open applies the embedded additive migration before generated settings queries are available.
func TestOpenAppliesAdditiveMigrationsAndGeneratedStoreQueries(t *testing.T) {
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	path := filepath.Join(t.TempDir(), "settings.db")

	const simultaneousOpeners = 8
	type openResult struct {
		database *Database
		err      error
	}
	start := make(chan struct{})
	opened := make(chan openResult, simultaneousOpeners)
	for range simultaneousOpeners {
		go func() {
			<-start
			database, err := Open(ctx, path)
			opened <- openResult{database: database, err: err}
		}()
	}
	close(start)

	databases := make([]*Database, 0, simultaneousOpeners)
	for range simultaneousOpeners {
		select {
		case result := <-opened:
			if result.err != nil {
				for _, database := range databases {
					_ = database.Close()
				}
				t.Fatalf("concurrent first open: %v", result.err)
			}
			databases = append(databases, result.database)
		case <-ctx.Done():
			for _, database := range databases {
				_ = database.Close()
			}
			t.Fatalf("concurrent first opens did not converge: %v", ctx.Err())
		}
	}
	t.Cleanup(func() {
		for _, database := range databases {
			if err := database.Close(); err != nil {
				t.Errorf("close concurrently opened database: %v", err)
			}
		}
	})
	database := databases[0]

	var tableCount int
	if err := database.DB.QueryRowContext(ctx, `
		SELECT COUNT(*)
		FROM sqlite_master
		WHERE type = 'table' AND name = 'settings'
	`).Scan(&tableCount); err != nil {
		t.Fatalf("inspect migrated settings table: %v", err)
	}
	if tableCount != 1 {
		t.Fatalf("settings table count = %d, want 1", tableCount)
	}

	var appliedMigrationCount int
	if err := database.DB.QueryRowContext(ctx, `
		SELECT COUNT(*)
		FROM goose_db_version
		WHERE is_applied = 1 AND version_id = 1
	`).Scan(&appliedMigrationCount); err != nil {
		t.Fatalf("count applied settings migration: %v", err)
	}
	if appliedMigrationCount != 1 {
		t.Fatalf("applied settings migration count = %d, want 1", appliedMigrationCount)
	}
	var totalAppliedMigrations int
	if err := database.DB.QueryRowContext(ctx, `
		SELECT COUNT(*)
		FROM goose_db_version
		WHERE is_applied = 1 AND version_id <> 0
	`).Scan(&totalAppliedMigrations); err != nil {
		t.Fatalf("count all non-baseline applied migrations: %v", err)
	}
	if totalAppliedMigrations != 1 {
		t.Fatalf("total non-baseline applied migrations = %d, want exactly 1", totalAppliedMigrations)
	}

	params := testSetting{Key: "appearance.theme", Value: "minimal", Type: "string"}
	if err := writeTestSetting(database, ctx, params); err != nil {
		t.Fatalf("upsert migrated setting through generated query: %v", err)
	}
	setting, err := readTestSetting(database, ctx, params.Key)
	if err != nil {
		t.Fatalf("get migrated setting through generated query: %v", err)
	}
	if setting.Key != params.Key || setting.Value != params.Value || setting.Type != params.Type {
		t.Fatalf("generated query returned %+v, want %+v", setting, params)
	}

	if _, err := database.DB.ExecContext(ctx, "INSERT INTO settings (key, value, type) VALUES (?, ?, ?)", "window.width", "1200", "int"); err != nil {
		t.Fatalf("insert a later scalar setting without schema migration: %v", err)
	}
	if _, err := readTestSetting(database, ctx, "window.width"); err != nil {
		t.Fatalf("generated query cannot read later scalar setting: %v", err)
	}

	if err := database.DB.PingContext(ctx); err != nil && err != sql.ErrConnDone {
		t.Fatalf("migrated database is not usable: %v", err)
	}
}
