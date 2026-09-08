-- name: GetSetting :one
SELECT key, value, type
FROM settings
WHERE key = sqlc.arg(key);

-- name: UpsertSetting :exec
INSERT INTO settings (key, value, type)
VALUES (sqlc.arg(key), sqlc.arg(value), sqlc.arg(type))
ON CONFLICT(key) DO UPDATE SET
    value = excluded.value,
    type = excluded.type;
