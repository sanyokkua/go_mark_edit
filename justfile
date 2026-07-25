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
    gofmt -w $(git ls-files '*.go')
    npm --prefix frontend run format

# Scoped to tracked sources: frontend/node_modules contains a real Go package (flatted).
go-format-check:
    test -z "$(gofmt -l $(git ls-files '*.go'))"

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
    go vet ./internal/... .

go-test:
    go test -race ./internal/... .

verify-ui:
    npm --prefix frontend run verify:ui

# --- drift and security -------------------------------------------------------
gen-check:
    wails generate module
    git diff --exit-code -- frontend/wailsjs/

sqlc-check:
    sqlc diff

vuln:
    govulncheck ./...

# Local mirror of the CI gate set. Security gates (sqlc-check, vuln) join later.
check:
    just gen-check
    just frontend-build
    just fmt-check
    just lint
    just typecheck
    just frontend-test
    just go-vet
    just go-test

frontend-build:
    npm --prefix frontend run build
