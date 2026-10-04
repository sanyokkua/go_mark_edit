import { spawn, type ChildProcess } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { isAbsolute, join, resolve } from 'node:path';

import {
    availableLocalPort,
    requireListenerInspector,
    terminateOwnedProcess,
    waitForOwnedListener,
} from './e2eProcess';

const RUN_DIRECTORY_ENV = 'GOMARKEDIT_E2E_RUN_DIR';
const REPOSITORY_ENV = 'GOMARKEDIT_E2E_REPO';
const FRONTEND_URL_ENV = 'GOMARKEDIT_E2E_FRONTEND_URL';
const PRODUCTION_FRONTEND_URL_ENV = 'GOMARKEDIT_E2E_PRODUCTION_FRONTEND_URL';
const defaultRepository = existsSync(join(process.cwd(), 'main.go')) ? process.cwd() : resolve(process.cwd(), '..');

export interface PreparedPaths {
    readonly runDirectory: string;
    readonly executable: string;
    readonly seedExecutable: string;
    readonly frontendURL: string;
    readonly productionFrontendURL: string;
}

export function preparedPaths(): PreparedPaths {
    const runDirectory = process.env[RUN_DIRECTORY_ENV];
    if (runDirectory === undefined || runDirectory.length === 0) {
        throw new Error(`${RUN_DIRECTORY_ENV} is absent; Playwright global setup has not prepared the E2E application`);
    }
    if (!isAbsolute(runDirectory)) throw new Error(`${RUN_DIRECTORY_ENV} must be an absolute path`);
    const frontendURL = process.env[FRONTEND_URL_ENV];
    if (frontendURL === undefined || frontendURL.length === 0) {
        throw new Error(`${FRONTEND_URL_ENV} is absent; Playwright global setup has not started the frontend server`);
    }
    const productionFrontendURL = process.env[PRODUCTION_FRONTEND_URL_ENV];
    if (productionFrontendURL === undefined || productionFrontendURL.length === 0) {
        throw new Error(
            `${PRODUCTION_FRONTEND_URL_ENV} is absent; Playwright global setup has not started the production frontend server`,
        );
    }
    return {
        runDirectory,
        executable: join(runDirectory, 'GoMarkEdit'),
        seedExecutable: join(runDirectory, 'e2e-seed'),
        frontendURL,
        productionFrontendURL,
    };
}

export function selectedRepository(): string {
    const published = process.env[REPOSITORY_ENV];
    if (published !== undefined && published.length > 0) return published;
    const configured = process.env.E2E_REPO;
    return configured === undefined || configured.length === 0
        ? defaultRepository
        : resolve(defaultRepository, configured);
}

async function run(
    command: string,
    args: string[],
    cwd: string,
    signal: AbortSignal,
    environment = process.env,
): Promise<void> {
    try {
        if (signal.aborted) throw new Error('E2E preparation interrupted');
        await new Promise<void>((resolve, reject) => {
            const child = spawn(command, args, {
                cwd,
                env: environment,
                detached: true,
                stdio: ['ignore', 'pipe', 'pipe'],
            });
            let output = '';
            let spawnError: Error | undefined;
            const collectOutput = (chunk: Buffer): void => {
                output = `${output}${chunk.toString()}`.slice(-4_000);
            };
            child.stdout?.on('data', collectOutput);
            child.stderr?.on('data', collectOutput);
            child.on('error', (error) => {
                spawnError = error;
            });
            const onAbort = (): void => {
                if (child.pid === undefined) return;
                try {
                    process.kill(-child.pid, 'SIGKILL');
                } catch {
                    // The owned build process group may already have exited.
                }
            };
            signal.addEventListener('abort', onAbort, { once: true });
            if (signal.aborted) onAbort();
            child.once('close', (code, childSignal) => {
                signal.removeEventListener('abort', onAbort);
                if (signal.aborted) reject(new Error('E2E preparation interrupted'));
                else if (spawnError !== undefined) reject(spawnError);
                else if (code !== 0) {
                    reject(new Error(`exit=${String(code)} signal=${String(childSignal)}\n${output}`));
                } else resolve();
            });
        });
    } catch (error) {
        throw new Error(`${command} ${args.join(' ')} failed: ${String(error)}`, { cause: error });
    }
}

