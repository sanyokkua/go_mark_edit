set shell := ["zsh", "-eu", "-o", "pipefail", "-c"]

default:
    @just --list

gen:
    wails generate module

frontend-build:
    npm --prefix frontend run build

fmt:
    gofmt -w main.go internal/application
    npm --prefix frontend run format

lint:
    go vet ./...
    npm --prefix frontend run lint

typecheck:
    npm --prefix frontend run typecheck

test:
    just gen
    just frontend-build
    go test -race ./...
    npm --prefix frontend test -- --passWithNoTests

trace:
    node scripts/trace.mjs

trace-check:
    node scripts/trace-check.mjs
