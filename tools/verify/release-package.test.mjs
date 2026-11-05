import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import test from 'node:test';

const repo = resolve(import.meta.dirname, '../..');

/** @param {string} line */
function indentation(line) {
    return line.match(/^ */u)?.[0].length ?? 0;
}

/** @returns {string} */
function packageCommand() {
    const workflow = /** @type {unknown} */ (readFileSync(join(repo, '.github/workflows/release.yml'), 'utf8'));
    if (typeof workflow !== 'string') throw new Error('could not read release workflow');
    const lines = workflow.split('\n');
    const stepIndex = lines.findIndex((line) => /^\s*- name: Package release asset\s*$/u.test(line));
    if (stepIndex < 0) throw new Error('missing packaging step');
    const stepIndent = indentation(lines[stepIndex]);
    let runIndex = stepIndex + 1;
    while (runIndex < lines.length && (lines[runIndex].trim() === '' || indentation(lines[runIndex]) > stepIndent)) {
        if (/^\s*run: \|\s*$/u.test(lines[runIndex])) break;
        runIndex++;
    }
    if (runIndex === lines.length || !/^\s*run: \|\s*$/u.test(lines[runIndex])) {
        throw new Error('missing packaging command');
    }
    const runIndent = indentation(lines[runIndex]);
    const block = [];
    for (let index = runIndex + 1; index < lines.length; index++) {
        const line = lines[index];
        if (line.trim() !== '' && indentation(line) <= runIndent) break;
        block.push(line);
    }
    const contentIndent = Math.min(...block.filter((line) => line.trim() !== '').map(indentation));
    if (!Number.isFinite(contentIndent)) throw new Error('empty packaging command');
    return block.map((line) => (line.trim() === '' ? '' : line.slice(contentIndent))).join('\n');
}

void test('packages a single-platform Linux Wails executable for both release targets', () => {
    const command = packageCommand();
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
