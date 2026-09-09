#!/usr/bin/env bash

# Stage commands shared by scripts/test, scripts/verify and scripts/baseline.

run_lint_stage() {
  local failed=0

  run_command 'golangci-lint' golangci-lint run ./... --output.json.path stdout || failed=1
  (cd "$REPO_ROOT/frontend" && run_command 'TypeScript source check' npx --no-install tsc --noEmit -p tsconfig.json) || failed=1
  (cd "$REPO_ROOT/frontend" && run_command 'TypeScript test check' npx --no-install tsc --noEmit -p tsconfig.test.json) || failed=1
  (cd "$REPO_ROOT/frontend" && run_command 'TypeScript node check' npx --no-install tsc --noEmit --tsBuildInfoFile "$RUN_DIR/tsconfig.node.tsbuildinfo" -p tsconfig.node.json) || failed=1

  if [[ -f "$REPO_ROOT/frontend/eslint.config.js" ]]; then
    (cd "$REPO_ROOT/frontend" && run_command 'ESLint' npx --no-install eslint src scripts --format json) || failed=1
  fi
  if [[ -f "$REPO_ROOT/frontend/scripts/archtest.mjs" ]]; then
    run_command 'frontend architecture checks' node frontend/scripts/archtest.mjs || failed=1
  fi

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
  run_command 'Go unit tests (interim layout)' go test -race ./internal/... . || failed=1
  (cd "$REPO_ROOT/frontend" && run_command 'Jest unit tests (interim layout)' npm test -- --runInBand) || failed=1
  return "$failed"
}

run_integration_stage() {
  (cd "$REPO_ROOT/frontend" && run_command 'Jest integration tests (interim layout)' npx --no-install jest --ci --runInBand --config jest.config.mjs --testPathPatterns 'src/.*\.integration\.test\.tsx$')
}

run_e2e_stage() {
  (cd "$REPO_ROOT/frontend" && run_command 'Playwright E2E tests' npx --no-install playwright test --config playwright.config.ts)
}
