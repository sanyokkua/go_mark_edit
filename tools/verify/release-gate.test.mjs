import assert from 'node:assert/strict';
import { test } from 'node:test';
import { assessRequiredJob, assessRun, chooseVerification } from './release-gate.mjs';

const sha = 'a'.repeat(40);
const repo = 'sanyokkua/go_mark_edit';
const run = (fields = {}) => ({
    id: 42,
    run_attempt: 1,
    event: 'push',
    head_branch: 'master',
    head_sha: sha,
    status: 'completed',
    conclusion: 'success',
    path: '.github/workflows/push.yml@master',
    repository: { full_name: repo },
    head_repository: { full_name: repo },
    referenced_workflows: [{ path: `${repo}/.github/workflows/verification.yml@master`, sha }],
    ...fields,
});
/** @param {ReturnType<typeof run>[]} runs */
const choose = (runs, total_count = runs.length) => chooseVerification({ total_count, workflow_runs: runs }, sha, repo);

void test('selects the latest trusted master push without needing revision metadata in the list', () => {
    assert.deepEqual(choose([run({ id: 41 }), run({ id: 42, referenced_workflows: undefined })]), {
        mode: 'inspect',
        id: 42,
    });
});

void test('ignores wrong commit, PR, fork and wrong workflow', () => {
    const invalid = [
        run({ head_sha: 'b'.repeat(40) }),
        run({ event: 'pull_request' }),
        run({ head_repository: { full_name: 'fork/repo' } }),
        run({ path: '.github/workflows/other.yml@master' }),
    ];
    assert.deepEqual(choose(invalid), { mode: 'fallback' });
});

void test('rejects incomplete API pagination rather than trusting an older page', () => {
    assert.deepEqual(choose([run()], 101), { mode: 'reject' });
});

void test('accepts a successful same-revision individual run and latest attempt', () => {
    assert.deepEqual(assessRun(run({ run_attempt: 3 }), sha, repo, 42), {
        mode: 'reuse',
        id: 42,
        attempt: 3,
    });
});

void test('rejects a failed latest run despite an older success or missing revision metadata', () => {
    const latest = run({ conclusion: 'failure', referenced_workflows: undefined });
    assert.deepEqual(choose([run({ id: 41 }), latest]), { mode: 'inspect', id: 42 });
    assert.deepEqual(assessRun(latest, sha, repo, 42), { mode: 'reject' });
});

void test('falls back when the newest trusted run is in progress', () => {
    assert.deepEqual(assessRun(run({ status: 'in_progress', conclusion: null }), sha, repo, 42), {
        mode: 'fallback',
    });
});

void test('does not reuse an older success after a newer run has outdated workflow metadata', () => {
    const latest = run({
        referenced_workflows: [{ path: `${repo}/.github/workflows/verification.yml@master`, sha: 'b'.repeat(40) }],
    });
    assert.deepEqual(choose([run({ id: 41 }), latest]), { mode: 'inspect', id: 42 });
    assert.deepEqual(assessRun(latest, sha, repo, 42), { mode: 'fallback' });
});

void test('rejects a detail response that differs from the selected run', () => {
    assert.deepEqual(assessRun(run({ id: 43 }), sha, repo, 42), { mode: 'reject' });
    assert.deepEqual(assessRun(run({ head_sha: 'b'.repeat(40) }), sha, repo, 42), { mode: 'reject' });
});

void test('requires one successful aggregate job from the latest attempt', () => {
    const jobs = { total_count: 1, jobs: [{ name: 'verify / required', conclusion: 'success', head_sha: sha }] };
    assert.equal(assessRequiredJob(jobs, sha), true);
    assert.equal(assessRequiredJob({ total_count: 1, jobs: [{ ...jobs.jobs[0], conclusion: 'skipped' }] }, sha), false);
    assert.equal(
        assessRequiredJob({ total_count: 1, jobs: [{ ...jobs.jobs[0], head_sha: 'b'.repeat(40) }] }, sha),
        false,
    );
});

void test('reuses a run whose local reusable workflow is reported as path@sha, as hosted runs report it', () => {
    const observed = run({
        referenced_workflows: [
            { path: `${repo}/.github/workflows/verification.yml@${sha}`, ref: 'refs/heads/master', sha },
        ],
    });
    assert.deepEqual(assessRun(observed, sha, repo, 42), { mode: 'reuse', id: 42, attempt: 1 });
});

void test('falls back instead of reusing when referenced workflows are absent, empty or for another file', () => {
    for (const referenced_workflows of [
        undefined,
        [],
        [{ path: `${repo}/.github/workflows/other.yml@master`, sha }],
        [{ path: `other/repo/.github/workflows/verification.yml@master`, sha }],
        [{ path: `${repo}/.github/workflows/verification.yml@master` }],
    ]) {
        assert.deepEqual(assessRun(run({ referenced_workflows }), sha, repo, 42), { mode: 'fallback' });
    }
});
