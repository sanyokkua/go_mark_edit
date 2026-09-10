import { spawn, type ChildProcess } from 'node:child_process';
import type { Page } from '@playwright/test';

import { expect, test } from '../support/harness';

interface HeldLock {
  process: ChildProcess;
}

async function startHeldLock(
  repositoryDirectory: string,
  profileDirectory: string,
): Promise<HeldLock> {
  const child = spawn(
    process.env.GO_BIN ?? 'go',
    ['run', './tools/e2e-seed', profileDirectory, 'hold-lock', '14'],
    {
      cwd: repositoryDirectory,
      detached: process.platform !== 'win32',
      env: { ...process.env },
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  );

  let output = '';
  let ready = false;
  const waitForReady = new Promise<void>((resolve, reject) => {
    const onOutput = (chunk: Buffer): void => {
      output += chunk.toString();
      if (!ready && output.includes('lock acquired')) {
        ready = true;
        resolve();
      }
    };
    child.stdout?.on('data', onOutput);
    child.stderr?.on('data', onOutput);
    child.once('error', reject);
    child.once('close', (code, signal): void => {
      if (!ready) {
        reject(
          new Error(
            `the profile lock helper exited before acquiring the lock (code=${code ?? 'none'}, signal=${signal ?? 'none'})\n${output}`,
          ),
        );
      }
    });
  });

  try {
    await waitForReady;
  } catch (error) {
    await stopHeldLock(child);
    throw error;
  }
  return { process: child };
}

async function stopHeldLock(child: ChildProcess): Promise<void> {
  if (child.exitCode !== null || child.signalCode !== null) return;

  const closed = new Promise<void>((resolve) => {
    child.once('close', () => resolve());
  });
  if (child.pid !== undefined) {
    if (process.platform !== 'win32') {
      try {
        process.kill(-child.pid, 'SIGTERM');
      } catch {
        // The helper may have completed between the state check and the signal.
      }
    }
    try {
      child.kill('SIGTERM');
    } catch {
      // The helper may have completed between the state check and the signal.
    }
  }
  await Promise.race([
    closed,
    new Promise<void>((resolve) => {
      globalThis.setTimeout(resolve, 5_000);
    }),
  ]);
}

async function closeUntitledDocument(page: Page): Promise<void> {
  const untitled = page.getByRole('tab', { name: 'Untitled' });
  await expect(untitled).toBeVisible();
  await untitled
    .locator('..')
    .getByRole('button', { name: /^Close /u })
    .click();
}

test('a late recent-file completion remains single and respects retry and cancel', async ({
  app,
}) => {
  const source = await app.writeDocument('late.md', '# Late');
  const other = await app.writeDocument('other.md', '# Other');
  await app.seedRecents([other, source]);
  await app.launch();

  const runVariant = async (remediation: 'retry' | 'cancel'): Promise<void> => {
    await closeUntitledDocument(app.page);
    const launcher = app.page.getByTestId('document-launcher');
    await expect(launcher).toBeVisible();

    const heldLock = await startHeldLock(
      app.repositoryDirectory,
      app.profileDirectory,
    );
    try {
      const recent = launcher.getByRole('button', { name: 'late.md' });
      await expect(recent).toBeVisible();
      const startedAt = Date.now();
      await recent.click();

      const stuck = app.page.locator(
        '[data-notification-code="command-stuck"]',
      );
      await expect(stuck).toBeVisible({ timeout: 11_000 });
      if (remediation === 'retry') {
        const retryAt = startedAt + 10_500;
        const wait = retryAt - Date.now();
        if (wait > 0) await app.page.waitForTimeout(wait);
        await stuck.getByRole('button', { name: 'Retry', exact: true }).click();
      } else {
        await stuck
          .getByRole('button', { name: 'Cancel', exact: true })
          .click();
        await expect(stuck).toHaveCount(0);
      }

      await expect(app.page.getByRole('tab', { name: 'late.md' })).toBeVisible({
        timeout: 20_000,
      });
      await expect(app.page.getByRole('tab')).toHaveCount(1);
      await expect(stuck).toHaveCount(0, { timeout: 5_000 });
    } finally {
      await stopHeldLock(heldLock.process);
    }
  };

  await runVariant('retry');
  await app.relaunch();
  await app.seedRecents([other, source]);
  await runVariant('cancel');
});
