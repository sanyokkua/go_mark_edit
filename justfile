# GoMarkEdit task runner. Every entry point is shared by local development, hooks, and CI.

set shell := ["zsh", "-eu", "-o", "pipefail", "-c"]

default:
    @just --list

# --- setup and development ----------------------------------------------------
setup:
    go mod download
    npm --prefix frontend ci
    lefthook install

dev:
    wails dev

dev-ui:
    npm --prefix frontend run dev

build:
    wails build

gen:
    wails generate module

# --- formatting and quality ---------------------------------------------------
fmt:
    gofmt -w .
    npm --prefix frontend run format

go-format-check:
    test -z "$(gofmt -l .)"

frontend-format-check:
    npm --prefix frontend run format:check

fmt-check:
    just go-format-check
    just frontend-format-check

go-lint:
    golangci-lint run ./...

lint:
    just go-lint
    just frontend-lint

frontend-lint:
    npm --prefix frontend run lint

typecheck:
    npm --prefix frontend run typecheck

test:
    just go-test
    just frontend-test

frontend-test:
    npm --prefix frontend test -- --passWithNoTests

go-vet:
    go vet ./...

go-test:
    go test -race ./...

verify-ui:
    npm --prefix frontend run verify:ui

# --- drift, security, and traceability ---------------------------------------
gen-check:
    wails generate module
    git diff --exit-code -- frontend/wailsjs/

sqlc-check:
    sqlc diff

vuln:
    govulncheck ./...

trace:
    node scripts/trace.mjs

trace-check:
    node scripts/trace-check.mjs

# Phase-00 staged local/CI mirror. Full drift and security gates join later phases.
check:
    just gen-check
    just frontend-build
    just fmt-check
    just lint
    just typecheck
    just frontend-test
    just go-vet
    just go-test
    just trace-check

frontend-build:
    npm --prefix frontend run build
