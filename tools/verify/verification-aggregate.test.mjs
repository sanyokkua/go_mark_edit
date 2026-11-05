import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { join, resolve } from 'node:path';
import test from 'node:test';
import { workflowStepRun } from './workflow-shell.mjs';

const repo = resolve(import.meta.dirname, '../..');
const requiredInputs = ['CROSS_PLATFORM', 'STATIC', 'TESTS', 'E2E', 'MACOS_E2E'];

/**
 * @param {string} command
 * @param {Record<string, string>} statuses
 * @returns {{ status: unknown, stderr: string }}
 */
function runAggregate(command, statuses) {
    const result = /** @type {unknown} */ (
        spawnSync('bash', ['-c', command], {
            encoding: 'utf8',
            env: { ...process.env, ...statuses },
        })
    );
    if (
        result === null ||
        typeof result !== 'object' ||
        !('status' in result) ||
        !('stderr' in result) ||
        typeof result.stderr !== 'string'
    ) {
        throw new Error('could not run required verification command');
    }
    return result;
}

void test('required verification aggregate accepts only successful dependencies', () => {
    const command = workflowStepRun(join(repo, '.github/workflows/verification.yml'), 'Reject incomplete verification');
    const allSuccess = {
        CROSS_PLATFORM: 'success',
        STATIC: 'success',
        TESTS: 'success',
        E2E: 'success',
        MACOS_E2E: 'success',
    };
    const successful = runAggregate(command, allSuccess);
    assert.equal(successful.status, 0, successful.stderr);

    for (const input of requiredInputs) {
        for (const outcome of ['failure', 'cancelled', 'skipped']) {
            const failed = runAggregate(command, { ...allSuccess, [input]: outcome });
            assert.equal(failed.status, 1, `${input}=${outcome}: ${failed.stderr}`);
            assert.match(failed.stderr, new RegExp(`required verification result: ${outcome}`, 'u'));
        }
    }
});
