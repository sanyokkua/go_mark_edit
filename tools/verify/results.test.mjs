import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import {
    copyFileSync,
    mkdtempSync,
    mkdirSync,
    readFileSync,
    readdirSync,
    rmSync,
    statSync,
    chmodSync,
    utimesSync,
    writeFileSync,
    lstatSync,
} from 'node:fs';
import test from 'node:test';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const repoRoot = resolve(import.meta.dirname, '../..');
const resultsScript = join(repoRoot, 'tools/verify/results.mjs');
const commonScript = join(repoRoot, 'scripts/lib/common.sh');

void test('only restores generated tree timestamps when its complete contents are unchanged', () => {
    const root = fixtureDirectory();
    try {
        const before = join(root, 'before');
        const after = join(root, 'after');
        const old = new Date('2020-01-01T00:00:00Z');
        const newer = new Date('2022-01-01T00:00:00Z');
        const reset = () => {
            rmSync(before, { recursive: true, force: true });
            rmSync(after, { recursive: true, force: true });
            for (const path of [before, after]) {
                mkdirSync(join(path, 'runtime'), { recursive: true });
                writeFileSync(join(path, 'runtime', 'runtime.js'), 'same');
                for (const entry of [join(path, 'runtime', 'runtime.js'), join(path, 'runtime'), path]) {
                    const time = path === before ? old : newer;
                    utimesSync(entry, time, time);
                }
            }
        };
        const restore = () => {
            const result = spawnSync(
                'bash',
                [
                    '-c',
                    `source ${shellQuote(commonScript)}; restore_unchanged_tree_times ${shellQuote(before)} ${shellQuote(after)}`,
                ],
                { encoding: 'utf8' },
            );
            assert.equal(result.status, 0, result.stderr);
        };
        reset();
        restore();
        for (const name of ['', 'runtime', 'runtime/runtime.js']) {
            assert.equal(statSync(join(after, name)).mtimeMs, old.getTime());
        }
        for (const change of ['changed', 'added', 'deleted']) {
            reset();
            if (change === 'changed') writeFileSync(join(after, 'runtime', 'runtime.js'), 'different');
            if (change === 'added') writeFileSync(join(after, 'runtime', 'extra.js'), 'new');
            if (change === 'deleted') rmSync(join(after, 'runtime', 'runtime.js'));
            utimesSync(after, newer, newer);
            restore();
            assert.equal(statSync(after).mtimeMs, newer.getTime(), change);
        }
    } finally {
        rmSync(root, { recursive: true, force: true });
    }
});

void test('verification and baseline pass fresh build reuse only to the same-run E2E stage', () => {
    const root = fixtureDirectory();
    try {
        mkdirSync(join(root, 'scripts/lib'), { recursive: true });
        mkdirSync(join(root, 'bin'), { recursive: true });
        for (const name of ['verify', 'baseline'])
            copyFileSync(join(repoRoot, 'scripts', name), join(root, 'scripts', name));
        writeFileSync(
            join(root, 'scripts/lib/common.sh'),
            `REPO_ROOT=${shellQuote(root)}\nnew_run_dir() { RUN_DIR="$REPO_ROOT/run"; mkdir -p "$RUN_DIR"; }\nbaseline_name() { printf fixture; }\nwrite_skipped_stage() { :; }\nusage_error() { exit 2; }\ncapture_stage() { local name="$1"; shift 2; "$@"; }\n`,
        );
        writeFileSync(
            join(root, 'scripts/lib/stages.sh'),
            `record() { printf '%s:%s\\n' "$1" "\${GOMARKEDIT_E2E_REUSE_DIST:-unset}" >> "$REPO_ROOT/calls"; [[ "$1" != "\${FAIL_STAGE:-}" ]]; }\nrun_lint_stage() { record lint; }\nrun_format_stage() { record format; }\nrun_build_stage() { record build; }\nrun_unit_stage() { record unit; }\nrun_integration_stage() { record integration; }\nrun_e2e_stage() { record e2e; }\n`,
        );
        for (const binary of ['node', 'git'])
            writeFileSync(join(root, 'bin', binary), '#!/bin/sh\nexit 0\n', { mode: 0o755 });
        const run = (entry, args = [], fail = '') => {
            rmSync(join(root, 'calls'), { force: true });
            const env = { ...process.env, PATH: `${join(root, 'bin')}:${process.env.PATH}`, FAIL_STAGE: fail };
            delete env.GOMARKEDIT_E2E_REUSE_DIST;
            const result = spawnSync('bash', [join(root, 'scripts', entry), ...args], {
                cwd: root,
                env,
                encoding: 'utf8',
            });
            return { result, calls: readFileSync(join(root, 'calls'), 'utf8').trim().split('\n') };
        };
        assert.deepEqual(run('verify').calls, [
            'lint:unset',
            'format:unset',
            'build:unset',
            'unit:unset',
            'integration:unset',
            'e2e:1',
        ]);
        assert.deepEqual(run('verify', ['e2e']).calls, ['e2e:unset']);
        assert.ok(!run('verify', ['--skip', 'e2e']).calls.some((line) => line.startsWith('e2e:')));
        assert.ok(!run('verify', [], 'build').calls.some((line) => line.startsWith('e2e:')));
        assert.equal(run('baseline', ['--compare']).calls.at(-1), 'e2e:1');
        assert.equal(run('baseline', ['--compare'], 'build').calls.at(-1), 'e2e:unset');
    } finally {
        rmSync(root, { recursive: true, force: true });
    }
});

