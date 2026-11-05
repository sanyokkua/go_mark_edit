import assert from 'node:assert/strict';
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

const repo = resolve(import.meta.dirname, '../..');

void test('release build omits the installer when NSIS is available', () => {
    const root = mkdtempSync(join(tmpdir(), 'release-build-'));
    try {
        for (const dir of ['scripts/lib', 'bin', 'frontend/scripts', 'frontend/wailsjs'])
            mkdirSync(join(root, dir), { recursive: true });
        for (const file of ['scripts/build', 'scripts/lib/common.sh', 'scripts/lib/release_version.sh'])
            copyFileSync(join(repo, file), join(root, file));
        writeFileSync(join(root, 'frontend/scripts/generate-editor-themes.mjs'), '');
        for (const command of ['go', 'npm', 'makensis'])
            writeFileSync(join(root, 'bin', command), '#!/bin/sh\nexit 0\n', { mode: 0o755 });
        writeFileSync(join(root, 'bin/uname'), '#!/bin/sh\necho MINGW64_NT\n', { mode: 0o755 });
        writeFileSync(
            join(root, 'bin/wails'),
            '#!/bin/sh\nif [ "$1" = build ]; then printf "%s\\n" "$@" > "$REPO_ROOT/args"; fi\n',
            { mode: 0o755 },
        );
        spawnSync('git', ['init', '--quiet'], { cwd: root });
        spawnSync('git', ['add', '.'], { cwd: root });
        spawnSync(
            'git',
            [
                '-c',
                'user.name=Fixture',
                '-c',
                'user.email=fixture@example.invalid',
                'commit',
                '--quiet',
                '-m',
                'fixture',
            ],
            { cwd: root },
        );
        const result = spawnSync('bash', ['scripts/build', '--release', '--platform', 'windows/amd64'], {
            cwd: root,
            encoding: 'utf8',
            env: { ...process.env, PATH: `${join(root, 'bin')}:${process.env.PATH}` },
        });
        assert.equal(result.status, 0, result.stderr);
        const args = readFileSync(join(root, 'args'), 'utf8');
        assert.doesNotMatch(args, /-nsis/);
        assert.match(args, /-platform\nwindows\/amd64/);
        assert.match(args, /-webview2\nerror/);
        const local = spawnSync('bash', ['scripts/build', '--platform', 'windows/amd64'], {
            cwd: root,
            encoding: 'utf8',
            env: { ...process.env, PATH: `${join(root, 'bin')}:${process.env.PATH}` },
        });
        assert.equal(local.status, 0, local.stderr);
        assert.match(readFileSync(join(root, 'args'), 'utf8'), /-nsis/);
    } finally {
        rmSync(root, { recursive: true, force: true });
    }
});

void test('release setup installs the pinned build tools without verification tools', () => {
    const root = mkdtempSync(join(tmpdir(), 'release-setup-'));
    try {
        for (const dir of ['scripts/lib', 'bin', 'frontend']) mkdirSync(join(root, dir), { recursive: true });
        for (const file of ['scripts/build', 'scripts/lib/common.sh', 'scripts/lib/release_version.sh'])
            copyFileSync(join(repo, file), join(root, file));
        writeFileSync(join(root, 'go.mod'), 'require (\n github.com/wailsapp/wails/v2 v2.15.0\n)\n');
        writeFileSync(
            join(root, 'bin/go'),
            '#!/bin/sh\nif [ "$1" = env ]; then exit 0; fi\nprintf "%s\\n" "$*" >> "$TRACE"\n',
            { mode: 0o755 },
        );
        writeFileSync(join(root, 'bin/npm'), '#!/bin/sh\nprintf "npm %s\\n" "$*" >> "$TRACE"\n', { mode: 0o755 });
        const trace = join(root, 'trace');
        const result = spawnSync('bash', ['scripts/build', 'setup', '--release'], {
            cwd: root,
            encoding: 'utf8',
            env: { ...process.env, PATH: `${join(root, 'bin')}:${process.env.PATH}`, TRACE: trace },
        });
        assert.equal(result.status, 0, result.stderr);
        const commands = readFileSync(trace, 'utf8');
        assert.match(commands, /wails\/v2\/cmd\/wails@v2\.15\.0/);
        assert.doesNotMatch(commands, /golangci|shfmt|playwright/);
    } finally {
        rmSync(root, { recursive: true, force: true });
    }
});

void test('macOS prerelease uses numeric bundle versions', () => {
    const root = mkdtempSync(join(tmpdir(), 'release-plist-'));
    try {
        for (const dir of [
            'scripts/lib',
            'bin',
            'frontend/scripts',
            'frontend/wailsjs',
            'build/bin/GoMarkEdit.app/Contents',
        ])
            mkdirSync(join(root, dir), { recursive: true });
        for (const file of ['scripts/build', 'scripts/lib/common.sh', 'scripts/lib/release_version.sh'])
            copyFileSync(join(repo, file), join(root, file));
        writeFileSync(join(root, 'frontend/scripts/generate-editor-themes.mjs'), '');
        writeFileSync(join(root, 'build/bin/GoMarkEdit.app/Contents/Info.plist'), '');
        for (const command of ['go', 'npm', 'wails'])
            writeFileSync(join(root, 'bin', command), '#!/bin/sh\nexit 0\n', { mode: 0o755 });
        writeFileSync(join(root, 'bin/uname'), '#!/bin/sh\necho Darwin\n', { mode: 0o755 });
        writeFileSync(join(root, 'bin/plutil'), '#!/bin/sh\nprintf "%s\\n" "$*" >> "$TRACE"\n', { mode: 0o755 });
        spawnSync('git', ['init', '--quiet'], { cwd: root });
        spawnSync('git', ['add', '.'], { cwd: root });
        spawnSync(
            'git',
            [
                '-c',
                'user.name=Fixture',
                '-c',
                'user.email=fixture@example.invalid',
                'commit',
                '--quiet',
                '-m',
                'fixture',
            ],
            { cwd: root },
        );
        const trace = join(root, 'trace');
        const result = spawnSync('bash', ['scripts/build', '--release', '--version', '1.2.3-beta.1'], {
            cwd: root,
            encoding: 'utf8',
            env: { ...process.env, TRACE: trace, PATH: `${join(root, 'bin')}:${process.env.PATH}` },
        });
        assert.equal(result.status, 0, result.stderr);
        const values = readFileSync(trace, 'utf8');
        assert.match(values, /CFBundleShortVersionString -string 1\.2\.3 /);
        assert.match(values, /CFBundleVersion -string 1\.2\.3 /);
    } finally {
        rmSync(root, { recursive: true, force: true });
    }
});
