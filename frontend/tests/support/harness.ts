import { spawn, type ChildProcessByStdio } from 'node:child_process';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';
import type { Readable } from 'node:stream';

import { test as base, expect, type Page, type Request, type TestInfo } from '@playwright/test';

import { availableLocalPort, terminateOwnedProcess, waitForBackendStartup, waitForOwnedListener } from './e2eProcess';
import { preparedPaths, selectedRepository } from './prepare';
import { profileDirectory, seedRecents } from './profile';
import { isForeignRequest } from './requestGuard';

type AppProcess = ChildProcessByStdio<null, Readable, Readable>;

const STARTUP_TIMEOUT_MS = 30_000;
const PROCESS_WAIT_TIMEOUT_MS = 10_000;
const MAX_LOG_CHARACTERS = 16_000;

function sleep(milliseconds: number): Promise<void> {
    return new Promise((resolvePromise) => {
        globalThis.setTimeout(resolvePromise, milliseconds);
    });
}

function processIsAlive(pid: number): boolean {
    try {
        process.kill(pid, 0);
        return true;
    } catch {
        return false;
    }
}

function pathInside(directory: string, candidate: string): boolean {
    const relativePath = relative(directory, candidate);
    return relativePath === '' || (!relativePath.startsWith('..') && !isAbsolute(relativePath));
}

function childEnvironment(tempDirectory: string, frontendURL: string, port: number): NodeJS.ProcessEnv {
    const environment: NodeJS.ProcessEnv = {
        ...process.env,
        GOMARKEDIT_E2E_HEADLESS: '1',
        devserver: `127.0.0.1:${port}`,
        frontenddevserverurl: frontendURL,
    };
    if (process.platform === 'darwin') {
        environment.HOME = tempDirectory;
        delete environment.XDG_CONFIG_HOME;
    } else {
        environment.XDG_CONFIG_HOME = tempDirectory;
    }
    return environment;
}

export interface E2EAppHarness {
    readonly page: Page;
    readonly tempDirectory: string;
    readonly profileDirectory: string;
    readonly documentDirectory: string;
    readonly repositoryDirectory: string;
    readonly appChildPid: number | undefined;
    writeDocument(relativePath: string, contents: string): Promise<string>;
    seedRecents(items: readonly (string | { path: string; kind: 'file' | 'folder' })[]): Promise<void>;
    openWorkspace(folderPath: string): Promise<'opened' | 'unchanged'>;
    launch(): Promise<void>;
    relaunch(): Promise<void>;
    expectNoForeignRequests(): void;
    waitForAppExit(timeoutMilliseconds?: number): Promise<void>;
    teardown(): Promise<void>;
}

class PlaywrightE2EAppHarness implements E2EAppHarness {
    readonly page: Page;
    readonly tempDirectory: string;
    readonly profileDirectory: string;
    readonly documentDirectory: string;
    readonly repositoryDirectory: string;
    appChildPid: number | undefined;

    private devProcess: AppProcess | null = null;
    private devOutput = '';
    private port: number | undefined;
    private hasLaunched = false;
    private disposed = false;
    private readonly frontendOrigin: string;
    private backendOrigin: string | undefined;
    private readonly foreignRequests = new Map<Request, string>();

    private readonly observeRequest = (request: Request): void => {
        const url = request.url();
        if (
            isForeignRequest(url, this.frontendOrigin) &&
            (this.backendOrigin === undefined || isForeignRequest(url, this.backendOrigin))
        ) {
            this.foreignRequests.set(request, url);
        }
    };

    private readonly observeFailedRequest = (request: Request): void => {
        // The isolated diagram frame reports CSP refusals as request events before any network route is reached.
        if (request.failure()?.errorText === 'csp') this.foreignRequests.delete(request);
    };

    get capturedOutput(): string {
        return this.devOutput;
    }

    private constructor(page: Page, tempDirectory: string, documentDirectory: string, repositoryDirectory: string) {
        this.page = page;
        this.tempDirectory = tempDirectory;
        this.profileDirectory = profileDirectory(tempDirectory);
        this.documentDirectory = documentDirectory;
        this.repositoryDirectory = repositoryDirectory;
        this.frontendOrigin = new URL(preparedPaths().frontendURL).origin;
        this.page.on('request', this.observeRequest);
        this.page.on('requestfailed', this.observeFailedRequest);
    }