void test('verify forwards a validated version only to its single build stage', () => {
    const root = fixtureDirectory();
    try {
        mkdirSync(join(root, 'scripts/lib'), { recursive: true });
        mkdirSync(join(root, 'bin'), { recursive: true });
        copyFileSync(join(repoRoot, 'scripts/verify'), join(root, 'scripts/verify'));
        copyFileSync(join(repoRoot, 'scripts/lib/release_version.sh'), join(root, 'scripts/lib/release_version.sh'));
        writeFileSync(
            join(root, 'scripts/lib/common.sh'),
            `REPO_ROOT=${shellQuote(root)}\nnew_run_dir() { RUN_DIR="$REPO_ROOT/run"; mkdir -p "$RUN_DIR"; }\nwrite_skipped_stage() { :; }\nusage_error() { exit 2; }\ncapture_stage() { shift 2; "$@"; }\n`,
        );
        writeFileSync(
            join(root, 'scripts/lib/stages.sh'),
            `record() { printf '%s:%s:%s\\n' "$1" "\${2:-}" "\${GOMARKEDIT_E2E_REUSE_DIST:-unset}" >> "$REPO_ROOT/calls"; [[ "$1" != "\${FAIL_STAGE:-}" ]]; }\nrun_lint_stage() { record lint "$*"; }\nrun_format_stage() { record format "$*"; }\nrun_build_stage() { record build "$*"; }\nrun_unit_stage() { record unit "$*"; }\nrun_integration_stage() { record integration "$*"; }\nrun_e2e_stage() { record e2e "$*"; }\n`,
        );
        writeFileSync(join(root, 'bin/node'), '#!/bin/sh\nexit 0\n', { mode: 0o755 });
        const run = (args, fail = '') => {
            rmSync(join(root, 'calls'), { force: true });
            const result = spawnSync('bash', [join(root, 'scripts/verify'), ...args], {
                cwd: root,
                env: { ...process.env, PATH: `${join(root, 'bin')}:${process.env.PATH}`, FAIL_STAGE: fail },
                encoding: 'utf8',
            });
            let calls = [];
            try {
                calls = readFileSync(join(root, 'calls'), 'utf8').trim().split('\n');
            } catch {
                /* no stages */
            }
            return { result, calls };
        };
        const full = run(['--version', '1.2.3-beta.2']);
        assert.equal(full.result.status, 0);
        assert.deepEqual(full.calls, [
            'lint::unset',
            'format::unset',
            'build:--version 1.2.3-beta.2:unset',
            'unit::unset',
            'integration::unset',
            'e2e::1',
        ]);
        assert.deepEqual(run(['build', '--version', '1.2.3']).calls, ['build:--version 1.2.3:unset']);
        assert.ok(!run(['--version', '1.2.3'], 'build').calls.some((call) => call.startsWith('e2e:')));
        for (const args of [
            ['--version'],
            ['--version', 'bad'],
            ['--version', '1.2.3', '--version', '1.2.4'],
            ['e2e', '--version', '1.2.3'],
        ]) {
            const invalid = run(args);
            assert.notEqual(invalid.result.status, 0);
            assert.deepEqual(invalid.calls, []);
        }
    } finally {
        rmSync(root, { recursive: true, force: true });
    }
});

void test('build stage forwards its version arguments to scripts/build', () => {
    const root = fixtureDirectory();
    try {
        mkdirSync(join(root, 'scripts'), { recursive: true });
        writeFileSync(join(root, 'scripts/build'), '#!/bin/sh\nprintf "%s\\n" "$@" > "$REPO_ROOT/arguments"\n', {
            mode: 0o755,
        });
        const result = spawnSync(
            'bash',
            [
                '-c',
                `export REPO_ROOT=${shellQuote(root)}; source ${shellQuote(join(repoRoot, 'scripts/lib/stages.sh'))}; run_build_stage --version 1.2.3-beta.2`,
            ],
            { encoding: 'utf8' },
        );
        assert.equal(result.status, 0, result.stderr);
        assert.equal(readFileSync(join(root, 'arguments'), 'utf8'), '--version\n1.2.3-beta.2\n');
    } finally {
        rmSync(root, { recursive: true, force: true });
    }
});

void test(
    'build restores mixed generated binding modes even on failure and reports generated drift',
    { skip: process.platform === 'win32' },
    () => {
        const root = fixtureDirectory();
        try {
            for (const path of [
                'scripts/lib',
                'bin',
                'build/bin',
                'build/linux',
                'frontend/scripts',
                'frontend/wailsjs/runtime',
            ]) {
                mkdirSync(join(root, path), { recursive: true });
            }
            for (const path of ['scripts/build', 'scripts/lib/common.sh', 'scripts/lib/release_version.sh']) {
                copyFileSync(join(repoRoot, path), join(root, path));
            }
            writeFileSync(join(root, '.gitignore'), '/build/bin/\n');
            for (const path of [
                'build/linux/install.sh',
                'build/appicon.png',
                'frontend/scripts/generate-editor-themes.mjs',
            ]) {
                writeFileSync(join(root, path), '');
            }
            for (const command of ['go', 'npm', 'pkg-config']) {
                writeFileSync(join(root, 'bin', command), '#!/bin/sh\nexit 0\n', { mode: 0o755 });
            }
            writeFileSync(
                join(root, 'bin/wails'),
                `#!/usr/bin/env bash
set -eu
runtime=frontend/wailsjs/runtime
chmod 755 "$runtime/"*
case "$1:$FIXTURE_BUILD_SCENARIO" in
    generate:generate-failure) exit 23 ;;
    build:build-failure) exit 24 ;;
    build:content-drift) printf 'changed bytes' > "$runtime/package.json" ;;
    build:symlink-drift)
        rm "$runtime/runtime.js"
        ln -s ../../../outside "$runtime/runtime.js"
        ;;
esac
`,
                { mode: 0o755 },
            );
            const files = ['package.json', 'runtime.d.ts', 'runtime.js'].map((name) =>
                join(root, 'frontend/wailsjs/runtime', name),
            );
            for (const file of [...files, join(root, 'outside')]) {
                writeFileSync(file, 'original bytes', { mode: 0o644 });
            }
            const git = (...args) => {
                const result = spawnSync('git', args, { cwd: root, encoding: 'utf8' });
                assert.equal(result.status, 0, result.stderr);
            };
            git('init', '--quiet');
            git('config', 'core.filemode', 'true');
            git('add', '.');
            git(
                '-c',
                'user.name=Fixture',
                '-c',
                'user.email=fixture@example.invalid',
                '-c',
                'commit.gpgsign=false',
                '-c',
                'core.hooksPath=/dev/null',
                'commit',
                '--quiet',
                '-m',
                'Fixture',
            );
            chmodSync(join(root, 'outside'), 0o600);

            const modes = [0o755, 0o640, 0o644];
            for (const [scenario, status] of [
                ['success', 0],
                ['generate-failure', 23],
                ['build-failure', 24],
                ['content-drift', 1],
                ['symlink-drift', 1],
            ]) {
                for (const [index, file] of files.entries()) chmodSync(file, modes[index]);
                const result = spawnSync('bash', ['scripts/build'], {
                    cwd: root,
                    encoding: 'utf8',
                    env: {
                        ...process.env,
                        PATH: `${join(root, 'bin')}:${process.env.PATH}`,
                        FIXTURE_BUILD_SCENARIO: scenario,
                    },
                });
                assert.equal(result.status, status, `${scenario}: ${result.stdout}\n${result.stderr}`);
                if (status === 1) assert.match(result.stderr, /build changed the working tree/);
                const regularFiles = scenario === 'symlink-drift' ? files.slice(0, 2) : files;
                assert.deepEqual(
                    regularFiles.map((file) => statSync(file).mode & 0o777),
                    modes.slice(0, regularFiles.length),
                    scenario,
                );
                if (scenario === 'symlink-drift') assert.ok(lstatSync(files[2]).isSymbolicLink());
                assert.equal(statSync(join(root, 'outside')).mode & 0o777, 0o600);
                if (scenario === 'content-drift') {
                    assert.equal(readFileSync(files[0], 'utf8'), 'changed bytes');
                    writeFileSync(files[0], 'original bytes');
                }
            }
        } finally {
            rmSync(root, { recursive: true, force: true });
        }
    },
);

