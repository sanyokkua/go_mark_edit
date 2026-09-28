import { execFile } from 'node:child_process';
import type { ChildProcess } from 'node:child_process';
import { createServer } from 'node:net';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

function exited(child: ChildProcess): boolean {
    return child.exitCode !== null || child.signalCode !== null;
}

function delay(milliseconds: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

export async function availableLocalPort(): Promise<number> {
    const server = createServer();
    await new Promise<void>((resolve, reject) => {
        server.once('error', reject);
        server.listen(0, '127.0.0.1', resolve);
    });
    const address = server.address();
    if (address === null || typeof address === 'string') {
        server.close();
        throw new Error('could not allocate a local E2E port');
    }
    await new Promise<void>((resolve) => server.close(() => resolve()));
    return address.port;
}

export async function requireListenerInspector(): Promise<void> {
    try {
        await execFileAsync('lsof', ['-v']);
    } catch (error) {
        const failure = error as NodeJS.ErrnoException;
        if (failure.code === 'ENOENT') {
            throw new Error('real-backend E2E requires lsof to verify application port ownership', { cause: error });
        }
        throw error;
    }
}

async function listenerPids(port: number): Promise<number[]> {
    try {
        const { stdout } = await execFileAsync('lsof', ['-nP', '-a', `-iTCP:${port}`, '-sTCP:LISTEN', '-t']);
        return stdout.trim().split(/\s+/u).map(Number).filter(Number.isSafeInteger);
    } catch (error) {
        const failure = error as NodeJS.ErrnoException;
        if (String(failure.code) === '1') return [];
        throw error;
    }
}

export async function waitForOwnedListener(
    port: number,
    child: ChildProcess,
    timeoutMilliseconds: number,
): Promise<void> {
    if (child.pid === undefined) throw new Error('application process failed to spawn');
    const deadline = performance.now() + timeoutMilliseconds;
    let spawnError: Error | undefined;
    const onError = (error: Error): void => {
        spawnError = error;
    };
    child.on('error', onError);
    try {
        while (performance.now() < deadline) {
            if (spawnError !== undefined) throw new Error(`application process failed to spawn: ${spawnError.message}`);
            if (exited(child)) {
                throw new Error(`application process ${child.pid} exited before listening on port ${port}`);
            }
            const owners = await listenerPids(port);
            if (owners.length > 0) {
                if (owners.length !== 1 || owners[0] !== child.pid) {
                    throw new Error(
                        `port ${port} is owned by a different process (expected ${child.pid}, found ${owners.join(', ')})`,
                    );
                }
                return;
            }
            await delay(Math.min(100, Math.max(1, deadline - performance.now())));
        }
        throw new Error(`timed out waiting for application process ${child.pid} to own port ${port}`);
    } finally {
        child.off('error', onError);
    }
}

interface BridgeResult {
    data?: unknown;
    error?: { details?: { startupStep?: string } };
}

// Wails 2.15.0 dev IPC uses the C/c callback protocol in
// internal/frontend/runtime/desktop/calls.js and internal/frontend/devserver/devserver.go.
async function bridgeCall(socket: WebSocket, name: string, timeoutMilliseconds: number): Promise<BridgeResult> {
    const callbackID = crypto.randomUUID();
    return new Promise<BridgeResult>((resolve, reject) => {
        const finish = (): void => {
            clearTimeout(timer);
            socket.removeEventListener('message', onMessage);
            socket.removeEventListener('close', onClose);
        };
        const onMessage = (event: MessageEvent): void => {
            if (typeof event.data !== 'string' || !event.data.startsWith('c')) return;
            const reply = JSON.parse(event.data.slice(1)) as {
                callbackid?: string;
                result?: BridgeResult;
                error?: unknown;
            };
            if (reply.callbackid !== callbackID) return;
            finish();
            if (reply.error != null) reject(new Error(`Wails ${name} failed: ${JSON.stringify(reply.error)}`));
            else resolve(reply.result ?? {});
        };
        const onClose = (): void => {
            finish();
            reject(new Error(`Wails IPC closed during ${name}`));
        };
        const timer = setTimeout(() => {
            finish();
            reject(new Error(`Wails ${name} did not answer within ${timeoutMilliseconds}ms`));
        }, timeoutMilliseconds);
        socket.addEventListener('message', onMessage);
        socket.addEventListener('close', onClose);
        socket.send(`C${JSON.stringify({ name, args: [{ id: crypto.randomUUID() }], callbackID })}`);
    });
}

export async function waitForBackendStartup(
    origin: string,
    child: ChildProcess,
    timeoutMilliseconds: number,
): Promise<void> {
    const socket = new WebSocket(`${origin.replace(/^http/u, 'ws')}/wails/ipc`);
    const deadline = performance.now() + timeoutMilliseconds;
    try {
        await new Promise<void>((resolve, reject) => {
            const finish = (): void => {
                clearTimeout(timer);
                socket.removeEventListener('open', onOpen);
                socket.removeEventListener('error', onError);
            };
            const onOpen = (): void => {
                finish();
                resolve();
            };
            const onError = (): void => {
                finish();
                reject(new Error('Wails IPC websocket could not connect'));
            };
            const timer = setTimeout(
                () => {
                    finish();
                    reject(new Error('Wails IPC websocket did not connect'));
                },
                Math.min(5_000, timeoutMilliseconds),
            );
            socket.addEventListener('open', onOpen);
            socket.addEventListener('error', onError);
        });
        while (performance.now() < deadline) {
            if (exited(child))
                throw new Error(`application process ${child.pid ?? 'unknown'} exited before backend startup`);
            const remaining = Math.max(1, Math.min(3_000, deadline - performance.now()));
            const state = await bridgeCall(socket, 'appmodel.AppModelHandler.GetState', remaining);
            if (state.error?.details?.startupStep === 'settings') return;
            if (state.data !== undefined) {
                const settings = await bridgeCall(socket, 'settings.SettingsHandler.GetSettings', remaining);
                if (settings.data !== undefined) return;
            }
            await delay(100);
        }
        throw new Error('timed out waiting for real backend startup before frontend navigation');
    } finally {
        socket.close();
    }
}

async function waitForClose(child: ChildProcess, timeoutMilliseconds: number): Promise<boolean> {
    if (
        exited(child) &&
        (child.stdout === null || child.stdout.destroyed) &&
        (child.stderr === null || child.stderr.destroyed)
    )
        return true;
    return new Promise<boolean>((resolve) => {
        const timer = setTimeout(() => {
            child.off('close', onClose);
            resolve(false);
        }, timeoutMilliseconds);
        const onClose = (): void => {
            clearTimeout(timer);
            resolve(true);
        };
        child.once('close', onClose);
    });
}

function signalOwnedProcess(child: ChildProcess, signal: NodeJS.Signals): void {
    if (child.pid === undefined) return;
    try {
        if (process.platform !== 'win32') process.kill(-child.pid, signal);
        else if (!exited(child)) child.kill(signal);
    } catch {
        // Native quit or a prior signal may have already closed the child.
    }
}

function processGroupIsAlive(pid: number): boolean {
    try {
        process.kill(-pid, 0);
        return true;
    } catch {
        return false;
    }
}

async function waitForGroupExit(pid: number, timeoutMilliseconds: number): Promise<boolean> {
    const deadline = performance.now() + timeoutMilliseconds;
    while (processGroupIsAlive(pid) && performance.now() < deadline) await delay(50);
    return !processGroupIsAlive(pid);
}

export async function terminateOwnedProcess(child: ChildProcess | null, force = false): Promise<void> {
    if (child === null || child.pid === undefined) return;
    if (process.platform === 'win32') {
        try {
            await execFileAsync('taskkill', ['/T', '/F', '/PID', String(child.pid)]);
        } catch {
            // The owned process may already have exited.
        }
    } else {
        signalOwnedProcess(child, force ? 'SIGKILL' : 'SIGTERM');
    }
    const [closed, groupExited] = await Promise.all([
        waitForClose(child, 3_000),
        process.platform === 'win32' ? Promise.resolve(true) : waitForGroupExit(child.pid, 3_000),
    ]);
    if (closed && groupExited) return;
    if (force) throw new Error(`application process group ${child.pid} did not close after SIGKILL`);
    signalOwnedProcess(child, 'SIGKILL');
    const [closedAfterKill, groupExitedAfterKill] = await Promise.all([
        waitForClose(child, 3_000),
        process.platform === 'win32' ? Promise.resolve(true) : waitForGroupExit(child.pid, 3_000),
    ]);
    if (!closedAfterKill || !groupExitedAfterKill) {
        throw new Error(`application process group ${child.pid} did not close after SIGKILL`);
    }
}
