import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { workflowStepRun } from './workflow-shell.mjs';

const repo = resolve(import.meta.dirname, '../..');
const version = '1.2.3-beta.1';
const tag = `v${version}`;
const sha = 'a'.repeat(40);
const assets = [
    `GoMarkEdit-${version}-macos-arm64.zip`,
    `GoMarkEdit-${version}-windows-amd64.exe`,
    `GoMarkEdit-${version}-windows-arm64.exe`,
    `GoMarkEdit-${version}-linux-amd64`,
    `GoMarkEdit-${version}-linux-arm64`,
    'SHA256SUMS.txt',
];

/** @returns {string} */
function bashCompatibility() {
    return (
        `mapfile() {\n` +
        `  local value\n` +
        `  assets=()\n` +
        `  while IFS= read -r -d '' value; do assets+=("$value"); done\n` +
        `}\n`
    );
}

/** @param {'existing' | 'leftover-draft' | 'create-fails' | 'moved' | 'inventory-mismatch' | 'upload-fails' | 'success'} scenario */
function runPublisher(scenario) {
    const root = mkdtempSync(join(tmpdir(), 'release-publish-'));
    const bin = join(root, 'bin');
    const releaseAssets = join(root, 'release-assets');
    mkdirSync(bin);
    mkdirSync(releaseAssets);
    for (const name of assets) writeFileSync(join(releaseAssets, name), `contents for ${name}`);
    const operationLog = join(root, 'operations.log');
    const gitCalls = join(root, 'git-calls');
    const uploadLog = join(root, 'uploaded-assets.log');
    const outputInventory =
        scenario === 'inventory-mismatch' ? [...assets.slice(0, -1), 'unexpected-asset'].join('\n') : assets.join('\n');
    writeFileSync(
        join(bin, 'git'),
        `#!/usr/bin/env bash\nset -euo pipefail\n` +
            `[[ $# -eq 3 && "$1" == ls-remote && "$2" == origin && "$3" == "refs/tags/$RELEASE_TAG^{}" ]] || exit 90\n` +
            `count=0; [[ ! -f "$GIT_CALLS" ]] || count=$(wc -l < "$GIT_CALLS")\n` +
            `printf 'lookup\\n' >> "$GIT_CALLS"\n` +
            `current="$RELEASE_SHA"\n` +
            `if [[ "$SCENARIO" == moved && "$count" -ge 1 ]]; then current=${'b'.repeat(40)}; fi\n` +
            `printf '%s\\t%s\\n' "$current" "$3"\n`,
        { mode: 0o755 },
    );
    const releaseState = join(root, 'release-state');
    writeFileSync(
        releaseState,
        scenario === 'existing' ? 'published' : scenario === 'leftover-draft' ? 'draft' : 'none',
    );
    writeFileSync(
        join(bin, 'gh'),
        `#!/usr/bin/env bash\nset -euo pipefail\n` +
            `[[ "$1" == release ]] || exit 97\n` +
            `state="$(cat "$RELEASE_STATE")"\n` +
            `case "$2" in\n` +
            `  view)\n` +
            `    [[ "${'${3:-}'}" == "$RELEASE_TAG" && "${'${4:-}'}" == --json ]] || exit 98\n` +
            `    [[ "$state" != none ]] || exit 1\n` +
            `    if [[ "${'${5:-}'}" == isDraft ]]; then\n` +
            `      [[ $# -eq 7 && "$6" == --jq && "$7" == .isDraft ]] || exit 102\n` +
            `      printf 'draft-check\\n' >> "$OP_LOG"\n` +
            `      [[ "$state" == draft ]] && printf 'true\\n' || printf 'false\\n'\n` +
            `      exit 0\n` +
            `    fi\n` +
            `    [[ $# -eq 7 && "$5" == assets && "$6" == --jq && "$7" == '.assets[].name' ]] || exit 99\n` +
            `    printf '%s\\n' "$ASSET_INVENTORY"\n` +
            `    printf 'inventory\\n' >> "$OP_LOG"\n` +
            `    ;;\n` +
            `  create)\n` +
            `    [[ "$3" == "$RELEASE_TAG" && "$4" == --verify-tag && "$5" == --draft && "$6" == --title && "$7" == "GoMarkEdit $RELEASE_VERSION" && "$8" == --notes-from-tag ]] || exit 91\n` +
            `    if [[ "$RELEASE_PRERELEASE" == true ]]; then [[ $# -eq 9 && "$9" == --prerelease ]] || exit 96; else [[ $# -eq 8 ]] || exit 96; fi\n` +
            `    [[ "$state" == none ]] || exit 1\n` +
            `    printf 'draft' > "$RELEASE_STATE"\n` +
            `    printf 'create\\n' >> "$OP_LOG"\n` +
            `    [[ "$SCENARIO" != create-fails ]] || exit 1\n` +
            `    ;;\n` +
            `  upload)\n` +
            `    [[ "$3" == "$RELEASE_TAG" && $# -eq 9 ]] || exit 92\n` +
            `    [[ "$SCENARIO" != upload-fails ]] || { printf 'upload\\n' >> "$OP_LOG"; exit 1; }\n` +
            `    shift 3\n` +
            `    for asset in "$@"; do [[ -f "$asset" ]] || exit 95; done\n` +
            `    printf '%s\\n' "${'${@##*/}'}" | sort > "$UPLOAD_LOG"\n` +
            `    printf 'upload\\n' >> "$OP_LOG"\n` +
            `    ;;\n` +
            `  edit)\n` +
            `    [[ "$3" == "$RELEASE_TAG" && $# -eq 4 && "$4" == --draft=false ]] || exit 93\n` +
            `    printf 'published' > "$RELEASE_STATE"\n` +
            `    printf 'edit\\n' >> "$OP_LOG"\n` +
            `    ;;\n` +
            `  delete)\n` +
            `    [[ "$3" == "$RELEASE_TAG" && $# -eq 4 && "$4" == --yes ]] || exit 101\n` +
            `    printf 'none' > "$RELEASE_STATE"\n` +
            `    printf 'delete\\n' >> "$OP_LOG"\n` +
            `    ;;\n` +
            `  *) exit 94 ;;\n` +
            `esac\n`,
        { mode: 0o755 },
    );
    const command = workflowStepRun(join(repo, '.github/workflows/release.yml'), 'Publish one complete release');
    const bashMajor = Number(
        spawnSync('bash', ['-c', 'printf "%s" "${BASH_VERSINFO[0]}"'], { encoding: 'utf8' }).stdout,
    );
    const result = spawnSync('bash', ['-c', `${bashMajor < 4 ? bashCompatibility() : ''}${command}`], {
        cwd: root,
        encoding: 'utf8',
        env: {
            ...process.env,
            PATH: `${bin}:${process.env.PATH}`,
            GH_TOKEN: 'test-token',
            RELEASE_SHA: sha,
            RELEASE_VERSION: version,
            RELEASE_PRERELEASE: 'true',
            RELEASE_TAG: tag,
            SCENARIO: scenario,
            GIT_CALLS: gitCalls,
            OP_LOG: operationLog,
            UPLOAD_LOG: uploadLog,
            ASSET_INVENTORY: outputInventory,
            RELEASE_STATE: releaseState,
        },
    });
    return {
        root,
        result,
        operations: readFileSync(operationLog, 'utf8').trim().split('\n').filter(Boolean),
        releaseState: readFileSync(releaseState, 'utf8'),
        gitCallCount: readFileSync(gitCalls, 'utf8').trim().split('\n').filter(Boolean).length,
        uploadedAssets: existsSync(uploadLog) ? readFileSync(uploadLog, 'utf8').trim().split('\n').filter(Boolean) : [],
    };
}