    static async create(page: Page): Promise<PlaywrightE2EAppHarness> {
        if (process.platform !== 'darwin' && process.platform !== 'linux') {
            throw new Error(`real-backend E2E harness is supported on macOS and Linux only (got ${process.platform})`);
        }
        const tempDirectory = await mkdtemp(join(tmpdir(), 'gomarkedit-e2e-'));
        const documentDirectory = await mkdtemp(join(tmpdir(), 'gomarkedit-e2e-docs-'));
        const repositoryDirectory = selectedRepository();
        return new PlaywrightE2EAppHarness(page, tempDirectory, documentDirectory, repositoryDirectory);
    }

    async writeDocument(relativePath: string, contents: string): Promise<string> {
        const target = resolve(this.documentDirectory, relativePath);
        if (!pathInside(this.documentDirectory, target)) {
            throw new Error(`document path escapes the temporary folder: ${relativePath}`);
        }
        await mkdir(dirname(target), { recursive: true });
        await writeFile(target, contents, 'utf8');
        return target;
    }

    async seedRecents(items: readonly (string | { path: string; kind: 'file' | 'folder' })[]): Promise<void> {
        await seedRecents(this.profileDirectory, items);
    }

    async openWorkspace(folderPath: string): Promise<'opened' | 'unchanged'> {
        const result = await this.page.evaluate(async (path): Promise<{ status?: string; code?: string }> => {
            const root = window as unknown as {
                go?: {
                    appmodel?: {
                        AppModelHandler?: {
                            OpenWorkspace?: (
                                request: { id: string },
                                folder: string,
                            ) => Promise<{ status?: string; code?: string }>;
                        };
                    };
                };
            };
            const binding = root.go?.appmodel?.AppModelHandler?.OpenWorkspace;
            if (binding === undefined) throw new Error('OpenWorkspace binding is unavailable');
            return binding({ id: crypto.randomUUID() }, path);
        }, folderPath);
        if (result.status !== 'opened' && result.status !== 'unchanged') {
            throw new Error(`OpenWorkspace failed: ${JSON.stringify(result)}`);
        }
        await this.page
            .getByRole('treeitem', { name: folderPath.split(/[\\/]/u).at(-1), exact: true })
            .first()
            .waitFor();
        return result.status;
    }

    async launch(): Promise<void> {
        const started = performance.now();
        if (this.disposed) throw new Error('cannot launch a disposed E2E harness');
        if (this.devProcess !== null) {
            throw new Error('the E2E harness is already running');
        }
        for (let attempt = 0; attempt < 3; attempt++) {
            if (this.port === undefined) this.port = await availableLocalPort();
            const origin = `http://127.0.0.1:${this.port}`;
            this.backendOrigin = origin;
            const child = spawn(preparedPaths().executable, [], {
                cwd: this.repositoryDirectory,
                detached: process.platform !== 'win32',
                env: childEnvironment(this.tempDirectory, preparedPaths().frontendURL, this.port),
                stdio: ['ignore', 'pipe', 'pipe'],
            });
            this.devProcess = child;
            this.devOutput = `${this.devOutput}\n[e2e] app pid=${child.pid ?? 'unknown'} port=${this.port}\n`.slice(
                -MAX_LOG_CHARACTERS,
            );
            const collectOutput = (chunk: Buffer): void => {
                this.devOutput = `${this.devOutput}${chunk.toString()}`.slice(-MAX_LOG_CHARACTERS);
            };
            child.stdout.on('data', collectOutput);
            child.stderr.on('data', collectOutput);
            child.on('error', (error) => collectOutput(Buffer.from(error.message)));

            try {
                await waitForOwnedListener(this.port, child, STARTUP_TIMEOUT_MS);
                await waitForBackendStartup(origin, child, STARTUP_TIMEOUT_MS);
                await this.waitForBrowserPage(origin);
                this.appChildPid = child.pid;
                this.hasLaunched = true;
                console.log(
                    `[e2e] launchMs=${Math.round(performance.now() - started)} appPid=${this.appChildPid ?? 'unknown'} port=${this.port} profile=${this.tempDirectory} documents=${this.documentDirectory}`,
                );
                return;
            } catch (error) {
                await this.stopDevProcess();
                if (
                    !this.hasLaunched &&
                    attempt < 2 &&
                    error instanceof Error &&
                    error.message.includes('owned by a different process')
                ) {
                    this.port = undefined;
                    continue;
                }
                throw new Error(`${String(error)}\nApplication output:\n${this.devOutput}`, { cause: error });
            }
        }
        throw new Error('could not allocate an unused local E2E application port');
    }

