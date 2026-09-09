default:
    @just --list

build:
    scripts/build

test *args:
    scripts/test {{args}}

verify *args:
    scripts/verify {{args}}

format *args:
    scripts/format {{args}}

baseline *args:
    scripts/baseline {{args}}

dev:
    scripts/build dev

setup:
    scripts/build setup