void test('an existing published release prevents creation, upload, and publication', () => {
    const outcome = runPublisher('existing');
    try {
        assert.notEqual(outcome.result.status, 0);
        assert.deepEqual(outcome.operations, ['draft-check']);
        assert.equal(outcome.releaseState, 'published');
        assert.equal(outcome.gitCallCount, 1);
    } finally {
        rmSync(outcome.root, { recursive: true, force: true });
    }
});

void test('a creation that fails after leaving a draft removes that draft', () => {
    const outcome = runPublisher('create-fails');
    try {
        assert.notEqual(outcome.result.status, 0);
        assert.deepEqual(outcome.operations, ['create', 'draft-check', 'delete']);
        assert.equal(outcome.releaseState, 'none');
    } finally {
        rmSync(outcome.root, { recursive: true, force: true });
    }
});

void test('a tag moved during upload removes the unpublished draft', () => {
    const outcome = runPublisher('moved');
    try {
        assert.notEqual(outcome.result.status, 0);
        assert.deepEqual(outcome.operations, ['create', 'upload', 'inventory', 'draft-check', 'delete']);
        assert.equal(outcome.releaseState, 'none');
        assert.equal(outcome.gitCallCount, 2);
    } finally {
        rmSync(outcome.root, { recursive: true, force: true });
    }
});

void test('a failed asset upload removes the draft so no partial release remains', () => {
    const outcome = runPublisher('upload-fails');
    try {
        assert.notEqual(outcome.result.status, 0);
        assert.deepEqual(outcome.operations, ['create', 'upload', 'draft-check', 'delete']);
        assert.equal(outcome.releaseState, 'none');
    } finally {
        rmSync(outcome.root, { recursive: true, force: true });
    }
});

void test('a mismatched remote asset inventory removes the draft instead of publishing it', () => {
    const outcome = runPublisher('inventory-mismatch');
    try {
        assert.notEqual(outcome.result.status, 0);
        assert.deepEqual(outcome.operations, ['create', 'upload', 'inventory', 'draft-check', 'delete']);
        assert.equal(outcome.releaseState, 'none');
        assert.equal(outcome.gitCallCount, 1);
        assert.deepEqual(outcome.uploadedAssets, [...assets].sort());
    } finally {
        rmSync(outcome.root, { recursive: true, force: true });
    }
});

void test('a complete prerelease is uploaded as a draft before it is published', () => {
    const outcome = runPublisher('success');
    try {
        assert.equal(outcome.result.status, 0, outcome.result.stderr);
        assert.deepEqual(outcome.operations, ['create', 'upload', 'inventory', 'edit']);
        assert.equal(outcome.releaseState, 'published');
        assert.equal(outcome.gitCallCount, 2);
        assert.deepEqual(outcome.uploadedAssets, [...assets].sort());
    } finally {
        rmSync(outcome.root, { recursive: true, force: true });
    }
});

void test('a draft left by an interrupted attempt is replaced and the release is published', () => {
    const outcome = runPublisher('leftover-draft');
    try {
        assert.equal(outcome.result.status, 0, outcome.result.stderr);
        assert.deepEqual(outcome.operations, ['draft-check', 'delete', 'create', 'upload', 'inventory', 'edit']);
        assert.equal(outcome.releaseState, 'published');
        assert.deepEqual(outcome.uploadedAssets, [...assets].sort());
    } finally {
        rmSync(outcome.root, { recursive: true, force: true });
    }
});
