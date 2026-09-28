#!/usr/bin/env bash

# parse_release_version validates a release version and exports its parsed values
# to the caller. Supported forms are stable, alpha, and beta semantic versions.
parse_release_version() {
    local version="${1:-}"
    local prerelease='false'

    if [[ "$version" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
        prerelease='false'
    elif [[ "$version" =~ ^[0-9]+\.[0-9]+\.[0-9]+-(alpha|beta)\.[1-9][0-9]*$ ]]; then
        prerelease='true'
    else
        printf 'invalid version: %s (expected X.Y.Z, X.Y.Z-alpha.N, or X.Y.Z-beta.N with N greater than zero)\n' "$version" >&2
        return 1
    fi

    RELEASE_VERSION="$version"
    RELEASE_VERSION_PRERELEASE="$prerelease"
    export RELEASE_VERSION RELEASE_VERSION_PRERELEASE
}
