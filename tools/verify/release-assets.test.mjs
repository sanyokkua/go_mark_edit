import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

const script = resolve(import.meta.dirname, 'release-assets.mjs');
const names = ['macos-arm64.zip', 'windows-amd64.exe', 'windows-arm64.exe', 'linux-amd64', 'linux-arm64'];

void test('collects only the five expected assets and writes checksums', () => {
    const root = mkdtempSync(join(tmpdir(), 'release-assets-'));
    try {
        for (const [i, name] of names.entries()) {
            const dir = join(root, String(i));
            mkdirSync(dir);
            writeFileSync(join(dir, `GoMarkEdit-1.2.3-${name}`), name);
        }
        const run = () => spawnSync(process.execPath, [script, root, '1.2.3'], { encoding: 'utf8' });
        assert.equal(run().status, 0);
        assert.equal(readFileSync(join(root, 'SHA256SUMS.txt'), 'utf8').trim().split('\n').length, 5);
        assert.equal(run().status, 0, 'repeating collection is safe');
        rmSync(join(root, '0', 'GoMarkEdit-1.2.3-macos-arm64.zip'));
        assert.notEqual(run().status, 0, 'a missing asset is rejected');
        writeFileSync(join(root, '0', 'GoMarkEdit-1.2.3-macos-arm64.zip'), 'zip');
        writeFileSync(join(root, '0', 'installer.exe'), 'extra');
        assert.notEqual(run().status, 0, 'extra files are rejected');
    } finally {
        rmSync(root, { recursive: true, force: true });
    }
});