    async relaunch(): Promise<void> {
        const started = performance.now();
        await this.stopDevProcess();
        await this.launch();
        console.log(`[e2e] relaunchMs=${Math.round(performance.now() - started)}`);
    }

    expectNoForeignRequests(): void {
        expect([...this.foreignRequests.values()]).toEqual([]);
    }

    async waitForAppExit(timeoutMilliseconds = PROCESS_WAIT_TIMEOUT_MS): Promise<void> {
        const pid = this.appChildPid;
        if (pid === undefined) return;
        const deadline = Date.now() + timeoutMilliseconds;
        while (processIsAlive(pid) && Date.now() < deadline) {
            await sleep(100);
        }
        if (processIsAlive(pid)) {
            throw new Error(`application child PID ${pid} did not exit`);
        }
    }

    async teardown(): Promise<void> {
        const started = performance.now();
        if (this.disposed) return;
        this.disposed = true;
        this.page.off('request', this.observeRequest);
        this.page.off('requestfailed', this.observeFailedRequest);
        await this.stopDevProcess(true);
        if (process.env.KEEP_E2E_ARTEFACTS !== '1') {
            await Promise.all([
                rm(this.tempDirectory, { force: true, recursive: true }),
                rm(this.documentDirectory, { force: true, recursive: true }),
            ]);
        }
        console.log(`[e2e] teardownMs=${Math.round(performance.now() - started)}`);
    }

    private async waitForBrowserPage(origin: string): Promise<void> {
        const response = await fetch(origin, { signal: AbortSignal.timeout(3_000) });
        if (!response.ok) throw new Error(`application server returned HTTP ${response.status}`);
        await response.arrayBuffer();
        await this.page.goto(origin, { timeout: 10_000, waitUntil: 'domcontentloaded' });
        await this.page.waitForFunction(
            () => {
                const root = window as unknown as {
                    go?: { appmodel?: { AppModelHandler?: { GetState?: unknown } } };
                    runtime?: { Quit?: unknown };
                };
                return (
                    typeof root.go?.appmodel?.AppModelHandler?.GetState === 'function' &&
                    typeof root.runtime?.Quit === 'function'
                );
            },
            undefined,
            { timeout: 10_000 },
        );
        await this.page.evaluate(async () => {
            const root = window as unknown as {
                go: {
                    appmodel: {
                        AppModelHandler: {
                            GetState: (request: { id: string }) => Promise<{ data?: unknown; error?: unknown }>;
                        };
                    };
                };
            };
            let timer: ReturnType<typeof setTimeout> | undefined;
            let result: { data?: unknown; error?: unknown };
            try {
                result = await Promise.race([
                    root.go.appmodel.AppModelHandler.GetState({ id: crypto.randomUUID() }),
                    new Promise<never>((_, reject) => {
                        timer = setTimeout(() => reject(new Error('Wails IPC did not answer GetState')), 5_000);
                    }),
                ]);
            } finally {
                if (timer !== undefined) clearTimeout(timer);
            }
            if (result.data === undefined && result.error === undefined) {
                throw new Error('Wails IPC returned no application state or startup error');
            }
        });
    }

    private async stopDevProcess(force = false): Promise<void> {
        const child = this.devProcess;
        this.devProcess = null;
        this.appChildPid = undefined;
        await terminateOwnedProcess(child, force);
    }
}

type E2EFixtures = {
    app: E2EAppHarness;
};

export const test = base.extend<E2EFixtures>({
    app: async ({ page }, use, testInfo: TestInfo) => {
        testInfo.setTimeout(Math.max(testInfo.timeout, 180_000));
        const app = await PlaywrightE2EAppHarness.create(page);
        try {
            await use(app);
        } finally {
            try {
                if (testInfo.status !== testInfo.expectedStatus && app.capturedOutput.length > 0) {
                    await testInfo.attach('application-output', {
                        body: Buffer.from(app.capturedOutput),
                        contentType: 'text/plain',
                    });
                }
            } finally {
                await app.teardown();
            }
        }
    },
});

export { expect };
