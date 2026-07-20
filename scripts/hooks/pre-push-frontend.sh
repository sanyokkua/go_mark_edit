#!/usr/bin/env sh
set -eu

just frontend-build
just frontend-format-check
just frontend-lint
just typecheck
just frontend-test
