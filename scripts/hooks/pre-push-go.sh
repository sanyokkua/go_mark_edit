#!/usr/bin/env sh
set -eu

just go-format-check
just go-lint
just go-vet
just go-test
