import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import test from 'node:test';
import { workflowStepRun } from './workflow-shell.mjs';

const repo = resolve(import.meta.dirname, '../..');
const command = workflowStepRun(join(repo, '.github/workflows/release.yml'), 'Validate version and source revision');

/**
 * @param {string} cwd
 * @param {string[]} args
 * @returns {string}
 */
function git(cwd, ...args) {
    const result = /** @type {unknown} */ (
        spawnSync(
            'git',
            ['-c', 'commit.gpgsign=false', '-c', 'tag.gpgSign=false', '-c', 'core.hooksPath=/dev/null', ...args],
            { cwd, encoding: 'utf8' },
        )
    );
    if (
        result === null ||
        typeof result !== 'object' ||
        !('status' in result) ||
        !('stdout' in result) ||
        !('stderr' in result) ||
        typeof result.stdout !== 'string' ||
        typeof result.stderr !== 'string'
    ) {
        throw new Error('could not run git');
    }
    assert.equal(result.status, 0, `git ${args.join(' ')}: ${result.stderr}`);
    return result.stdout.trim();
}

function fixture() {
    const root = mkdtempSync(join(tmpdir(), 'release-source-'));
    const checkout = join(root, 'checkout');
    const origin = join(root, 'origin.git');
    mkdirSync(checkout);
    git(root, 'init', '--bare', '--quiet', '--initial-branch=master', origin);
    git(checkout, 'init', '--quiet', '--initial-branch=master');
    git(checkout, 'config', 'user.name', 'Release Test');
    git(checkout, 'config', 'user.email', 'release-test@example.invalid');
    git(checkout, 'remote', 'add', 'origin', origin);
    mkdirSync(join(checkout, 'scripts/lib'), { recursive: true });
    copyFileSync(join(repo, 'scripts/lib/release_version.sh'), join(checkout, 'scripts/lib/release_version.sh'));
    writeFileSync(join(checkout, 'document.md'), '# First\n');
    git(checkout, 'add', '.');
    git(checkout, 'commit', '--quiet', '-m', 'first');
    const first = git(checkout, 'rev-parse', 'HEAD');
    git(checkout, 'push', '--quiet', '-u', 'origin', 'master');
    return { root, checkout, first };
}

/** @param {string} checkout */
function nextCommit(checkout) {
    writeFileSync(join(checkout, 'document.md'), '# Second\n');
    git(checkout, 'add', 'document.md');
    git(checkout, 'commit', '--quiet', '-m', 'second');
    return git(checkout, 'rev-parse', 'HEAD');
}

/**
 * @param {string} checkout
 * @param {string} version
 * @param {boolean} annotated
 */
function pushTag(checkout, version, annotated = false) {
    const tag = `v${version}`;
    git(checkout, ...(annotated ? ['tag', '-a', tag, '-m', tag] : ['tag', tag]));
    git(checkout, 'push', '--quiet', 'origin', tag);
    return tag;
}

/**
 * @param {{ root: string, checkout: string }} sample
 * @param {{ event: string, sha: string, tag?: string, version?: string }} options
 */
function validateSource(sample, options) {
    const output = join(sample.root, 'github-output');
    rmSync(output, { force: true });
    const result = /** @type {unknown} */ (
        spawnSync('bash', ['-c', command], {
            cwd: sample.checkout,
            encoding: 'utf8',
            env: {
                ...process.env,
                GITHUB_EVENT_NAME: options.event,
                GITHUB_REF: options.tag === undefined ? 'refs/heads/master' : `refs/tags/${options.tag}`,
                GITHUB_SHA: options.sha,
                REF_NAME: options.tag ?? 'master',
                INPUT_VERSION: options.version ?? '',
                GITHUB_OUTPUT: output,
            },
        })
    );
    if (
        result === null ||
        typeof result !== 'object' ||
        !('status' in result) ||
        !('stderr' in result) ||
        typeof result.stderr !== 'string'
    ) {
        throw new Error('could not run release source validation');
    }
    return {
        status: result.status,
        stderr: result.stderr,
        output: existsSync(output) ? readFileSync(output, 'utf8') : '',
    };
}

