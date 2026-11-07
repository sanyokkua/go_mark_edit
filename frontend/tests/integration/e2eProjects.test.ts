import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';

function projects(env: Record<string, string>): string {
    const controlled: NodeJS.ProcessEnv = {
        ...process.env,
        E2E_NATIVE_CLIPBOARD: '',
        E2E_SUBSET: '',
        E2E_PROJECTS: '',
        ...env,
    };
    delete controlled.JEST_WORKER_ID;
    return execFileSync(process.execPath, [resolve('node_modules/@playwright/test/cli.js'), 'test', '--list'], {
        cwd: process.cwd(),
        env: controlled,
        encoding: 'utf8',
    });
}

test('native clipboard project requires explicit opt-in outside the macOS subset', () => {
    expect(projects({})).not.toContain('[chromium-native]');
    expect(projects({ E2E_NATIVE_CLIPBOARD: 'true' })).not.toContain('[chromium-native]');
    expect(projects({ E2E_NATIVE_CLIPBOARD: '1' })).toContain('[chromium-native]');
    const macos = projects({ E2E_SUBSET: 'macos' });
    expect(macos).toContain('[chromium-native]');
    expect(macos).toContain('[chromium-macos] › external-changes.test.ts');
    expect(() => projects({ E2E_PROJECTS: 'chromium-native' })).toThrow();
    expect(projects({ E2E_PROJECTS: 'chromium-native', E2E_NATIVE_CLIPBOARD: '1' })).toContain('[chromium-native]');
    expect(projects({ E2E_PROJECTS: 'chromium-serial' })).toContain('[chromium-serial]');
});
