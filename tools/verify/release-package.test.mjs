import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import test from 'node:test';
import { workflowStepRun } from './workflow-shell.mjs';

const repo = resolve(import.meta.dirname, '../..');

void test('packages a single-platform Linux Wails executable for both release targets', () => {
    const command = workflowStepRun(join(repo, '.github/workflows/release.yml'), 'Package release asset');
    for (const arch of ['amd64', 'arm64']) {
        const root = mkdtempSync(join(tmpdir(), 'release-package-'));
        try {
            mkdirSync(join(root, 'build/bin'), { recursive: true });
            writeFileSync(join(root, 'build/bin/GoMarkEdit'), 'native executable');
            const output = join(root, 'github-output');
            const result = /** @type {unknown} */ (
                spawnSync('bash', ['-c', command], {
                    cwd: root,
                    encoding: 'utf8',
                    env: {
                        ...process.env,
                        RUNNER_OS: 'Linux',
                        RELEASE_TARGET: `linux-${arch}`,
                        RELEASE_VERSION: '1.2.3-beta.1',
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
                throw new Error('could not run packaging command');
            }
            assert.equal(result.status, 0, result.stderr);
            const asset = join(root, `GoMarkEdit-1.2.3-beta.1-linux-${arch}`);
            assert.equal(readFileSync(asset, 'utf8'), 'native executable');
            assert.equal(statSync(asset).mode & 0o111, 0o111);
        } finally {
            rmSync(root, { recursive: true, force: true });
        }
    }
});
