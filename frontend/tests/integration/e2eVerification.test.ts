/** @jest-environment node */
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const repository = resolve(__dirname, '../../..');
const results = join(repository, 'tools/verify/results.mjs');
const testScript = join(repository, 'scripts/test');

function runResults(args: string[]) {
    return spawnSync(process.execPath, [results, ...args], { cwd: repository, encoding: 'utf8' });
}

function attempt(duration: number, stdout: string[], retry = 0) {
    return {
        retry,
        status: 'passed',
        duration,
        stdout: stdout.map((text) => ({ text })),
        stderr: [],
    };
}

test('reports E2E wall, preparation, exact lifecycle keys, retries and slow tests from real report files', () => {
    const directory = mkdtempSync(join(tmpdir(), 'e2e-summary-test-'));
    try {
        writeFileSync(join(directory, 'e2e.log'), '[e2e] prepareMs=250 run=/tmp/example\n');
        writeFileSync(
            join(directory, 'frontend-e2e-playwright.json'),
            JSON.stringify({
                stats: { expected: 2, unexpected: 0, flaky: 0, skipped: 0 },
                suites: [
                    {
                        title: 'first.test.ts',
                        file: 'first.test.ts',
                        specs: [
                            {
                                title: 'keeps document state',
                                tests: [
                                    {
                                        status: 'expected',
                                        results: [
                                            attempt(100, [
                                                '[e2e] launchMs=10 wailsPid=1\n',
                                                '[e2e] launchMs=4 wailsPid=2\n',
                                                '[e2e] relaunchMs=5\n',
                                                '[e2e] teardownMs=2\n',
                                            ]),
                                        ],
                                    },
                                ],
                            },
                        ],
                    },
                    {
                        title: 'second.test.ts',
                        file: 'second.test.ts',
                        specs: [
                            {
                                title: 'recovers after retry',
                                tests: [
                                    {
                                        status: 'expected',
                                        results: [
                                            attempt(
                                                40,
                                                ['prefix [e2e] launchMs=999\n', 'prefix [e2e] relaunchMs=7\n'],
                                                0,
                                            ),
                                            attempt(70, ['[e2e] launchMs=20\n', '[e2e] teardownMs=3\n'], 1),
                                        ],
                                    },
                                ],
                            },
                        ],
                    },
                ],
            }),
        );
        const stage = runResults([
            'stage',
            '--name',
            'e2e',
            '--command',
            'scripts/test e2e',
            '--exit-code',
            '0',
            '--duration-ms',
            '400',
            '--log',
            join(directory, 'e2e.log'),
            '--output',
            join(directory, 'e2e.json'),
        ]);
        expect(stage.status).toBe(0);
        const record = JSON.parse(readFileSync(join(directory, 'e2e.json'), 'utf8'));
        expect(record.e2eTiming).toMatchObject({
            wallMs: 400,
            prepareMs: 250,
            starts: 3,
            relaunches: 1,
            launchMs: 34,
            relaunchMs: 5,
            teardownMs: 5,
            retries: 1,
            failures: 0,
            skipped: 0,
        });
        expect(record.e2eTiming.slowestTests[0]).toMatchObject({
            file: 'second.test.ts',
            title: 'recovers after retry',
            durationMs: 110,
        });
        expect(record.e2eTiming.slowestFiles[0]).toMatchObject({ file: 'second.test.ts', durationMs: 110 });
        const summary = runResults(['summary', '--run-dir', directory, '--expected', 'e2e']);
        expect(summary.status).toBe(0);
        expect(summary.stdout).toContain('E2E wall: 400 ms');
        expect(summary.stdout).toContain('3 starts');
        expect(summary.stdout).toContain('launch total: 34 ms');
        expect(summary.stdout).toContain('relaunch inclusive total: 5 ms');
        expect(summary.stdout).toContain('teardown total: 5 ms');
        expect(summary.stdout).toContain('second.test.ts');
    } finally {
        rmSync(directory, { recursive: true, force: true });
    }
});

test('forwards targeted E2E options while rejecting them for other tiers', () => {
    const rejected = spawnSync('bash', [testScript, 'unit', '--', '--grep', 'unique-target'], {
        cwd: repository,
        encoding: 'utf8',
    });
    expect(rejected.status).toBe(2);
    expect(rejected.stderr).toContain('accepts exactly one tier');

    const forwarded = spawnSync('bash', [testScript, 'e2e', '--', '--unknown-selection-option'], {
        cwd: repository,
        encoding: 'utf8',
    });
    expect(forwarded.stdout + forwarded.stderr).toContain('unknown option');
    expect(forwarded.stdout + forwarded.stderr).toContain('--unknown-selection-option');

    const reserved = spawnSync('bash', [testScript, 'e2e', '--', '-c', 'another.config.ts'], {
        cwd: repository,
        encoding: 'utf8',
    });
    expect(reserved.status).toBe(2);
    expect(reserved.stderr).toContain('reserves -c');

    for (const option of ['-canother.config.ts', '--retries=1']) {
        const attempt = spawnSync('bash', [testScript, 'e2e', '--', option], {
            cwd: repository,
            encoding: 'utf8',
        });
        expect(attempt.status).toBe(2);
        expect(attempt.stderr).toContain(`reserves ${option}`);
    }
});
