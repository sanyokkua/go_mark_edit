import {
  execFile as execFileCallback,
  execFileSync,
  spawn,
  type ChildProcessByStdio,
} from 'node:child_process';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Readable } from 'node:stream';
import { promisify } from 'node:util';

import {
  test as base,
  expect,
  type Page,
  type TestInfo,
} from '@playwright/test';

import { profileDirectory, seedRecents } from './profile';

const execFile = promisify(execFileCallback);
type WailsProcess = ChildProcessByStdio<null, Readable, Readable>;

const DEV_SERVER_URL = 'http://localhost:34115';
const STARTUP_TIMEOUT_MS = 120_000;
const PROCESS_WAIT_TIMEOUT_MS = 10_000;
const REPOSITORY_ROOT = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '../../..',
);

interface ProcessSnapshot {
  pid: number;
  parentPid: number;
  command: string;
}

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

function parsePidFromOutput(output: string): number | undefined {
  const match = output.match(
    /\b(?:app(?:lication)?\s+)?(?:child\s+)?(?:pid|process\s+id)\s*[:=]\s*(\d+)\b/iu,
  );
  if (match === null) return undefined;
  const pid = Number(match[1]);
  return Number.isSafeInteger(pid) && pid > 0 ? pid : undefined;
}

function parseProcessSnapshot(output: string): ProcessSnapshot[] {
  return output
    .split('\n')
    .map((line) => line.trim())
    .flatMap((line) => {
      const match = line.match(/^(\d+)\s+(\d+)\s+(.+)$/u);
      if (match === null) return [];
      return [
        {
          pid: Number(match[1]),
          parentPid: Number(match[2]),
          command: match[3],
        },
      ];
    });
}

async function processSnapshot(): Promise<ProcessSnapshot[]> {
  if (process.platform === 'win32') return [];
  const { stdout } = await execFile('ps', ['-axo', 'pid=,ppid=,args=']);
  return parseProcessSnapshot(stdout);
}

function isWailsInfrastructure(command: string): boolean {
  return /(?:^|[\s/])(?:wails|npm|node|vite|go|bash|zsh|sh)(?:$|[\s])/iu.test(
    command,
  );
}

function isGoMarkEditProcess(command: string): boolean {
  return /gomarkedit/iu.test(command) && !isWailsInfrastructure(command);
}

async function findAppChildPid(
  wailsPid: number,
  output: string,
): Promise<number | undefined> {
  const outputPid = parsePidFromOutput(output);
  if (outputPid !== undefined && processIsAlive(outputPid)) {
    return outputPid;
  }

  const deadline = Date.now() + PROCESS_WAIT_TIMEOUT_MS;
  while (Date.now() < deadline) {
    const processes = await processSnapshot();
    const app = processes.find(
      (candidate) =>
        candidate.parentPid === wailsPid &&
        isGoMarkEditProcess(candidate.command) &&
        processIsAlive(candidate.pid),
    );
    if (app !== undefined) return app.pid;
    await sleep(100);
  }
  return undefined;
}

async function terminateProcessTree(child: WailsProcess | null): Promise<void> {
  if (child?.pid === undefined) return;
  const pid = child.pid;

  if (process.platform === 'win32') {
    try {
      await execFile('taskkill', ['/T', '/F', '/PID', String(pid)]);
    } catch {
      // The process may have exited between the liveness check and taskkill.
    }
  } else {
    try {
      process.kill(-pid, 'SIGTERM');
    } catch {
      // The detached process group may already be gone.
    }
    try {
      process.kill(pid, 'SIGTERM');
    } catch {
      // The process may have exited with its child.
    }

    const deadline = Date.now() + PROCESS_WAIT_TIMEOUT_MS;
    while (processIsAlive(pid) && Date.now() < deadline) {
      await sleep(100);
    }
    if (processIsAlive(pid)) {
      try {
        process.kill(-pid, 'SIGKILL');
      } catch {
        // The process group may have disappeared after the liveness check.
      }
      try {
        process.kill(pid, 'SIGKILL');
      } catch {
        // The process may have exited after the group kill.
      }
    }
  }

  if (child.exitCode === null && child.signalCode === null) {
    await new Promise<void>((resolvePromise) => {
      child.once('close', () => resolvePromise());
    });
  }
}

function pathInside(directory: string, candidate: string): boolean {
  const relativePath = relative(directory, candidate);
  return (
    relativePath === '' ||
    (!relativePath.startsWith('..') && !isAbsolute(relativePath))
  );
}

function goEnvironment(): NodeJS.ProcessEnv {
  try {
    const values = execFileSync(
      process.env.GO_BIN ?? 'go',
      ['env', 'GOPATH', 'GOCACHE', 'GOMODCACHE'],
      { encoding: 'utf8' },
    )
      .trim()
      .split('\n');
    const [goPath, goCache, goModuleCache] = values;
    return {
      ...(goPath === undefined || goPath.length === 0
        ? {}
        : { GOPATH: goPath }),
      ...(goCache === undefined || goCache.length === 0
        ? {}
        : { GOCACHE: goCache }),
      ...(goModuleCache === undefined || goModuleCache.length === 0
        ? {}
        : { GOMODCACHE: goModuleCache }),
    };
  } catch {
    return {};
  }
}

