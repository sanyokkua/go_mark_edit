#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
repo_root="$(git -C "$script_dir" rev-parse --show-toplevel)"
arch=''
version=''

usage() {
    printf 'Usage: %s --arch amd64|arm64 --version X.Y.Z[-alpha.N|-beta.N]\n' "$0" >&2
}

while [[ $# -gt 0 ]]; do
    case "$1" in
        --arch)
            arch="${2:-}"
            shift 2
            ;;
        --version)
            version="${2:-}"
            shift 2
            ;;
        *)
            usage
            exit 2
            ;;
    esac
done

case "$arch" in amd64 | arm64) ;; *)
    usage
    exit 2
    ;;
esac
[[ -n "$version" ]] || {
    usage
    exit 2
}

source "$repo_root/scripts/lib/release_version.sh"
parse_release_version "$version" || exit 2

go_version="$(awk '$1 == "go" { print $2; exit }' "$repo_root/go.mod")"
node_version="$(tr -d '[:space:]' <"$repo_root/.nvmrc")"
playwright_version="$(
    python3 - "$repo_root/frontend/package-lock.json" <<'PY'
import json
import sys

with open(sys.argv[1], encoding='utf-8') as lock:
    print(json.load(lock)['packages']['node_modules/@playwright/test']['version'])
PY
)"
[[ -n "$go_version" && -n "$node_version" && -n "$playwright_version" ]] || exit 1

docker info >/dev/null

mkdir -p "$repo_root/.local_tmp_files"
scratch="$(mktemp -d "$repo_root/.local_tmp_files/container-verify.XXXXXX")"
trap 'rm -rf "$scratch"' EXIT
commit="$(git -C "$repo_root" rev-parse HEAD)"
branch="$(git -C "$repo_root" branch --show-current)"
[[ -n "$branch" ]] || {
    printf 'A named branch is required for this snapshot.\n' >&2
    exit 1
}
git clone --quiet --no-hardlinks --single-branch --branch "$branch" "$repo_root" "$scratch/src"
git -C "$repo_root" diff --binary HEAD >"$scratch/working.patch"
if [[ -s "$scratch/working.patch" ]]; then
    git -C "$scratch/src" apply --binary "$scratch/working.patch"
fi
git -C "$repo_root" ls-files --others --exclude-standard -z >"$scratch/untracked.paths"
python3 - "$repo_root" "$scratch/src" "$scratch/untracked.paths" <<'PY'
import os
from pathlib import Path
import shutil
import sys

source, destination, manifest = map(Path, sys.argv[1:])
for name in Path(manifest).read_bytes().split(b'\0'):
    if not name:
        continue
    relative = Path(os.fsdecode(name))
    original = source / relative
    copy = destination / relative
    copy.parent.mkdir(parents=True, exist_ok=True)
    if original.is_symlink():
        copy.symlink_to(os.readlink(original))
    else:
        shutil.copy2(original, copy)
PY

image="gomarkedit-verify:ubuntu2404-${arch}-go${go_version}-node${node_version}-pw${playwright_version}"
docker build --platform "linux/$arch" \
    --build-arg "GO_VERSION=$go_version" \
    --build-arg "NODE_VERSION=$node_version" \
    --build-arg "PLAYWRIGHT_VERSION=$playwright_version" \
    --tag "$image" "$script_dir"

printf 'Verifying branch %s at %s plus its working changes on linux/%s\n' "$branch" "$commit" "$arch"
docker run --rm --platform "linux/$arch" --shm-size=2g \
    --user "$(id -u):$(id -g)" \
    --mount "type=bind,source=$scratch/src,target=/work" \
    --env HOME=/tmp/gomarkedit-home \
    --env CI=1 \
    --env E2E_NATIVE_CLIPBOARD=1 \
    --env "RELEASE_VERSION=$version" \
    --env "RELEASE_ARCH=$arch" \
    "$image" bash -c '
        set -euo pipefail
        mkdir -p "$HOME"
        export PATH="$HOME/go/bin:$PATH"
        scripts/build setup --with-browser
        failed=0
        if xvfb-run --auto-servernum scripts/baseline; then
            echo "baseline: PASS"
        else
            echo "baseline: FAIL" >&2
            failed=1
        fi
        if xvfb-run --auto-servernum scripts/verify; then
            echo "verification: PASS"
        else
            echo "verification: FAIL" >&2
            failed=1
        fi
        if xvfb-run --auto-servernum scripts/baseline --compare; then
            echo "baseline comparison: PASS"
        else
            echo "baseline comparison: FAIL" >&2
            failed=1
        fi
        if scripts/build --release --platform "linux/$RELEASE_ARCH" --version "$RELEASE_VERSION"; then
            echo "release build: PASS"
        else
            echo "release build: FAIL" >&2
            failed=1
        fi
        uname -m
        executable="build/bin/GoMarkEdit-linux-$RELEASE_ARCH"
        if [[ -f "$executable" ]]; then
            file "$executable"
        else
            echo "missing release executable: $executable" >&2
            failed=1
        fi
        exit "$failed"
    '
