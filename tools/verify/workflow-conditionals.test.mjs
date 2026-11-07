import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import test from 'node:test';
import { workflowJobField, workflowStepField, workflowStepRun } from './workflow-shell.mjs';

const repo = resolve(import.meta.dirname, '../..');
const release = join(repo, '.github/workflows/release.yml');
const sha = 'a'.repeat(40);
const repository = 'owner/repo';

/**
 * @param {string} command
 * @param {Record<string, string>} env
 * @param {string} [cwd]
 * @returns {{ status: number | null, stderr: string }}
 */
function bash(command, env, cwd = repo) {
    const result = /** @type {{ status: number | null, stderr: string }} */ (
        spawnSync('bash', ['-c', command], { cwd, encoding: 'utf8', env: { ...process.env, ...env } })
    );
    return result;
}

// --- authorize step -------------------------------------------------------------------------

const authorizeCommand = workflowStepRun(release, 'Authorize exact revision');

/** @param {string} prepare @param {string} fallback @param {string} mode */
const authorize = (prepare, fallback, mode) =>
    bash(authorizeCommand, { PREPARE_RESULT: prepare, FALLBACK_RESULT: fallback, MODE: mode });

void test('authorization accepts a reused verification with the fallback skipped', () => {
    const outcome = authorize('success', 'skipped', 'reuse');
    assert.equal(outcome.status, 0, outcome.stderr);
});

void test('authorization accepts a fallback verification only when it succeeded', () => {
    assert.equal(authorize('success', 'success', 'fallback').status, 0);
    for (const result of ['failure', 'cancelled', 'skipped', '']) {
        const outcome = authorize('success', result, 'fallback');
        assert.equal(outcome.status, 1, `fallback=${result}`);
        assert.match(outcome.stderr, /verification did not authorize release/u);
    }
});

void test('authorization rejects a reused verification when the fallback ran or did not skip', () => {
    for (const result of ['success', 'failure', 'cancelled', '']) {
        assert.equal(authorize('success', result, 'reuse').status, 1, `fallback=${result}`);
    }
});

void test('authorization rejects a failed, cancelled or skipped preparation whatever the mode says', () => {
    for (const prepare of ['failure', 'cancelled', 'skipped']) {
        for (const [fallback, mode] of [
            ['skipped', 'reuse'],
            ['success', 'fallback'],
            ['skipped', ''],
        ]) {
            const outcome = authorize(prepare, fallback, mode);
            assert.equal(outcome.status, 1, `${prepare} ${mode}:${fallback}`);
            assert.match(outcome.stderr, /release preparation failed/u);
        }
    }
});

void test('authorization rejects an unknown or missing mode', () => {
    for (const mode of ['', 'reject', 'inspect']) {
        assert.equal(authorize('success', 'skipped', mode).status, 1, `mode=${mode}`);
        assert.equal(authorize('success', 'success', mode).status, 1, `mode=${mode}`);
    }
});

// --- job and step conditionals --------------------------------------------------------------

void test('the fallback verification runs only for the fallback mode', () => {
    assert.equal(workflowJobField(release, 'fallback', 'if'), "${{ needs.prepare.outputs.mode == 'fallback' }}");
    assert.equal(workflowJobField(release, 'fallback', 'needs'), 'prepare');
});

void test('authorization runs after a skipped fallback but never after cancellation', () => {
    assert.equal(workflowJobField(release, 'authorize', 'if'), '${{ always() && !cancelled() }}');
    assert.equal(workflowJobField(release, 'authorize', 'needs'), '[prepare, fallback]');
});

void test('builds, collection and publication depend on authorization and each other in order', () => {
    assert.equal(workflowJobField(release, 'build', 'needs'), 'authorize');
    assert.equal(workflowJobField(release, 'collect', 'needs'), '[authorize, build]');
    assert.equal(workflowJobField(release, 'publish', 'needs'), '[authorize, collect]');
    assert.equal(workflowJobField(release, 'build', 'if'), undefined);
    assert.equal(workflowJobField(release, 'collect', 'if'), undefined);
});

void test('only a tag push publishes and only a manual dispatch uploads the dry-run package', () => {
    assert.equal(workflowJobField(release, 'publish', 'if'), "github.event_name == 'push'");
    assert.equal(
        workflowStepField(release, 'Upload manual dry-run package', 'if'),
        "github.event_name == 'workflow_dispatch'",
    );
});

void test('the publish job alone can write repository contents', () => {
    const text = readFileSync(release, 'utf8');
    assert.equal(text.match(/contents: write/gu)?.length, 1);
    assert.match(text, /publish:[\s\S]*?permissions:\n\s+contents: write/u);
});

