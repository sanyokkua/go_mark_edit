import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, copyFileSync, readFileSync, chmodSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const source = resolve('scripts/sonar');
function fixture(fail = '') {
    const root = mkdtempSync(join(tmpdir(), 'gomark-sonar-'));
    /** @param {string} path @param {string} body */
    const write = (path, body) => {
        const file = join(root, path);
        mkdirSync(join(file, '..'), { recursive: true });
        writeFileSync(file, '#!/bin/bash\nset -eu\n' + body + '\n');
        chmodSync(file, 0o755);
    };
    mkdirSync(join(root, 'scripts'), { recursive: true });
    copyFileSync(source, join(root, 'scripts/sonar'));
    write('scripts/build', 'echo build >> "$TRACE"; [[ "${FAIL:-}" != build ]]');
    write('scripts/test', 'echo test >> "$TRACE"; [[ "${FAIL:-}" != test ]]');
    write(
        'bin/go',
        'echo go >> "$TRACE"; [[ "${FAIL:-}" != go ]] || exit 1; for arg in "$@"; do case "$arg" in -coverprofile=*) out="${arg#*=}";; esac; done; if [[ "${FAIL:-}" == empty-go ]]; then printf "mode: atomic\\n" > "$out"; else printf "mode: atomic\\nfoo.go:1.1,2.1 1 1\\n" > "$out"; fi',
    );
    write(
        'frontend/node_modules/.bin/jest',
        'echo jest >> "$TRACE"; [[ "${FAIL:-}" != jest ]] || exit 1; for arg in "$@"; do case "$arg" in --coverageDirectory=*) out="${arg#*=}";; esac; done; mkdir -p "$out"; if [[ "${FAIL:-}" == empty-jest ]]; then printf "SF:src/file.ts\\nLF:1\\nLH:0\\n" > "$out/lcov.info"; else printf "SF:src/file.ts\\nLF:1\\nLH:1\\nend_of_record\\n" > "$out/lcov.info"; fi',
    );
    write(
        'bin/sonar-scanner',
        'grep -q "^SF:frontend/src/" .local_tmp_files/sonar/coverage/frontend/lcov.info; echo scanner >> "$TRACE"',
    );
    const trace = join(root, 'trace');
    const result = spawnSync('bash', [join(root, 'scripts/sonar')], {
        cwd: root,
        encoding: 'utf8',
        env: {
            ...process.env,
            PATH: join(root, 'bin') + ':' + process.env.PATH,
            TRACE: trace,
            FAIL: fail,
            SONAR_HOST_URL: 'http://localhost:9000',
            SONAR_TOKEN: 'test',
        },
    });
    const calls = (() => {
        try {
            return readFileSync(trace, 'utf8').trim().split('\n');
        } catch {
            return [];
        }
    })();
    rmSync(root, { recursive: true, force: true });
    return { result, calls };
}
void test('runs build and all tests before fresh coverage and scanner', () => {
    const { result, calls } = fixture();
    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(calls, ['build', 'test', 'go', 'jest', 'scanner']);
});
void test('does not publish if a prerequisite fails', () => {
    for (const fail of ['build', 'test', 'go', 'jest']) {
        const { result, calls } = fixture(fail);
        assert.notEqual(result.status, 0, fail);
        assert.ok(calls.includes(fail), fail);
        assert.ok(!calls.includes('scanner'), fail);
    }
});

void test('rejects empty coverage before scanning', () => {
    for (const fail of ['empty-go', 'empty-jest']) {
        const { result, calls } = fixture(fail);
        assert.notEqual(result.status, 0, fail);
        assert.ok(calls.includes('jest'), fail);
        assert.ok(!calls.includes('scanner'), fail);
    }
});
