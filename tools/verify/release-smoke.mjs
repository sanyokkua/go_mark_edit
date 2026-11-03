#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { spawn, spawnSync } from 'node:child_process';
import {
    accessSync,
    constants,
    existsSync,
    lstatSync,
    mkdirSync,
    mkdtempSync,
    readFileSync,
    readdirSync,
    readlinkSync,
    realpathSync,
    writeFileSync,
} from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { performance } from 'node:perf_hooks';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const delay = (ms) => new Promise((done) => setTimeout(done, ms));

function entryKind(stat) {
    if (stat.isDirectory()) return 'd';
    if (stat.isFile()) return 'f';
    if (stat.isSymbolicLink()) return 'l';
    return '';
}

function compareNames(a, b) {
    if (a === b) return 0;
    if (a < b) return -1;
    return 1;
}

export function bundleFingerprint(bundle) {
    const hash = createHash('sha256');
    function add(path, relative) {
        const stat = lstatSync(path);
        const kind = entryKind(stat);
        if (!kind) throw new Error(`unsupported bundle entry: ${relative}`);
        const field = (value) => {
            const bytes = Buffer.from(value);
            hash.update(`${bytes.length}:`);
            hash.update(bytes);
        };
        field(relative);
        field(kind);
        field(String(stat.mode & 0o7777));
        if (kind === 'f') field(readFileSync(path));
        if (kind === 'l') field(readlinkSync(path));
        if (kind === 'd')
            for (const name of readdirSync(path).sort(compareNames))
                add(join(path, name), relative ? `${relative}/${name}` : name);
    }
    add(bundle, '');
    return hash.digest('hex');
}

export function validateBundleMetadata(bundle, metadata, version) {
    if (metadata.CFBundleVersion !== version || metadata.CFBundleShortVersionString !== version)
        throw new Error('bundle version does not match requested version');
    const name = metadata.CFBundleExecutable;
    if (
        typeof name !== 'string' ||
        !name ||
        name === '.' ||
        name === '..' ||
        basename(name) !== name ||
        name.includes('\\')
    )
        throw new Error('invalid bundle executable name');
    const executable = join(bundle, 'Contents', 'MacOS', name);
    accessSync(executable, constants.X_OK);
    if (!lstatSync(executable).isFile()) throw new Error('bundle executable must be a regular file');
    return executable;
}

export function inspectReleaseLog(path) {
    if (!existsSync(path)) return;
    const lines = readFileSync(path, 'utf8')
        .split('\n')
        .filter((line) => line.trim());
    for (const line of lines) {
        let record;
        try {
            record = JSON.parse(line);
        } catch {
            throw new Error('malformed startup log');
        }
        if (!record || typeof record !== 'object' || typeof record.level !== 'string')
            throw new Error('malformed startup log record');
        if (['error', 'fatal', 'panic'].includes(record.level.toLowerCase()))
            throw new Error(`startup error: ${String(record.message ?? '').slice(0, 400)}`);
    }
}

function command(file, args, timeout = 30000) {
    const result = spawnSync(file, args, {
        encoding: 'utf8',
        maxBuffer: 4 * 1024 * 1024,
        timeout,
        killSignal: 'SIGKILL',
    });
    if (result.error || result.status !== 0)
        throw new Error(`${file} failed: ${(result.stderr || result.error?.message || '').slice(0, 1200)}`);
    return result.stdout.trim();
}

function temporaryRun() {
    const root = join(repoRoot, '.local_tmp_files');
    return mkdtempSync(join(root, 'release-smoke-'));
}

async function waitForExit(hasExited, attempts) {
    for (let count = 0; count < attempts; count++) {
        if (hasExited()) return;
        await delay(100);
    }
}

export async function observeReleaseProcess({ executable, args = [], env, observer, log, run, deadlineMs = 11000 }) {
    let output = '';
    const start = performance.now();
    const child = spawn(executable, args, { env, stdio: ['ignore', 'pipe', 'pipe'] });
    child.stdout.on('data', (chunk) => {
        output = (output + chunk).slice(-8192);
    });
    child.stderr.on('data', (chunk) => {
        output = (output + chunk).slice(-8192);
    });
    let exit = null;
    let spawnError = null;
    child.on('error', (error) => {
        spawnError = error;
    });
    child.on('exit', (code, signal) => {
        exit = { code, signal };
    });
    let elapsed;
    try {
        if (!child.pid) throw new Error('could not spawn release executable');
        let visible = false;
        while (performance.now() - start < deadlineMs) {
            if (spawnError) throw new Error(`release spawn failed: ${spawnError.message}`);
            if (exit) throw new Error(`release exited early: ${JSON.stringify(exit)} ${output}`);
            inspectReleaseLog(log);
            const remaining = Math.max(1, Math.floor(deadlineMs - (performance.now() - start)));
            visible = command(observer, [String(child.pid)], remaining) === 'visible';
            if (visible) break;
            await delay(100);
        }
        elapsed = performance.now() - start;
        if (!visible) throw new Error(`release window not observed within ${deadlineMs} ms: ${output}`);
        await delay(500);
        if (exit || command(observer, [String(child.pid)], 1000) !== 'visible')
            throw new Error('release window did not remain visible');
        inspectReleaseLog(log);
    } finally {
        if (!exit) child.kill('SIGTERM');
        await waitForExit(() => exit !== null, 30);
        if (!exit) {
            child.kill('SIGKILL');
            await waitForExit(() => exit !== null, 20);
        }
        writeFileSync(join(run, 'process.log'), output);
    }
    if (!exit) throw new Error('owned release process did not exit');
    inspectReleaseLog(log);
    return { pid: child.pid, elapsedMs: elapsed };
}