for (const [version, prerelease, annotated] of [
    ['1.2.3', 'false', false],
    ['1.2.3-alpha.1', 'true', false],
    ['1.2.3-beta.2', 'true', true],
]) {
    void test(`accepts ${version} tag on master`, () => {
        const sample = fixture();
        try {
            const tag = pushTag(sample.checkout, version, annotated);
            const outcome = validateSource(sample, { event: 'push', sha: sample.first, tag });
            assert.equal(outcome.status, 0, outcome.stderr);
            assert.equal(outcome.output, `sha=${sample.first}\nversion=${version}\nprerelease=${prerelease}\n`);
        } finally {
            rmSync(sample.root, { recursive: true, force: true });
        }
    });
}

void test('rejects an invalid version tag', () => {
    const sample = fixture();
    try {
        const tag = pushTag(sample.checkout, '1.2.3-rc.1');
        const outcome = validateSource(sample, { event: 'push', sha: sample.first, tag });
        assert.equal(outcome.status, 1);
        assert.match(outcome.stderr, /invalid version/u);
        assert.equal(outcome.output, '');
    } finally {
        rmSync(sample.root, { recursive: true, force: true });
    }
});

void test('rejects a valid tag when the event SHA differs from its commit', () => {
    const sample = fixture();
    try {
        const tag = pushTag(sample.checkout, '1.2.3');
        const outcome = validateSource(sample, { event: 'push', sha: 'b'.repeat(40), tag });
        assert.equal(outcome.status, 1);
        assert.match(outcome.stderr, /tag commit differs from event commit/u);
        assert.equal(outcome.output, '');
    } finally {
        rmSync(sample.root, { recursive: true, force: true });
    }
});

void test('rejects a valid version tag outside master', () => {
    const sample = fixture();
    try {
        git(sample.checkout, 'switch', '--quiet', '-c', 'side');
        const side = nextCommit(sample.checkout);
        const tag = pushTag(sample.checkout, '1.2.3');
        const outcome = validateSource(sample, { event: 'push', sha: side, tag });
        assert.equal(outcome.status, 1);
        assert.match(outcome.stderr, /not on master/u);
        assert.equal(outcome.output, '');
    } finally {
        rmSync(sample.root, { recursive: true, force: true });
    }
});

void test('rejects a tag moved on the remote after checkout', () => {
    const sample = fixture();
    try {
        const tag = pushTag(sample.checkout, '1.2.3');
        const second = nextCommit(sample.checkout);
        git(sample.checkout, 'push', '--quiet', 'origin', 'master');
        git(sample.checkout, 'tag', '--force', tag, second);
        git(sample.checkout, 'push', '--quiet', '--force', 'origin', tag);
        git(sample.checkout, 'tag', '--force', tag, sample.first);
        const outcome = validateSource(sample, { event: 'push', sha: sample.first, tag });
        assert.equal(outcome.status, 1);
        assert.match(outcome.stderr, /tag moved or disappeared/u);
        assert.equal(outcome.output, '');
    } finally {
        rmSync(sample.root, { recursive: true, force: true });
    }
});

void test('rejects manual dispatch when the checkout differs from the event SHA', () => {
    const sample = fixture();
    try {
        const outcome = validateSource(sample, {
            event: 'workflow_dispatch',
            sha: 'b'.repeat(40),
            version: '1.2.3',
        });
        assert.equal(outcome.status, 1);
        assert.match(outcome.stderr, /checked-out branch differs from dispatched commit/u);
        assert.equal(outcome.output, '');
    } finally {
        rmSync(sample.root, { recursive: true, force: true });
    }
});

void test('treats manual dispatch version as data', () => {
    const sample = fixture();
    try {
        const valid = validateSource(sample, {
            event: 'workflow_dispatch',
            sha: sample.first,
            version: '1.2.3-beta.1',
        });
        assert.equal(valid.status, 0, valid.stderr);
        assert.equal(valid.output, `sha=${sample.first}\nversion=1.2.3-beta.1\nprerelease=true\n`);
        const marker = join(sample.root, 'injected');
        const malicious = validateSource(sample, {
            event: 'workflow_dispatch',
            sha: sample.first,
            version: `1.2.3; touch ${marker}`,
        });
        assert.equal(malicious.status, 1);
        assert.match(malicious.stderr, /invalid version/u);
        assert.equal(malicious.output, '');
        assert.equal(existsSync(marker), false);
    } finally {
        rmSync(sample.root, { recursive: true, force: true });
    }
});