function generatedStateRestorer(repository: string): () => void {
    const placeholderPath = join(repository, 'frontend', 'dist', '.gitkeep');
    const placeholder = existsSync(placeholderPath) ? readFileSync(placeholderPath) : null;
    const modes: { path: string; mode: number }[] = [];
    const collectModes = (directory: string): void => {
        for (const entry of readdirSync(directory, { withFileTypes: true })) {
            const path = join(directory, entry.name);
            if (entry.isDirectory()) collectModes(path);
            else if (entry.isFile()) modes.push({ path, mode: statSync(path).mode & 0o777 });
        }
    };
    const bindingsDirectory = join(repository, 'frontend', 'wailsjs');
    if (existsSync(bindingsDirectory)) collectModes(bindingsDirectory);
    return () => {
        if (placeholder === null) rmSync(placeholderPath, { force: true });
        else {
            mkdirSync(join(repository, 'frontend', 'dist'), { recursive: true });
            writeFileSync(placeholderPath, placeholder);
        }
        for (const entry of modes) {
            try {
                chmodSync(entry.path, entry.mode);
            } catch (error) {
                if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
            }
        }
    };
}

export default async function prepare(): Promise<() => Promise<void>> {
    if (process.platform !== 'darwin' && process.platform !== 'linux') {
        throw new Error(`real-backend E2E preparation supports macOS and Linux only (got ${process.platform})`);
    }
    const started = performance.now();
    const interruption = new AbortController();
    const frontendProcesses: ChildProcess[] = [];
    const repository = selectedRepository();
    let restoreGeneratedState: (() => void) | undefined;
    let runDirectory: string | undefined;
    const onInterrupt = (): void => {
        interruption.abort();
        for (const frontendProcess of frontendProcesses) {
            if (frontendProcess.pid !== undefined) {
                try {
                    process.kill(-frontendProcess.pid, 'SIGKILL');
                } catch {
                    // The owned frontend group may already have exited.
                }
            }
        }
        // Playwright can exit before its interrupted global setup promise settles.
        // Finish the owned state cleanup synchronously in the signal callback.
        try {
            restoreGeneratedState?.();
        } finally {
            if (runDirectory !== undefined) rmSync(runDirectory, { recursive: true, force: true });
        }
    };
    process.on('SIGINT', onInterrupt);
    process.on('SIGTERM', onInterrupt);
    try {
        await requireListenerInspector();
        restoreGeneratedState = generatedStateRestorer(repository);
        const runsDirectory = join(repository, '.local_tmp_files');
        await mkdir(runsDirectory, { recursive: true });
        runDirectory = await mkdtemp(join(runsDirectory, 'e2e-run-'));
        const paths = {
            executable: join(runDirectory, 'GoMarkEdit'),
            seedExecutable: join(runDirectory, 'e2e-seed'),
        };
        await run(process.env.WAILS_BIN ?? 'wails', ['generate', 'module'], repository, interruption.signal);
        await run(
            process.execPath,
            ['scripts/generate-editor-themes.mjs'],
            join(repository, 'frontend'),
            interruption.signal,
        );
        await run(process.env.NPM_BIN ?? 'npm', ['run', 'build'], join(repository, 'frontend'), interruption.signal);
        restoreGeneratedState();

        const goEnvironment: NodeJS.ProcessEnv = { ...process.env, CGO_ENABLED: '1' };
        const tags = ['dev', 'devtools'];
        if (process.platform === 'darwin') {
            goEnvironment.CGO_CFLAGS = `${goEnvironment.CGO_CFLAGS ?? ''} -mmacosx-version-min=10.13`.trim();
            goEnvironment.CGO_LDFLAGS =
                `${goEnvironment.CGO_LDFLAGS ?? ''} -framework UniformTypeIdentifiers -mmacosx-version-min=10.13`.trim();
        } else {
            tags.push('webkit2_41');
        }
        await run(
            process.env.GO_BIN ?? 'go',
            ['build', '-buildvcs=false', '-gcflags', 'all=-N -l', '-tags', tags.join(','), '-o', paths.executable, '.'],
            repository,
            interruption.signal,
            goEnvironment,
        );
        await run(
            process.env.GO_BIN ?? 'go',
            ['build', '-o', paths.seedExecutable, './tools/e2e-seed'],
            repository,
            interruption.signal,
        );
        const startFrontend = async (assets: 'development' | 'production'): Promise<string> => {
            interruption.signal.throwIfAborted();
            const frontendPort = await availableLocalPort();
            interruption.signal.throwIfAborted();
            const frontendURL = `http://127.0.0.1:${frontendPort}`;
            const viteArgs = [
                join(repository, 'frontend', 'node_modules', 'vite', 'bin', 'vite.js'),
                ...(assets === 'production' ? ['preview'] : []),
                '--config',
                join(defaultRepository, 'frontend', 'tests', 'support', 'e2eVite.config.ts'),
                '--mode',
                'wails',
                '--host',
                '127.0.0.1',
                '--port',
                String(frontendPort),
                '--strictPort',
            ];
            const frontendProcess = spawn(process.execPath, viteArgs, {
                cwd: join(repository, 'frontend'),
                detached: true,
                env: { ...process.env, [REPOSITORY_ENV]: repository },
                stdio: ['ignore', 'pipe', 'pipe'],
            });
            frontendProcesses.push(frontendProcess);
            let frontendOutput = '';
            const collectOutput = (chunk: Buffer): void => {
                frontendOutput = `${frontendOutput}${chunk.toString()}`.slice(-4_000);
            };
            frontendProcess.stdout?.on('data', collectOutput);
            frontendProcess.stderr?.on('data', collectOutput);
            frontendProcess.on('error', (error) => collectOutput(Buffer.from(error.message)));
            try {
                await waitForOwnedListener(frontendPort, frontendProcess, 20_000);
                const response = await fetch(frontendURL, {
                    signal: AbortSignal.any([AbortSignal.timeout(3_000), interruption.signal]),
                });
                if (!response.ok) throw new Error(`frontend server returned HTTP ${response.status}`);
                await response.arrayBuffer();
                interruption.signal.throwIfAborted();
            } catch (error) {
                throw new Error(
                    `${assets} E2E frontend server did not become ready: ${String(error)}\n${frontendOutput}`,
                    {
                        cause: error,
                    },
                );
            }
            return frontendURL;
        };
        const frontendURL = await startFrontend('development');
        const productionFrontendURL = await startFrontend('production');
        process.env[RUN_DIRECTORY_ENV] = runDirectory;
        process.env[REPOSITORY_ENV] = repository;
        process.env[FRONTEND_URL_ENV] = frontendURL;
        process.env[PRODUCTION_FRONTEND_URL_ENV] = productionFrontendURL;
        console.log(
            `[e2e] prepareMs=${Math.round(performance.now() - started)} run=${runDirectory} devPid=${frontendProcesses[0]?.pid ?? 'unknown'} productionPid=${frontendProcesses[1]?.pid ?? 'unknown'}`,
        );
    } catch (error) {
        try {
            await Promise.all(
                frontendProcesses.map((child) => terminateOwnedProcess(child, interruption.signal.aborted)),
            );
        } finally {
            try {
                restoreGeneratedState?.();
            } finally {
                if (runDirectory !== undefined) await rm(runDirectory, { recursive: true, force: true });
            }
        }
        throw error;
    } finally {
        process.off('SIGINT', onInterrupt);
        process.off('SIGTERM', onInterrupt);
    }
    if (runDirectory === undefined || restoreGeneratedState === undefined)
        throw new Error('E2E preparation incomplete');
    return async () => {
        try {
            await Promise.all(frontendProcesses.map((child) => terminateOwnedProcess(child)));
        } finally {
            try {
                restoreGeneratedState();
                if (process.env.KEEP_E2E_ARTEFACTS !== '1') await rm(runDirectory, { recursive: true, force: true });
            } finally {
                delete process.env[RUN_DIRECTORY_ENV];
                delete process.env[REPOSITORY_ENV];
                delete process.env[FRONTEND_URL_ENV];
                delete process.env[PRODUCTION_FRONTEND_URL_ENV];
            }
        }
    };
}