export async function runSmoke({ bundle, version, receipt, profile }) {
    if (process.platform !== 'darwin') throw new Error('release smoke requires macOS');
    command('/bin/bash', [
        '-c',
        'source "$1"; parse_release_version "$2"',
        'release-version',
        join(repoRoot, 'scripts/lib/release_version.sh'),
        version,
    ]);
    const app = realpathSync(bundle);
    const metadata = JSON.parse(
        command('/usr/bin/plutil', ['-convert', 'json', '-o', '-', join(app, 'Contents', 'Info.plist')]),
    );
    const executable = validateBundleMetadata(app, metadata, version);
    const archs = command('/usr/bin/lipo', ['-archs', executable]).split(/\s+/);
    if (!archs.includes('arm64')) throw new Error('release executable lacks arm64 architecture');
    const before = bundleFingerprint(app);
    const run = temporaryRun();
    const observer = join(run, 'window-observer');
    command(
        '/usr/bin/xcrun',
        ['swiftc', join(repoRoot, 'tools/verify/macos-window-observer.swift'), '-o', observer],
        120000,
    );
    const childProfile = profile ? resolve(profile) : join(run, 'profile');
    mkdirSync(childProfile, { recursive: true });
    const env = { ...process.env, HOME: childProfile };
    delete env.GOMARKEDIT_E2E_HEADLESS;
    delete env.devserver;
    delete env.frontenddevserverurl;
    const log = join(childProfile, 'Library/Application Support/GoMarkEdit/logs/gomarkedit.log');
    const observation = await observeReleaseProcess({ executable, env, observer, log, run });
    if (bundleFingerprint(app) !== before) throw new Error('release bundle changed during smoke');
    writeFileSync(
        receipt,
        `${JSON.stringify({ version, bundle: app, fingerprint: before, architecture: archs, ...observation, window: 'visible', run }, null, 2)}\n`,
        { flag: 'wx' },
    );
}

export function checkPackage(zip, receiptPath) {
    const receipt = JSON.parse(readFileSync(receiptPath, 'utf8'));
    if (
        !receipt ||
        !/^[a-f0-9]{64}$/.test(receipt.fingerprint) ||
        typeof receipt.bundle !== 'string' ||
        receipt.window !== 'visible'
    )
        throw new Error('invalid smoke receipt');
    const extracted = temporaryRun();
    command('/usr/bin/ditto', ['-x', '-k', resolve(zip), extracted]);
    const entries = readdirSync(extracted);
    if (entries.length !== 1 || entries[0] !== basename(receipt.bundle))
        throw new Error('package must contain the verified app only');
    const app = join(extracted, entries[0]);
    if (!lstatSync(app).isDirectory() || bundleFingerprint(app) !== receipt.fingerprint)
        throw new Error('packaged bundle differs from verified bundle');
}

export async function checkStartupFailure(bundle, version) {
    const root = temporaryRun();
    const profile = join(root, 'profile');
    const receipt = join(root, 'receipt.json');
    mkdirSync(join(profile, 'Library/Application Support/GoMarkEdit/settings.db'), { recursive: true });
    try {
        await runSmoke({ bundle, version, receipt, profile });
    } catch (error) {
        if (!String(error.message).startsWith('startup error:') || existsSync(receipt)) throw error;
        return;
    }
    throw new Error('release smoke accepted an app with a failed settings database');
}

async function main(args) {
    if (args[0] === '--check-package' && args.length === 4 && args[2] === '--receipt')
        return checkPackage(args[1], args[3]);
    if (args[0] === '--check-startup-failure' && args.length === 4 && args[2] === '--version')
        return checkStartupFailure(args[1], args[3]);
    if (args.length !== 6 || args[0] !== '--bundle' || args[2] !== '--version' || args[4] !== '--receipt')
        throw new Error(
            'usage: release-smoke.mjs --bundle APP --version VERSION --receipt FILE | --check-package ZIP --receipt FILE',
        );
    await runSmoke({ bundle: args[1], version: args[3], receipt: resolve(args[5]) });
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    try {
        await main(process.argv.slice(2));
    } catch (error) {
        console.error(error.message);
        process.exitCode = 1;
    }
}