void test(
    'E2E shell cleanup restores generated binding modes after Playwright failure, kill, or interrupt',
    { skip: process.platform === 'win32' },
    () => {
        const root = fixtureDirectory();
        try {
            for (const path of [
                'scripts/lib',
                'frontend/dist',
                'frontend/node_modules/.bin',
                'frontend/wailsjs/runtime',
            ]) {
                mkdirSync(join(root, path), { recursive: true });
            }
            for (const path of ['scripts/lib/common.sh', 'scripts/lib/stages.sh']) {
                copyFileSync(join(repoRoot, path), join(root, path));
            }
            const placeholder = join(root, 'frontend/dist/.gitkeep');
            writeFileSync(placeholder, 'original placeholder');
            writeFileSync(
                join(root, 'frontend/node_modules/.bin/playwright'),
                `#!/bin/sh
set -eu
rm dist/.gitkeep
case "$FIXTURE_E2E_SCENARIO" in
    failure) exit 23 ;;
    kill)
        chmod 755 wailsjs/runtime/*
        kill -KILL "$$"
        ;;
    interrupt)
        chmod 755 wailsjs/runtime/*
        kill -INT "$PPID"
        kill -INT "$$"
        ;;
esac
`,
                {
                    mode: 0o755,
                },
            );
            const files = ['runtime.js', 'runtime.d.ts'].map((name) => join(root, 'frontend/wailsjs/runtime', name));
            for (const file of files) writeFileSync(file, 'original bytes', { mode: 0o644 });
            for (const args of [
                ['init', '--quiet'],
                ['add', 'frontend/wailsjs'],
            ]) {
                const result = spawnSync('git', args, { cwd: root, encoding: 'utf8' });
                assert.equal(result.status, 0, result.stderr);
            }
            chmodSync(files[0], 0o755);
            chmodSync(files[1], 0o640);
            for (const [scenario, status] of [
                ['failure', 23],
                ['kill', 137],
                ['interrupt', 130],
            ]) {
                const result = spawnSync(
                    'bash',
                    [
                        '-c',
                        'set -euo pipefail; source scripts/lib/common.sh; source scripts/lib/stages.sh; RUN_DIR="$PWD/run"; run_e2e_stage',
                    ],
                    { cwd: root, encoding: 'utf8', env: { ...process.env, FIXTURE_E2E_SCENARIO: scenario } },
                );
                assert.equal(result.status, status, `${scenario}: ${result.stderr}`);
                assert.deepEqual(
                    files.map((file) => statSync(file).mode & 0o777),
                    [0o755, 0o640],
                    scenario,
                );
                assert.equal(readFileSync(placeholder, 'utf8'), 'original placeholder', scenario);
            }
        } finally {
            rmSync(root, { recursive: true, force: true });
        }
    },
);

function fixtureDirectory() {
    const directory = join(repoRoot, '.local_tmp_files');
    mkdirSync(directory, { recursive: true });
    return mkdtempSync(join(directory, 'verification-test-'));
}

function runResults(...arguments_) {
    return spawnSync(process.execPath, [resultsScript, ...arguments_], {
        cwd: repoRoot,
        encoding: 'utf8',
    });
}

function shellQuote(value) {
    return `'${value.replaceAll("'", "'\\''")}'`;
}

void test('baseline records supplied snapshot metadata and rejects missing or invalid inputs', () => {
    const root = fixtureDirectory();
    try {
        for (const name of ['lint', 'format', 'build', 'unit', 'integration', 'e2e']) {
            writeFileSync(join(root, `${name}.json`), JSON.stringify({ name, verdict: 'clean' }));
        }
        const diff = join(root, 'diff');
        const status = join(root, 'status');
        const output = join(root, 'baseline.json');
        writeFileSync(diff, 'hello');
        writeFileSync(status, '?? new file.md\0 M tracked.md\0');
        const commit = '1234567890abcdef1234567890abcdef12345678';
        const args = ['baseline', '--feature', 'fixture', '--run-dir', root, '--output', output];
        const snapshot = ['--commit', commit, '--diff-file', diff, '--status-file', status];
        const result = spawnSync(process.execPath, [resultsScript, ...args, ...snapshot], {
            cwd: root,
            env: { ...process.env, PATH: '' },
            encoding: 'utf8',
        });
        assert.equal(result.status, 0, result.stderr);
        const record = JSON.parse(readFileSync(output, 'utf8'));
        assert.equal(record.commit, commit);
        assert.equal(record.dirtyDiffSha256, '2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824');
        assert.deepEqual(record.untrackedPaths, ['new file.md']);
        for (const invalid of [
            ['--diff-file', diff, '--status-file', status],
            ['--commit', commit, '--status-file', status],
            ['--commit', commit, '--diff-file', diff],
            ['--commit', '1234', '--diff-file', diff, '--status-file', status],
        ]) {
            const rejected = runResults(...args, ...invalid);
            assert.notEqual(rejected.status, 0);
        }
    } finally {
        rmSync(root, { recursive: true, force: true });
    }
});

