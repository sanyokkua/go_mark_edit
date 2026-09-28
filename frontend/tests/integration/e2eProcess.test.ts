/** @jest-environment node */
import { execFileSync, spawn } from 'node:child_process';
import { createServer } from 'node:net';

import { terminateOwnedProcess, waitForOwnedListener } from '../support/e2eProcess';

async function availablePort(): Promise<number> {
    const server = createServer();
    await new Promise<void>((resolve, reject) => {
        server.once('error', reject);
        server.listen(0, '127.0.0.1', resolve);
    });
    const address = server.address();
    if (address === null || typeof address === 'string') throw new Error('no TCP port allocated');
    await new Promise<void>((resolve) => server.close(() => resolve()));
    return address.port;
}

async function waitForPidDisappearance(pid: number): Promise<void> {
    const deadline = performance.now() + 1_000;
    while (true) {
        try {
            process.kill(pid, 0);
        } catch (error: unknown) {
            if ((error as NodeJS.ErrnoException).code === 'ESRCH') return;
            throw error;
        }
        if (performance.now() >= deadline) {
            let diagnostic: string;
            try {
                diagnostic = execFileSync('ps', ['-p', String(pid), '-o', 'pid,pgid,stat,command'], {
                    encoding: 'utf8',
                    timeout: 1_000,
                });
            } catch (error: unknown) {
                diagnostic = error instanceof Error ? error.message : String(error);
            }
            throw new Error(`Owned descendant PID ${pid} remained observable after 1000ms.\n${diagnostic}`);
        }
        await new Promise<void>((resolve) => setTimeout(resolve, 25));
    }
}

describe('E2E application process', () => {
    test('rejects a responding server owned by a different process', async () => {
        const port = await availablePort();
        const foreign = spawn(
            process.execPath,
            [
                '-e',
                `require('node:http').createServer((_, response) => response.end('foreign')).listen(${port}, '127.0.0.1')`,
            ],
            {
                detached: process.platform !== 'win32',
                stdio: ['ignore', 'pipe', 'pipe'],
            },
        );
        const child = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], {
            detached: process.platform !== 'win32',
            stdio: ['ignore', 'pipe', 'pipe'],
        });
        try {
            await expect(waitForOwnedListener(port, child, 3_000)).rejects.toThrow('owned by a different process');
        } finally {
            await terminateOwnedProcess(child);
            await terminateOwnedProcess(foreign);
        }
        expect(child.exitCode !== null || child.signalCode !== null).toBe(true);
    });

    test('accepts only the spawned child as listener', async () => {
        const port = await availablePort();
        const child = spawn(
            process.execPath,
            [
                '-e',
                `require('node:http').createServer((_, response) => response.end('owned')).listen(${port}, '127.0.0.1')`,
            ],
            {
                detached: process.platform !== 'win32',
                stdio: ['ignore', 'pipe', 'pipe'],
            },
        );
        try {
            await expect(waitForOwnedListener(port, child, 3_000)).resolves.toBeUndefined();
        } finally {
            await terminateOwnedProcess(child);
        }
    });

    test('terminates a real detached child and closes its streams', async () => {
        const child = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], {
            detached: process.platform !== 'win32',
            stdio: ['ignore', 'pipe', 'pipe'],
        });
        await terminateOwnedProcess(child);
        expect(child.exitCode !== null || child.signalCode !== null).toBe(true);
    });

    test('terminates an inherited-stdio descendant after its parent exits', async () => {
        const parent = spawn(
            process.execPath,
            [
                '-e',
                `const {spawn}=require('node:child_process');const child=spawn(process.execPath,['-e','setInterval(() => {}, 1000)'],{stdio:'inherit'});console.log(child.pid);process.exit(0)`,
            ],
            {
                detached: process.platform !== 'win32',
                stdio: ['ignore', 'pipe', 'pipe'],
            },
        );
        const descendantPid = await new Promise<number>((resolve, reject) => {
            parent.stdout?.once('data', (chunk: Buffer) => resolve(Number(chunk.toString().trim())));
            parent.once('error', reject);
        });
        await new Promise<void>((resolve) => parent.once('exit', () => resolve()));
        await terminateOwnedProcess(parent);
        expect(parent.stdout?.destroyed).toBe(true);
        await waitForPidDisappearance(descendantPid);
        expect(() => process.kill(descendantPid, 0)).toThrow();
    });

    test('escalates to stop a silent descendant that ignores SIGTERM', async () => {
        const parent = spawn(
            process.execPath,
            [
                '-e',
                `const {spawn}=require('node:child_process');const child=spawn(process.execPath,['-e',"process.on('SIGTERM',()=>{});setInterval(() => {}, 1000)"],{stdio:'ignore'});console.log(child.pid);setTimeout(()=>process.exit(0),400)`,
            ],
            {
                detached: process.platform !== 'win32',
                stdio: ['ignore', 'pipe', 'pipe'],
            },
        );
        const descendantPid = await new Promise<number>((resolve, reject) => {
            parent.stdout?.once('data', (chunk: Buffer) => resolve(Number(chunk.toString().trim())));
            parent.once('error', reject);
        });
        await new Promise<void>((resolve) => parent.once('exit', () => resolve()));
        try {
            await terminateOwnedProcess(parent);
            await waitForPidDisappearance(descendantPid);
            expect(() => process.kill(descendantPid, 0)).toThrow();
        } finally {
            if (parent.pid !== undefined) {
                try {
                    process.kill(-parent.pid, 'SIGKILL');
                } catch {
                    /* the group is already gone */
                }
            }
        }
    }, 10_000);

    test('forced final disposal skips a vetoed graceful quit', async () => {
        const child = spawn(
            process.execPath,
            ['-e', "process.on('SIGTERM',()=>{});process.stdout.write('ready\\n');setInterval(() => {}, 1000)"],
            {
                detached: process.platform !== 'win32',
                stdio: ['ignore', 'pipe', 'pipe'],
            },
        );
        await new Promise<void>((resolve, reject) => {
            child.stdout?.once('data', () => resolve());
            child.once('error', reject);
        });
        const started = performance.now();
        try {
            await terminateOwnedProcess(child, true);
            expect(performance.now() - started).toBeLessThan(1_200);
            expect(child.signalCode).toBe('SIGKILL');
        } finally {
            if (child.pid !== undefined) {
                try {
                    process.kill(-child.pid, 'SIGKILL');
                } catch {
                    // The owned process group is already gone.
                }
            }
        }
    }, 10_000);
});