// --- gate step: mode selection from GitHub API data -----------------------------------------

const gateCommand = workflowStepRun(release, 'Find qualifying master verification');

/** @param {Record<string, unknown>} [fields] */
const gateRun = (fields = {}) => ({
    id: 42,
    run_attempt: 2,
    event: 'push',
    head_branch: 'master',
    head_sha: sha,
    status: 'completed',
    conclusion: 'success',
    path: '.github/workflows/push.yml@refs/heads/master',
    repository: { full_name: repository },
    head_repository: { full_name: repository },
    referenced_workflows: [{ path: `${repository}/.github/workflows/verification.yml@${sha}`, sha }],
    ...fields,
});

/**
 * Run the gate step against a fake `gh` that serves the given API documents.
 * @param {{ runs: unknown[], detail?: unknown, jobs?: unknown }} api
 */
function gate(api) {
    const root = mkdtempSync(join(tmpdir(), 'release-gate-'));
    try {
        const bin = join(root, 'bin');
        mkdirSync(bin);
        const documents = {
            list: { total_count: api.runs.length, workflow_runs: api.runs },
            detail: api.detail ?? api.runs[0],
            jobs: api.jobs ?? { total_count: 0, jobs: [] },
        };
        writeFileSync(join(root, 'api.json'), JSON.stringify(documents));
        const fake = join(bin, 'gh');
        writeFileSync(
            fake,
            `#!/usr/bin/env bash\nset -euo pipefail\n[[ "$1" == api ]] || exit 90\n` +
                `case "$2" in\n` +
                `  */push.yml/runs?*) jq .list "$API" ;;\n` +
                `  */attempts/*/jobs?*) jq .jobs "$API" ;;\n` +
                `  */actions/runs/*) jq .detail "$API" ;;\n` +
                `  *) exit 91 ;;\nesac\n`,
        );
        chmodSync(fake, 0o755);
        const output = join(root, 'output');
        writeFileSync(output, '');
        const outcome = bash(gateCommand, {
            PATH: `${bin}:${process.env.PATH}`,
            API: join(root, 'api.json'),
            GH_TOKEN: 'test-token',
            GITHUB_REPOSITORY: repository,
            RUNNER_TEMP: root,
            GITHUB_OUTPUT: output,
            TARGET_SHA: sha,
        });
        return { ...outcome, output: readFileSync(output, 'utf8').trim() };
    } finally {
        rmSync(root, { recursive: true, force: true });
    }
}

const requiredJobs = (conclusion = 'success') => ({
    total_count: 1,
    jobs: [{ name: 'verify / required', head_sha: sha, conclusion }],
});

void test('the gate reuses a successful trusted run whose required job succeeded', () => {
    const outcome = gate({ runs: [gateRun()], jobs: requiredJobs() });
    assert.equal(outcome.status, 0, outcome.stderr);
    assert.equal(outcome.output, 'mode=reuse');
});

void test('the gate fails closed when the reused run required job did not succeed', () => {
    for (const conclusion of ['failure', 'skipped', 'cancelled']) {
        const outcome = gate({ runs: [gateRun()], jobs: requiredJobs(conclusion) });
        assert.equal(outcome.status, 1, conclusion);
        assert.equal(outcome.output, '');
    }
});

void test('the gate falls back when there is no run, an in-progress run or an unreferenced revision', () => {
    for (const runs of [
        [],
        [gateRun({ status: 'in_progress', conclusion: null })],
        [gateRun({ referenced_workflows: [] })],
        [
            gateRun({
                referenced_workflows: [
                    { path: `${repository}/.github/workflows/verification.yml@x`, sha: 'b'.repeat(40) },
                ],
            }),
        ],
        [gateRun({ head_sha: 'b'.repeat(40) })],
        [gateRun({ head_repository: { full_name: 'fork/repo' } })],
    ]) {
        const outcome = gate({ runs });
        assert.equal(outcome.status, 0, outcome.stderr);
        assert.equal(outcome.output, 'mode=fallback');
    }
});

void test('the gate fails closed for a failed or cancelled latest run even with an older success', () => {
    for (const conclusion of ['failure', 'cancelled']) {
        const latest = gateRun({ id: 43, conclusion });
        const outcome = gate({ runs: [gateRun({ id: 41 }), latest], detail: latest });
        assert.equal(outcome.status, 1, conclusion);
        assert.match(outcome.stderr, /failed or run inventory is incomplete/u);
    }
});
