#!/usr/bin/env bash

# Stage commands shared by scripts/test, scripts/verify and scripts/baseline.

run_lint_stage() {
  local failed=0
  local frontend_bin="$REPO_ROOT/frontend/node_modules/.bin"

  run_reported_command 'golangci-lint' golangci-lint "$RUN_DIR/reports/golangci-lint.json" env GOCACHE="$RUN_DIR/golangci-go-cache" GOLANGCI_LINT_CACHE="$RUN_DIR/golangci-cache" golangci-lint run ./... --output.json.path stdout || failed=1
  run_command 'Go architecture checks' env GOCACHE="$RUN_DIR/archlint-cache" go run ./tools/archlint || failed=1
  run_command 'CGO-free Go build' env CGO_ENABLED=0 GOCACHE="$RUN_DIR/cgo-build-cache" go build ./internal/... ./tools/... || failed=1
  (cd "$REPO_ROOT/frontend" && run_command 'TypeScript source check' "$frontend_bin/tsc" --noEmit -p tsconfig.json) || failed=1
  (cd "$REPO_ROOT/frontend" && run_command 'TypeScript test check' "$frontend_bin/tsc" --noEmit -p tsconfig.test.json) || failed=1
  (cd "$REPO_ROOT/frontend" && run_command 'TypeScript node check' "$frontend_bin/tsc" --noEmit --tsBuildInfoFile "$RUN_DIR/tsconfig.node.tsbuildinfo" -p tsconfig.node.json) || failed=1
  run_reported_command 'ESLint' eslint "$RUN_DIR/reports/eslint.json" "$REPO_ROOT/frontend/node_modules/.bin/eslint" --config "$REPO_ROOT/frontend/eslint.config.js" frontend tools --format json || failed=1
  if (cd "$REPO_ROOT/frontend" && run_reported_command 'stylelint' stylelint "$RUN_DIR/reports/stylelint.json" --capture-stderr "$REPO_ROOT/frontend/node_modules/.bin/stylelint" 'src/**/*.css' --formatter json); then
    :
  else
    failed=1
  fi
  printf '\n'
  run_command 'tokens' node tools/lint/tokens.mjs || failed=1
  run_command 'repo-rules' node tools/lint/repo-rules.mjs --docs || failed=1

  return "$failed"
}

run_format_stage() {
  "$REPO_ROOT/scripts/format" --check
}

run_build_stage() {
  "$REPO_ROOT/scripts/build"
}

run_unit_stage() {
  local failed=0
  run_reported_command 'Go backend unit tests' go-test "$RUN_DIR/reports/go-unit.jsonl" env GOCACHE="$RUN_DIR/go-unit-cache" go test -race -json ./tests/go/unit/... || failed=1
  (cd "$REPO_ROOT/frontend" && run_command 'Jest frontend unit tests' "$REPO_ROOT/frontend/node_modules/.bin/jest" --ci --json --outputFile "$RUN_DIR/frontend-unit-jest.json" --cacheDirectory "$RUN_DIR/jest-unit-cache" --runInBand --config jest.config.mjs --selectProjects unit) || failed=1
  return "$failed"
}

run_integration_stage() {
  local failed=0
  run_reported_command 'Go backend integration tests' go-test "$RUN_DIR/reports/go-integration.jsonl" env GOCACHE="$RUN_DIR/go-integration-cache" go test -race -json ./tests/go/integration/... ./internal/... || failed=1
  (cd "$REPO_ROOT/frontend" && run_command 'Jest frontend integration tests' "$REPO_ROOT/frontend/node_modules/.bin/jest" --ci --json --outputFile "$RUN_DIR/frontend-integration-jest.json" --cacheDirectory "$RUN_DIR/jest-integration-cache" --runInBand --config jest.config.mjs --selectProjects integration) || failed=1
  return "$failed"
}

run_e2e_stage() (
  local state_dir dist_placeholder
  state_dir="$(mktemp -d "${TMPDIR:-/tmp}/gomarkedit-e2e-state.XXXXXX")"
  dist_placeholder="$REPO_ROOT/frontend/dist/.gitkeep"
  if [[ -f "$dist_placeholder" ]]; then
    cp "$dist_placeholder" "$state_dir/dist.gitkeep"
  fi
  cleanup_e2e_stage() {
    if [[ -f "$state_dir/dist.gitkeep" ]]; then
      mkdir -p "$(dirname "$dist_placeholder")"
      cp "$state_dir/dist.gitkeep" "$dist_placeholder"
    else
      rm -f "$dist_placeholder"
    fi
    restore_tracked_modes
    rm -rf "$state_dir"
  }
  trap cleanup_e2e_stage EXIT

  cd "$REPO_ROOT/frontend"
  run_command 'Playwright frontend E2E tests' env PLAYWRIGHT_OUTPUT_DIR="$RUN_DIR/frontend-e2e-results" PLAYWRIGHT_JSON_OUTPUT_NAME="$RUN_DIR/frontend-e2e-playwright.json" "$REPO_ROOT/frontend/node_modules/.bin/playwright" test --config playwright.config.ts --reporter=line,json
)