void test('baseline captures the script repository when invoked from a different Git checkout', () => {
    const root = fixtureDirectory();
    try {
        const workspace = join(root, 'workspace');
        const caller = join(root, 'caller');
        mkdirSync(join(workspace, 'scripts/lib'), { recursive: true });
        mkdirSync(join(workspace, 'tools/verify'), { recursive: true });
        mkdirSync(caller);
        copyFileSync(join(repoRoot, 'scripts/baseline'), join(workspace, 'scripts/baseline'));
        copyFileSync(commonScript, join(workspace, 'scripts/lib/common.sh'));
        copyFileSync(resultsScript, join(workspace, 'tools/verify/results.mjs'));
        // Supply successful stage records without running all six verification stages in the fixture.
        writeFileSync(
            join(workspace, 'scripts/lib/stages.sh'),
            `capture_stage() { printf '{"name":"%s","verdict":"clean","exitCode":0,"durationMs":0,"findings":[]}\\n' "$1" > "$RUN_DIR/$1.json"; }\n`,
        );
        const env = { ...process.env, GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_NOSYSTEM: '1' };
        function git(cwd, ...args) {
            const result = spawnSync(
                'git',
                ['-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.test', ...args],
                {
                    cwd,
                    env,
                    encoding: 'utf8',
                },
            );
            assert.equal(result.status, 0, result.stderr);
            return result.stdout;
        }
        git(workspace, 'init', '--initial-branch=fixture');
        git(caller, 'init', '--initial-branch=caller');
        writeFileSync(join(workspace, '.gitignore'), '.local_tmp_files/\n');
        const tracked = join(workspace, 'tracked.md');
        writeFileSync(tracked, 'initial\n');
        git(workspace, 'add', '.');
        git(workspace, 'commit', '-m', 'workspace snapshot');
        git(caller, 'commit', '--allow-empty', '-m', 'unrelated checkout');
        writeFileSync(tracked, 'changed\n');
        writeFileSync(join(workspace, 'workspace draft.md'), 'draft\n');
        writeFileSync(join(caller, 'unrelated.md'), 'unrelated\n');
        const run = (...args) =>
            spawnSync('bash', [join(workspace, 'scripts/baseline'), ...args], { cwd: caller, env, encoding: 'utf8' });
        const created = run();
        assert.equal(created.status, 0, created.stderr);
        const record = JSON.parse(readFileSync(join(workspace, '.local_tmp_files/baseline/fixture.json'), 'utf8'));
        assert.equal(record.commit, git(workspace, 'rev-parse', 'HEAD').trim());
        assert.deepEqual(record.untrackedPaths, ['workspace draft.md']);
        assert.equal(
            record.dirtyDiffSha256,
            createHash('sha256')
                .update(git(workspace, 'diff', '--binary', 'HEAD'))
                .digest('hex'),
        );
        const compared = run('--compare');
        assert.equal(compared.status, 0, compared.stderr);
    } finally {
        rmSync(root, { recursive: true, force: true });
    }
});

void test('reports backend and frontend test counts as separate groups', () => {
    const runDirectory = fixtureDirectory();
    try {
        const goLog = [
            JSON.stringify({
                Action: 'run',
                Package: 'example/unit',
                Test: 'TestSave',
            }),
            JSON.stringify({
                Action: 'pass',
                Package: 'example/unit',
                Test: 'TestSave',
            }),
            JSON.stringify({
                Action: 'run',
                Package: 'example/unit',
                Test: 'TestCancel',
            }),
            JSON.stringify({
                Action: 'skip',
                Package: 'example/unit',
                Test: 'TestCancel',
            }),
        ].join('\n');
        writeFileSync(join(runDirectory, 'unit.log'), goLog);
        writeFileSync(
            join(runDirectory, 'frontend-unit-jest.json'),
            JSON.stringify({
                numTotalTests: 3,
                numPassedTests: 2,
                numFailedTests: 0,
                numPendingTests: 1,
                numTodoTests: 0,
            }),
        );

        const stage = runResults(
            'stage',
            '--name',
            'unit',
            '--command',
            'scripts/test unit',
            '--exit-code',
            '0',
            '--duration-ms',
            '12',
            '--log',
            join(runDirectory, 'unit.log'),
            '--output',
            join(runDirectory, 'unit.json'),
        );

        assert.equal(stage.status, 0, stage.stderr);
        const record = JSON.parse(readFileSync(join(runDirectory, 'unit.json'), 'utf8'));
        assert.deepEqual(record.testCounts.backend, {
            total: 2,
            passed: 1,
            failed: 0,
            skipped: 1,
            todo: 0,
            status: 'available',
        });
        assert.deepEqual(record.testCounts.frontend, {
            total: 3,
            passed: 2,
            failed: 0,
            skipped: 1,
            todo: 0,
            status: 'available',
        });
    } finally {
        rmSync(runDirectory, { recursive: true, force: true });
    }
});

void test('reports failed and skipped backend/frontend tests and Playwright counts', () => {
    const runDirectory = fixtureDirectory();
    try {
        writeFileSync(
            join(runDirectory, 'unit.log'),
            [
                JSON.stringify({
                    Action: 'run',
                    Package: 'example/unit',
                    Test: 'TestPass',
                }),
                JSON.stringify({
                    Action: 'pass',
                    Package: 'example/unit',
                    Test: 'TestPass',
                }),
                JSON.stringify({
                    Action: 'run',
                    Package: 'example/unit',
                    Test: 'TestFail',
                }),
                JSON.stringify({
                    Action: 'fail',
                    Package: 'example/unit',
                    Test: 'TestFail',
                }),
                JSON.stringify({
                    Action: 'run',
                    Package: 'example/unit',
                    Test: 'TestSkip',
                }),
                JSON.stringify({
                    Action: 'skip',
                    Package: 'example/unit',
                    Test: 'TestSkip',
                }),
            ].join('\n'),
        );
        writeFileSync(
            join(runDirectory, 'frontend-unit-jest.json'),
            JSON.stringify({
                numTotalTests: 4,
                numPassedTests: 2,
                numFailedTests: 1,
                numPendingTests: 1,
                numTodoTests: 0,
            }),
        );

        const unit = runResults(
            'stage',
            '--name',
            'unit',
            '--command',
            'scripts/test unit',
            '--exit-code',
            '1',
            '--duration-ms',
            '12',
            '--log',
            join(runDirectory, 'unit.log'),
            '--output',
            join(runDirectory, 'unit.json'),
        );

        assert.equal(unit.status, 1, unit.stderr);
        const unitRecord = JSON.parse(readFileSync(join(runDirectory, 'unit.json'), 'utf8'));
        assert.deepEqual(unitRecord.testCounts.backend, {
            total: 3,
            passed: 1,
            failed: 1,
            skipped: 1,
            todo: 0,
            status: 'available',
        });
        assert.deepEqual(unitRecord.testCounts.frontend, {
            total: 4,
            passed: 2,
            failed: 1,
            skipped: 1,
            todo: 0,
            status: 'available',
        });
        assert.equal(unitRecord.verdict, 'findings');
        assert.match(JSON.stringify(unitRecord.findings), /backend test count includes 1 failed test/);
        assert.match(JSON.stringify(unitRecord.findings), /frontend test count includes 1 failed test/);

        writeFileSync(join(runDirectory, 'e2e.log'), 'playwright output\n');
        writeFileSync(
            join(runDirectory, 'frontend-e2e-playwright.json'),
            JSON.stringify({
                stats: {
                    expected: 4,
                    unexpected: 1,
                    flaky: 1,
                    skipped: 2,
                },
            }),
        );

        const e2e = runResults(
            'stage',
            '--name',
            'e2e',
            '--command',
            'scripts/test e2e',
            '--exit-code',
            '1',
            '--duration-ms',
            '12',
            '--log',
            join(runDirectory, 'e2e.log'),
            '--output',
            join(runDirectory, 'e2e.json'),
        );

        assert.equal(e2e.status, 1, e2e.stderr);
        const e2eRecord = JSON.parse(readFileSync(join(runDirectory, 'e2e.json'), 'utf8'));
        assert.deepEqual(e2eRecord.testCounts.frontend, {
            total: 8,
            passed: 5,
            failed: 1,
            skipped: 2,
            todo: 0,
            status: 'available',
        });
    } finally {
        rmSync(runDirectory, { recursive: true, force: true });
    }
});