function childEnvironment(
  tempDirectory: string,
  goPaths: NodeJS.ProcessEnv,
): NodeJS.ProcessEnv {
  const environment = { ...process.env, ...goPaths };
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
  seedRecents(files: readonly string[]): Promise<void>;
  launch(): Promise<void>;
  relaunch(): Promise<void>;
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

  private devProcess: WailsProcess | null = null;
  private devOutput = '';
  private disposed = false;

  private constructor(
    page: Page,
    tempDirectory: string,
    documentDirectory: string,
    repositoryDirectory: string,
  ) {
    this.page = page;
    this.tempDirectory = tempDirectory;
    this.profileDirectory = profileDirectory(tempDirectory);
    this.documentDirectory = documentDirectory;
    this.repositoryDirectory = repositoryDirectory;
  }

  static async create(page: Page): Promise<PlaywrightE2EAppHarness> {
    if (process.platform !== 'darwin' && process.platform !== 'linux') {
      throw new Error(
        `real-backend E2E harness is supported on macOS and Linux only (got ${process.platform})`,
      );
    }
    const tempDirectory = await mkdtemp(join(tmpdir(), 'gomarkedit-e2e-'));
    const documentDirectory = await mkdtemp(
      join(tmpdir(), 'gomarkedit-e2e-docs-'),
    );
    const configuredRepository = process.env.E2E_REPO;
    const repositoryDirectory =
      configuredRepository === undefined || configuredRepository.length === 0
        ? REPOSITORY_ROOT
        : isAbsolute(configuredRepository)
          ? configuredRepository
          : resolve(REPOSITORY_ROOT, configuredRepository);
    return new PlaywrightE2EAppHarness(
      page,
      tempDirectory,
      documentDirectory,
      repositoryDirectory,
    );
  }

  async writeDocument(relativePath: string, contents: string): Promise<string> {
    const target = resolve(this.documentDirectory, relativePath);
    if (!pathInside(this.documentDirectory, target)) {
      throw new Error(
        `document path escapes the temporary folder: ${relativePath}`,
      );
    }
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, contents, 'utf8');
    return target;
  }

  async seedRecents(files: readonly string[]): Promise<void> {
    await seedRecents(this.repositoryDirectory, this.profileDirectory, files);
  }

  async launch(): Promise<void> {
    if (this.disposed) throw new Error('cannot launch a disposed E2E harness');
    if (this.devProcess !== null) {
      throw new Error('the E2E harness is already running');
    }

    this.devOutput = '';
    const child = spawn(
      process.env.WAILS_BIN ?? 'wails',
      ['dev', '-devserver', 'localhost:34115', '-nocolour'],
      {
        cwd: this.repositoryDirectory,
        detached: process.platform !== 'win32',
        env: childEnvironment(this.tempDirectory, goEnvironment()),
        stdio: ['ignore', 'pipe', 'pipe'],
      },
    );
    this.devProcess = child;
    const collectOutput = (chunk: Buffer): void => {
      this.devOutput += chunk.toString();
    };
    child.stdout.on('data', collectOutput);
    child.stderr.on('data', collectOutput);

    try {
      await this.waitForBrowserPage(child);
      this.appChildPid = await findAppChildPid(child.pid ?? 0, this.devOutput);
      if (this.appChildPid === undefined) {
        throw new Error(
          `wails dev served the browser page but did not expose an app child PID.\n${this.devOutput}`,
        );
      }
      console.log(
        `[e2e] wailsPid=${child.pid ?? 'unknown'} appPid=${this.appChildPid} profile=${this.tempDirectory}`,
      );
    } catch (error) {
      await this.stopDevProcess();
      throw error;
    }
  }

  async relaunch(): Promise<void> {
    await this.stopDevProcess();
    await this.launch();
  }

  async waitForAppExit(
    timeoutMilliseconds = PROCESS_WAIT_TIMEOUT_MS,
  ): Promise<void> {
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
    if (this.disposed) return;
    this.disposed = true;
    await this.stopDevProcess();
    if (process.env.KEEP_E2E_ARTEFACTS === '1') return;
    await Promise.all([
      rm(this.tempDirectory, { force: true, recursive: true }),
      rm(this.documentDirectory, { force: true, recursive: true }),
    ]);
  }

  private async waitForBrowserPage(child: WailsProcess): Promise<void> {
    const deadline = Date.now() + STARTUP_TIMEOUT_MS;
    let lastError = 'the dev server did not answer';
    while (Date.now() < deadline) {
      if (child.exitCode !== null || child.signalCode !== null) {
        throw new Error(
          `wails dev exited before the browser page was ready.\n${this.devOutput}`,
        );
      }
      try {
        const response = await fetch(DEV_SERVER_URL);
        await response.text();
        if (response.ok) {
          await this.page.goto(DEV_SERVER_URL, {
            timeout: 10_000,
            waitUntil: 'domcontentloaded',
          });
          await this.page.waitForFunction(
            () =>
              typeof (window as unknown as { go?: unknown }).go !== 'undefined',
            { timeout: 10_000 },
          );
          return;
        }
        lastError = `the dev server returned HTTP ${response.status}`;
      } catch (error) {
        lastError = error instanceof Error ? error.message : String(error);
      }
      await sleep(250);
    }
    throw new Error(
      `timed out after ${STARTUP_TIMEOUT_MS / 1000} seconds waiting for ${DEV_SERVER_URL}: ${lastError}\n${this.devOutput}`,
    );
  }

  private async stopDevProcess(): Promise<void> {
    const child = this.devProcess;
    this.devProcess = null;
    this.appChildPid = undefined;
    await terminateProcessTree(child);
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
      await app.teardown();
    }
  },
});

export { expect };
