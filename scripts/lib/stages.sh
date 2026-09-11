#!/usr/bin/env bash

# Stage commands shared by scripts/test, scripts/verify and scripts/baseline.

run_lint_stage() {
  local failed=0

  run_command 'golangci-lint' env GOCACHE="$RUN_DIR/golangci-go-cache" GOLANGCI_LINT_CACHE="$RUN_DIR/golangci-cache" golangci-lint run ./... --output.json.path stdout || failed=1
  run_command 'Go architecture checks' env GOCACHE="$RUN_DIR/archlint-cache" go run ./tools/archlint || failed=1
  run_command 'CGO-free Go build' env CGO_ENABLED=0 GOCACHE="$RUN_DIR/cgo-build-cache" go build ./internal/... ./tools/... || failed=1
  (cd "$REPO_ROOT/frontend" && run_command 'TypeScript source check' npx --no-install tsc --noEmit -p tsconfig.json) || failed=1
  (cd "$REPO_ROOT/frontend" && run_command 'TypeScript test check' npx --no-install tsc --noEmit -p tsconfig.test.json) || failed=1
  (cd "$REPO_ROOT/frontend" && run_command 'TypeScript node check' npx --no-install tsc --noEmit --tsBuildInfoFile "$RUN_DIR/tsconfig.node.tsbuildinfo" -p tsconfig.node.json) || failed=1
  run_command 'ESLint' "$REPO_ROOT/frontend/node_modules/.bin/eslint" --config "$REPO_ROOT/frontend/eslint.config.js" frontend tools --format json || failed=1
  if (cd "$REPO_ROOT/frontend" && run_command 'stylelint' "$REPO_ROOT/frontend/node_modules/.bin/stylelint" 'src/**/*.css' --formatter json); then
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
  run_command 'Go unit tests' go test -race -json ./tests/go/unit/... || failed=1
  (cd "$REPO_ROOT/frontend" && run_command 'Jest unit tests' npx --no-install jest --ci --json --runInBand --config jest.config.mjs --selectProjects unit) || failed=1
  return "$failed"
}

run_integration_stage() {
  local failed=0
  run_command 'Go integration tests' go test -race -json ./tests/go/integration/... ./internal/... || failed=1
  (cd "$REPO_ROOT/frontend" && run_command 'Jest integration tests' npx --no-install jest --ci --json --runInBand --config jest.config.mjs --selectProjects integration) || failed=1
  return "$failed"
}

run_e2e_stage() {
  (cd "$REPO_ROOT/frontend" && run_command 'Playwright E2E tests' npx --no-install playwright test --config playwright.config.ts)
}