void test('prints grouped counts and not-run stages in the human summary', () => {
    const runDirectory = fixtureDirectory();
    try {
        writeFileSync(
            join(runDirectory, 'unit.json'),
            JSON.stringify({
                name: 'unit',
                commands: ['scripts/test unit'],
                exitCode: 0,
                durationMs: 12,
                verdict: 'clean',
                testCounts: {
                    backend: {
                        total: 2,
                        passed: 2,
                        failed: 0,
                        skipped: 0,
                        todo: 0,
                        status: 'available',
                    },
                    frontend: {
                        total: 3,
                        passed: 3,
                        failed: 0,
                        skipped: 0,
                        todo: 0,
                        status: 'available',
                    },
                },
                collected: 5,
                findings: [],
            }),
        );
        writeFileSync(
            join(runDirectory, 'e2e.json'),
            JSON.stringify({
                name: 'e2e',
                commands: ['scripts/verify --skip e2e'],
                exitCode: 0,
                durationMs: 0,
                verdict: 'skipped',
                collected: 0,
                findings: [],
            }),
        );

        const summary = runResults(
            'summary',
            '--run-dir',
            runDirectory,
            '--output',
            join(runDirectory, 'summary.json'),
        );

        assert.equal(summary.status, 0, summary.stderr);
        assert.match(summary.stdout, /Unit \.{14} PASS/);
        assert.match(summary.stdout, /Backend \.{10} 2 total, 2 passed, 0 failed, 0 skipped/);
        assert.match(summary.stdout, /Frontend \.{9} 3 total, 3 passed, 0 failed, 0 skipped/);
        assert.match(summary.stdout, /Lint \.{14} NOT RUN/);
        assert.match(summary.stdout, /E2E \.{15} SKIPPED \(--skip e2e\)/);
    } finally {
        rmSync(runDirectory, { recursive: true, force: true });
    }
});

void test('keeps the final summary available when an auxiliary report is incomplete', () => {
    const runDirectory = fixtureDirectory();
    try {
        writeFileSync(
            join(runDirectory, 'unit.json'),
            JSON.stringify({
                name: 'unit',
                commands: ['scripts/test unit'],
                exitCode: 0,
                durationMs: 12,
                verdict: 'clean',
                collected: 0,
                findings: [],
            }),
        );
        writeFileSync(join(runDirectory, 'frontend-unit-jest.json'), '{');

        const summary = runResults(
            'summary',
            '--run-dir',
            runDirectory,
            '--expected',
            'unit',
            '--output',
            join(runDirectory, 'summary.json'),
        );

        assert.equal(summary.status, 0, summary.stderr);
        assert.match(summary.stdout, /Unit \.{14} PASS/);
        assert.equal(JSON.parse(readFileSync(join(runDirectory, 'summary.json'), 'utf8')).stages.length, 1);
    } finally {
        rmSync(runDirectory, { recursive: true, force: true });
    }
});

void test('marks a missing frontend report as unreliable instead of zero tests', () => {
    const runDirectory = fixtureDirectory();
    try {
        const goLog = [
            JSON.stringify({
                Action: 'run',
                Package: 'example/unit',
                Test: 'TestSave',
            }),
            JSON.stringify({
                Action: 'pass',
                Package: 'example/unit',
                Test: 'TestSave',
            }),
        ].join('\n');
        writeFileSync(join(runDirectory, 'unit.log'), goLog);

        const stage = runResults(
            'stage',
            '--name',
            'unit',
            '--command',
            'scripts/test unit',
            '--exit-code',
            '0',
            '--duration-ms',
            '12',
            '--log',
            join(runDirectory, 'unit.log'),
            '--output',
            join(runDirectory, 'unit.json'),
        );

        assert.equal(stage.status, 1, stage.stderr);
        const record = JSON.parse(readFileSync(join(runDirectory, 'unit.json'), 'utf8'));
        assert.equal(record.exitCode, 1);
        assert.deepEqual(record.testCounts.frontend, {
            total: null,
            passed: null,
            failed: null,
            skipped: null,
            todo: null,
            status: 'unavailable',
        });
    } finally {
        rmSync(runDirectory, { recursive: true, force: true });
    }
});

void test('streams stage output while preserving the command exit code', () => {
    const runDirectory = fixtureDirectory();
    try {
        const script = [
            `source ${shellQuote(commonScript)}`,
            `RUN_DIR=${shellQuote(runDirectory)}`,
            'export RUN_DIR',
            `capture_stage unit 'fake stage' bash -c 'printf "backend output\\n"; printf "frontend error\\n" >&2; exit 7'`,
        ].join('\n');
        const result = spawnSync('bash', ['-c', script], {
            cwd: repoRoot,
            encoding: 'utf8',
        });

        assert.equal(result.status, 7, result.stderr);
        assert.match(result.stdout, /backend output/);
        assert.match(result.stdout, /frontend error/);
        assert.match(readFileSync(join(runDirectory, 'unit.log'), 'utf8'), /backend output/);
    } finally {
        rmSync(runDirectory, { recursive: true, force: true });
    }
});

