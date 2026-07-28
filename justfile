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

# The critical user journeys, through the real interface. Same suite as verify-ui; named for the
# verb the specification uses.
e2e-test:
    just verify-ui

# --- architecture -------------------------------------------------------------
# The boundaries in docs/delivery/architecture/rules.md that cannot be checked any other way.
# This gate is never diffed against a baseline, never weakened, and never suppressed.

# The Go half: handler shape, panic recovery, import direction, wiring, migrations, document identity.
go-archtest:
    go test -run TestArchitecture -count=1 ./internal/... .

# rules.md#build-is-cgo-free — a CGO dependency breaks cross-compiling for every non-host target,
# and it is discovered at release time rather than at commit time.
cgo-free-check:
    CGO_ENABLED=0 go build ./...

# rules.md#migrations-only-add — a committed migration is never edited. Every machine that already
# ran it will never run it again, so an edit applies to new installations only.
migration-immutability-check:
    #!/usr/bin/env bash
    set -uo pipefail
    changed=$(git diff --name-only HEAD -- internal/db/migrations/ 2>/dev/null)
    if [[ -n "$changed" ]]; then
      echo "A committed migration was modified in place:"
      echo "$changed" | sed 's/^/  /'
      echo "A correction is a new numbered file. See docs/delivery/architecture/rules.md#migrations-only-add"
      exit 1
    fi
    echo "migrations: no committed file modified in place"

# The frontend half: only the adapter imports wailsjs/, strings go through t(), no colour outside a token.
frontend-archtest:
    node frontend/scripts/archtest.mjs

archtest:
    just go-archtest
    just cgo-free-check
    just migration-immutability-check
    just frontend-archtest

# --- baselines and verification -----------------------------------------------
# baseline records the repository's state before a story starts, so "pre-existing" becomes a lookup
# rather than an argument. verify re-runs the same gates and compares.

baseline story:
    bash scripts/baseline.sh {{story}}

verify story:
    bash scripts/verify.sh {{story}}

# --- specification checks -------------------------------------------------------
# Deliberately NOT part of `just check`. Documentation drift is real and worth knowing about, but it
# is not a reason to block a commit that changes code.

# The whole tree: writing rules, revision level, and every Proves: tag.
spec-check:
    python3 scripts/validate_spec.py docs/delivery
    python3 scripts/upgrade_check.py docs/delivery --repo .
    python3 scripts/check_proves.py docs/delivery internal frontend/src .

# One story: is it still a stub, do its copied rules match the source verbatim, are the architecture
# rules its paths match actually present, do its anchors resolve, is it under the 5-rule ceiling.
story-check story:
    python3 scripts/check_story.py docs/delivery {{story}}

# --- packaging ----------------------------------------------------------------
# Deliberately not built. Naming a command that does not exist is how a Definition of Done certifies
# something false — `just build` produces a runnable binary, not a distributable artifact.
package:
    #!/usr/bin/env bash
    echo "just package is not built yet."
    echo "Phase 08 introduces it: docs/delivery/plan/phase-08-install-it.md"
    echo "Until then, 'just build' produces a runnable binary and nothing installable."
    exit 1

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
    just archtest
    just go-test

frontend-build:
    npm --prefix frontend run build
