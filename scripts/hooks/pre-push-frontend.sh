#!/usr/bin/env sh
set -eu

npm --prefix frontend run build
npm --prefix frontend run lint
npm --prefix frontend run typecheck
npm --prefix frontend test -- --passWithNoTests