void test('parses a clean golangci report without printing its linter inventory', () => {
    const runDirectory = fixtureDirectory();
    try {
        const input = join(runDirectory, 'golangci-lint.json');
        const output = join(runDirectory, 'golangci-lint.summary.json');
        writeFileSync(
            input,
            `${JSON.stringify({
                Issues: [],
                Report: { Linters: [{ Name: 'arangolint' }, { Name: 'errcheck' }] },
            })}\n0 issues.\n`,
        );

        const result = runResults(
            'report',
            '--tool',
            'golangci-lint',
            '--input',
            input,
            '--output',
            output,
            '--exit-code',
            '0',
        );

        assert.equal(result.status, 0, result.stderr);
        assert.match(result.stdout, /golangci-lint.*PASS/);
        assert.doesNotMatch(result.stdout, /arangolint/);
        assert.doesNotMatch(result.stdout, /\{"Issues"/);
        assert.deepEqual(JSON.parse(readFileSync(output, 'utf8')), {
            tool: 'golangci-lint',
            status: 'available',
            exitCode: 0,
            counts: { files: 0, errors: 0, warnings: 0 },
            findings: [],
        });
    } finally {
        rmSync(runDirectory, { recursive: true, force: true });
    }
});

void test('counts golangci warnings without turning them into failures', () => {
    const runDirectory = fixtureDirectory();
    try {
        const input = join(runDirectory, 'golangci-lint.json');
        const output = join(runDirectory, 'golangci-lint.summary.json');
        writeFileSync(
            input,
            JSON.stringify({
                Issues: [
                    {
                        Severity: 'warning',
                        FromLinter: 'godox',
                        Text: 'TODO comment',
                        Pos: { Filename: 'internal/app.go', Line: 4, Column: 2 },
                    },
                ],
            }),
        );

        const result = runResults(
            'report',
            '--tool',
            'golangci-lint',
            '--input',
            input,
            '--output',
            output,
            '--exit-code',
            '0',
        );

        assert.equal(result.status, 0, result.stderr);
        assert.match(result.stdout, /golangci-lint.*0 errors, 1 warning/);
        assert.doesNotMatch(result.stdout, /TODO comment/);
        assert.deepEqual(JSON.parse(readFileSync(output, 'utf8')).counts, {
            files: 1,
            errors: 0,
            warnings: 1,
        });
    } finally {
        rmSync(runDirectory, { recursive: true, force: true });
    }
});

void test('prints ESLint errors and Stylelint warnings as concise diagnostics', () => {
    const runDirectory = fixtureDirectory();
    try {
        const eslintInput = join(runDirectory, 'eslint.json');
        const eslintOutput = join(runDirectory, 'eslint.summary.json');
        writeFileSync(
            eslintInput,
            JSON.stringify([
                {
                    filePath: 'frontend/src/App.tsx',
                    errorCount: 1,
                    warningCount: 1,
                    messages: [
                        {
                            ruleId: 'no-console',
                            severity: 2,
                            message: 'Unexpected console statement.',
                            line: 12,
                            column: 4,
                        },
                        {
                            ruleId: 'style-warning',
                            severity: 1,
                            message: 'Style warning.',
                            line: 20,
                            column: 2,
                        },
                    ],
                },
            ]),
        );

        const eslint = runResults(
            'report',
            '--tool',
            'eslint',
            '--input',
            eslintInput,
            '--output',
            eslintOutput,
            '--exit-code',
            '1',
        );

        assert.equal(eslint.status, 1, eslint.stderr);
        assert.match(eslint.stdout, /ESLint.*1 error, 1 warning/);
        assert.match(eslint.stdout, /frontend\/src\/App\.tsx:12:4/);
        assert.doesNotMatch(eslint.stdout, /\{"filePath"/);

        const stylelintInput = join(runDirectory, 'stylelint.json');
        const stylelintOutput = join(runDirectory, 'stylelint.summary.json');
        writeFileSync(
            stylelintInput,
            JSON.stringify([
                {
                    source: 'frontend/src/App.css',
                    warnings: [
                        {
                            line: 4,
                            column: 2,
                            rule: 'color-no-invalid-hex',
                            text: 'Unexpected invalid hex color.',
                            severity: 'warning',
                        },
                    ],
                },
            ]),
        );

        const stylelint = runResults(
            'report',
            '--tool',
            'stylelint',
            '--input',
            stylelintInput,
            '--output',
            stylelintOutput,
            '--exit-code',
            '0',
        );

        assert.equal(stylelint.status, 0, stylelint.stderr);
        assert.match(stylelint.stdout, /Stylelint.*0 errors, 1 warning/);
        assert.doesNotMatch(stylelint.stdout, /\{"source"/);
    } finally {
        rmSync(runDirectory, { recursive: true, force: true });
    }
});

void test('parses Go JSON test events and prints only the useful failure summary', () => {
    const runDirectory = fixtureDirectory();
    try {
        const input = join(runDirectory, 'go-unit.jsonl');
        const output = join(runDirectory, 'go-unit.summary.json');
        writeFileSync(
            input,
            [
                { Action: 'run', Package: 'example/unit', Test: 'TestPass' },
                { Action: 'pass', Package: 'example/unit', Test: 'TestPass' },
                { Action: 'run', Package: 'example/unit', Test: 'TestFail' },
                { Action: 'fail', Package: 'example/unit', Test: 'TestFail' },
                { Action: 'run', Package: 'example/unit', Test: 'TestSkip' },
                { Action: 'skip', Package: 'example/unit', Test: 'TestSkip' },
            ]
                .map((event) => JSON.stringify(event))
                .join('\n'),
        );

        const result = runResults(
            'report',
            '--tool',
            'go-test',
            '--input',
            input,
            '--output',
            output,
            '--exit-code',
            '1',
        );

        assert.equal(result.status, 1, result.stderr);
        assert.match(result.stdout, /Go tests.*1 failed/);
        assert.match(result.stdout, /TestFail/);
        assert.doesNotMatch(result.stdout, /\{"Action":"run"/);
        const report = JSON.parse(readFileSync(output, 'utf8'));
        assert.deepEqual(report.testCounts, {
            total: 3,
            passed: 1,
            failed: 1,
            skipped: 1,
            todo: 0,
            status: 'available',
        });
    } finally {
        rmSync(runDirectory, { recursive: true, force: true });
    }
});

void test('prefers structured failures without treating successful test names as findings', () => {
    const runDirectory = fixtureDirectory();
    try {
        const reportsDirectory = join(runDirectory, 'reports');
        mkdirSync(reportsDirectory, { recursive: true });
        const normalizedGoReport = JSON.stringify({
            tool: 'go-test',
            status: 'unreliable',
            exitCode: 1,
            testCounts: {
                total: 2,
                passed: 0,
                failed: 1,
                skipped: 0,
                todo: 0,
                status: 'unreliable',
            },
            findings: [
                {
                    id: 'go-test:example/unit/TestOutcome:TestOutcome',
                    tool: 'go-test',
                    location: 'example/unit/TestOutcome',
                    message: 'failed test TestOutcome',
                },
            ],
        });
        writeFileSync(join(reportsDirectory, 'go-unit.jsonl.summary.json'), normalizedGoReport);
        writeFileSync(join(reportsDirectory, 'go-unit-duplicate.summary.json'), normalizedGoReport);
        writeFileSync(
            join(runDirectory, 'frontend-unit-jest.json'),
            JSON.stringify({
                numTotalTests: 2,
                numPassedTests: 2,
                numFailedTests: 0,
                numPendingTests: 0,
                numTodoTests: 0,
            }),
        );
        writeFileSync(
            join(runDirectory, 'unit.log'),
            [
                '+ Go backend unit tests',
                'Go tests ........ UNRELIABLE',
                '  example/unit/TestOutcome failed test TestOutcome',
                '+ Jest frontend unit tests',
                'PASS unit tests/unit/startupFailure.test.tsx',
                'PASS unit tests/unit/utils/parseError.test.ts',
            ].join('\n'),
        );

        const stage = runResults(
            'stage',
            '--name',
            'unit',
            '--command',
            'scripts/test unit',
            '--exit-code',
            '1',
            '--duration-ms',
            '12',
            '--log',
            join(runDirectory, 'unit.log'),
            '--reports-dir',
            reportsDirectory,
            '--output',
            join(runDirectory, 'unit.json'),
        );

        assert.equal(stage.status, 1, stage.stderr);
        const record = JSON.parse(readFileSync(join(runDirectory, 'unit.json'), 'utf8'));
        assert.deepEqual(
            record.findings
                .filter((finding) => !finding.id.startsWith('report:') && !finding.id.startsWith('test-count:'))
                .map((finding) => finding.id),
            ['go-test:example/unit/TestOutcome:TestOutcome'],
        );
        assert.equal(record.findings.filter((finding) => finding.tool === 'jest').length, 0);
        assert.ok(record.findings.some((finding) => finding.id === 'report:unit:go-test:unavailable'));
        assert.ok(record.findings.some((finding) => finding.id === 'test-count:unit:backend:unavailable'));
    } finally {
        rmSync(runDirectory, { recursive: true, force: true });
    }
});

void test('keeps passing E2E titles and another stage report out of E2E findings', () => {
    const runDirectory = fixtureDirectory();
    try {
        const reportsDirectory = join(runDirectory, 'reports');
        mkdirSync(reportsDirectory, { recursive: true });
        writeFileSync(
            join(reportsDirectory, 'go-integration.jsonl.summary.json'),
            JSON.stringify({
                tool: 'go-test',
                status: 'available',
                exitCode: 1,
                testCounts: { total: 1, passed: 0, failed: 1, skipped: 0, todo: 0, status: 'available' },
                findings: [
                    { id: 'go-test:TestUnrelated', tool: 'go-test', location: 'TestUnrelated', message: 'failed test' },
                ],
            }),
        );
        writeFileSync(
            join(runDirectory, 'frontend-e2e-playwright.json'),
            JSON.stringify({
                stats: { expected: 2, unexpected: 0, flaky: 0, skipped: 0 },
            }),
        );
        writeFileSync(
            join(runDirectory, 'e2e.log'),
            [
                '[1/2] [chromium] › tests/e2e/real-files.test.ts:562:5 › saves after a failure is dismissed',
                '[chromium] › tests/e2e/real-files.test.ts:562:5 › saves after a failure is dismissed',
                '[2/2] [chromium] › tests/e2e/startup-close.test.ts:50:1 › retrying a failed settings startup',
                '2 passed (3.1s)',
            ].join('\n'),
        );
        const result = runResults(
            'stage',
            '--name',
            'e2e',
            '--command',
            'scripts/test e2e',
            '--exit-code',
            '0',
            '--log',
            join(runDirectory, 'e2e.log'),
            '--reports-dir',
            reportsDirectory,
            '--output',
            join(runDirectory, 'e2e.json'),
        );
        assert.equal(result.status, 0, result.stderr);
        const record = JSON.parse(readFileSync(join(runDirectory, 'e2e.json'), 'utf8'));
        assert.equal(record.verdict, 'clean');
        assert.deepEqual(record.findings, []);

        const interrupted = runResults(
            'stage',
            '--name',
            'e2e',
            '--command',
            'scripts/test e2e',
            '--exit-code',
            '1',
            '--log',
            join(runDirectory, 'e2e.log'),
            '--reports-dir',
            reportsDirectory,
            '--output',
            join(runDirectory, 'e2e-interrupted.json'),
        );
        assert.equal(interrupted.status, 1);
        const interruptedRecord = JSON.parse(readFileSync(join(runDirectory, 'e2e-interrupted.json'), 'utf8'));
        assert.equal(interruptedRecord.verdict, 'unreliable');
        assert.deepEqual(interruptedRecord.findings, []);
    } finally {
        rmSync(runDirectory, { recursive: true, force: true });
    }
});

void test('keeps raw failure fallback and the complete tsx location', () => {
    const runDirectory = fixtureDirectory();
    try {
        writeFileSync(
            join(runDirectory, 'build.log'),
            [
                '+ Jest frontend unit tests',
                'PASS unit tests/unit/startupFailure.test.tsx',
                'PASS unit tests/unit/utils/parseError.test.ts',
                'FAIL unit tests/unit/renderFailure.test.tsx',
            ].join('\n'),
        );

        const stage = runResults(
            'stage',
            '--name',
            'build',
            '--command',
            'fake Jest command',
            '--exit-code',
            '1',
            '--duration-ms',
            '12',
            '--log',
            join(runDirectory, 'build.log'),
            '--output',
            join(runDirectory, 'build.json'),
        );

        assert.equal(stage.status, 1, stage.stderr);
        const record = JSON.parse(readFileSync(join(runDirectory, 'build.json'), 'utf8'));
        assert.deepEqual(record.findings, [
            {
                id: 'jest:tests/unit/renderFailure.test.tsx:failure',
                tool: 'jest',
                location: 'tests/unit/renderFailure.test.tsx',
                message: 'FAIL unit tests/unit/renderFailure.test.tsx',
            },
        ]);
    } finally {
        rmSync(runDirectory, { recursive: true, force: true });
    }
});

void test('marks malformed reports unreliable instead of inventing zero counts', () => {
    const runDirectory = fixtureDirectory();
    try {
        const input = join(runDirectory, 'eslint.json');
        const output = join(runDirectory, 'eslint.summary.json');
        writeFileSync(input, '{not-json');

        const result = runResults(
            'report',
            '--tool',
            'eslint',
            '--input',
            input,
            '--output',
            output,
            '--exit-code',
            '0',
        );

        assert.equal(result.status, 3, result.stderr);
        assert.match(result.stdout, /ESLint.*UNRELIABLE/);
        assert.equal(JSON.parse(readFileSync(output, 'utf8')).status, 'unreliable');

        const missingOutput = join(runDirectory, 'missing.summary.json');
        const missing = runResults(
            'report',
            '--tool',
            'eslint',
            '--input',
            join(runDirectory, 'missing.json'),
            '--output',
            missingOutput,
            '--exit-code',
            '0',
        );
        assert.equal(missing.status, 3, missing.stderr);
        assert.match(missing.stdout, /ESLint.*UNAVAILABLE/);
        assert.equal(JSON.parse(readFileSync(missingOutput, 'utf8')).status, 'unavailable');
    } finally {
        rmSync(runDirectory, { recursive: true, force: true });
    }
});

void test('runs structured commands through a raw report file without losing the command exit code', () => {
    const runDirectory = fixtureDirectory();
    try {
        const report = join(runDirectory, 'reports', 'go-unit.jsonl');
        const script = [
            `source ${shellQuote(commonScript)}`,
            `RUN_DIR=${shellQuote(runDirectory)}`,
            'export RUN_DIR',
            `run_reported_command 'Go backend unit tests' go-test ${shellQuote(report)} bash -c 'printf "{\\"Action\\":\\"run\\",\\"Package\\":\\"example/unit\\",\\"Test\\":\\"TestFail\\"}\\n"; printf "failure details\\n" >&2; exit 7'`,
        ].join('\n');
        const result = spawnSync('bash', ['-c', script], {
            cwd: repoRoot,
            encoding: 'utf8',
        });

        assert.equal(result.status, 7, result.stderr);
        assert.match(result.stdout, /Go backend unit tests/);
        assert.match(result.stdout, /UNRELIABLE|Go tests/);
        assert.match(result.stderr, /failure details/);
        assert.match(readFileSync(report, 'utf8'), /TestFail/);
        assert.doesNotMatch(result.stdout, /\{"Action"/);
    } finally {
        rmSync(runDirectory, { recursive: true, force: true });
    }
});

void test('keeps baseline creation and comparison owned by scripts/baseline', () => {
    for (const entrypoint of ['scripts/verify', 'scripts/test']) {
        const source = readFileSync(join(repoRoot, entrypoint), 'utf8');
        assert.doesNotMatch(source, /\b(?:baseline|compare)\b/);
    }

    const baselineSource = readFileSync(join(repoRoot, 'scripts/baseline'), 'utf8');
    assert.match(baselineSource, /results\.mjs.*(?:baseline|compare)/s);
});

void test('does not require a migration baseline and allowlists CI diagnostics', () => {
    const archlintSource = readFileSync(join(repoRoot, 'tools/archlint/main.go'), 'utf8');
    assert.doesNotMatch(archlintSource, /checkMigrations|app_version_1_codebase/);

    for (const workflowPath of ['.github/workflows/verification.yml']) {
        const workflow = readFileSync(join(repoRoot, workflowPath), 'utf8');
        const artifactPath = workflow.match(
            /name: verification-runs-[\s\S]*?path:\s*\|([\s\S]*?)if-no-files-found:/,
        )?.[1];
        assert.ok(artifactPath, `${workflowPath} must define an artifact allowlist`);
        assert.match(workflow, /include-hidden-files:\s*true/);
        for (const pattern of ['summary.json', 'reports/', '*.log', '*.stderr', 'frontend-*.json']) {
            const escapedPattern = pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            assert.match(artifactPath, new RegExp(escapedPattern, 'u'));
        }
        assert.doesNotMatch(artifactPath, /(?:cache|tsconfig\.node\.tsbuildinfo)/);
    }
});

function pruneLocalTmp(root) {
    const script = [`source ${shellQuote(commonScript)}`, `prune_local_tmp ${shellQuote(root)}`].join('\n');
    return spawnSync('bash', ['-c', script], { cwd: repoRoot, encoding: 'utf8' });
}

function makeFolder(path, ageHours) {
    mkdirSync(path, { recursive: true });
    const when = new Date(Date.now() - ageHours * 3600 * 1000);
    utimesSync(path, when, when);
}

void test('keeps only the 10 newest run folders', () => {
    const root = fixtureDirectory();
    try {
        for (let index = 0; index < 11; index += 1) {
            makeFolder(join(root, 'runs', `run-${index}`), index + 1);
        }
        const result = pruneLocalTmp(root);

        assert.equal(result.status, 0, result.stderr);
        const remaining = readdirSync(join(root, 'runs')).sort();
        assert.equal(remaining.length, 10);
        assert.equal(remaining.includes('run-10'), false);
        assert.equal(remaining.includes('run-0'), true);
    } finally {
        rmSync(root, { recursive: true, force: true });
    }
});

void test('removes stale end-to-end and tooling test folders and keeps fresh ones', () => {
    const root = fixtureDirectory();
    try {
        makeFolder(join(root, 'e2e-run-old'), 25);
        makeFolder(join(root, 'e2e-run-new'), 1);
        makeFolder(join(root, 'verification-test-old'), 25);
        makeFolder(join(root, 'verification-test-new'), 1);
        const result = pruneLocalTmp(root);

        assert.equal(result.status, 0, result.stderr);
        assert.deepEqual(readdirSync(root).sort(), ['e2e-run-new', 'verification-test-new']);
    } finally {
        rmSync(root, { recursive: true, force: true });
    }
});

void test('leaves baselines, specification, caches and loose files untouched', () => {
    const root = fixtureDirectory();
    try {
        makeFolder(join(root, 'baseline'), 100);
        writeFileSync(join(root, 'baseline', 'main.json'), '{}');
        makeFolder(join(root, 'specification'), 100);
        makeFolder(join(root, 'cache'), 100);
        writeFileSync(join(root, 'verify31.out'), 'log');
        const old = new Date(Date.now() - 100 * 3600 * 1000);
        utimesSync(join(root, 'verify31.out'), old, old);
        const result = pruneLocalTmp(root);

        assert.equal(result.status, 0, result.stderr);
        assert.deepEqual(readdirSync(root).sort(), ['baseline', 'cache', 'specification', 'verify31.out']);
        assert.equal(readFileSync(join(root, 'baseline', 'main.json'), 'utf8'), '{}');
    } finally {
        rmSync(root, { recursive: true, force: true });
    }
});

void test('pruning without a runs folder succeeds', () => {
    const root = fixtureDirectory();
    try {
        const result = pruneLocalTmp(root);

        assert.equal(result.status, 0, result.stderr);
    } finally {
        rmSync(root, { recursive: true, force: true });
    }
});

void test('extracts diagnostic paths without stalling on long slash tokens', () => {
    const runDirectory = fixtureDirectory();
    try {
        const log = join(runDirectory, 'lint.log');
        const output = join(runDirectory, 'lint.json');
        writeFileSync(
            log,
            [
                'error src/foo.tsx:12:3 failure',
                'error a/file.go.more.js:8 failure',
                'error no recognized path',
                `error ${'a/'.repeat(30000)}missing`,
            ].join('\n'),
        );
        const result = spawnSync(
            process.execPath,
            [resultsScript, 'stage', '--name', 'lint', '--exit-code', '1', '--log', log, '--output', output],
            {
                cwd: repoRoot,
                encoding: 'utf8',
                timeout: 2000,
            },
        );
        assert.equal(result.status, 1, result.error?.message || result.stderr);
        const outputText = readFileSync(output, 'utf8');
        for (const location of ['src/foo.tsx', 'a/file.go.more.js', 'lint']) {
            assert.ok(outputText.includes(`"location": "${location}"`));
        }
    } finally {
        rmSync(runDirectory, { recursive: true, force: true });
    }
});
