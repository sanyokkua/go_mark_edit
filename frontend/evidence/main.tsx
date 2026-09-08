import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import App from '../src/App';
import {
  dismissNotification,
  notifyCondition,
  notifyToast,
} from '../src/logic/store/notificationsSlice';
import { appModelAdapter } from '../src/logic/adapter';
import {
  nativeEvidenceRuntime,
  type NativeAutosaveCommit,
} from '../src/logic/adapter/nativeEvidenceRuntime';
import { store } from '../src/logic/store';
import '../src/ui/styles/tokens.css';
import '../src/ui/styles/base.css';

declare const __NATIVE_EVIDENCE_SCENARIO__: string;

const scenario = __NATIVE_EVIDENCE_SCENARIO__;
const rootElement = document.getElementById('root');

if (rootElement === null) {
  throw new Error('Application root is missing.');
}

createRoot(rootElement).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

void runNativeEvidenceScenario(scenario).catch((error: unknown): void => {
  reportEvidence(
    `scenario=${scenario} status=FAIL error=${error instanceof Error ? error.message : String(error)}`,
  );
  nativeEvidenceRuntime.logInfo(
    JSON.stringify({
      scenario,
      status: 'FAIL',
      error: error instanceof Error ? error.message : String(error),
    }),
  );
});

async function runNativeEvidenceScenario(selected: string): Promise<void> {
  document.documentElement.dataset.nativeEvidenceScenario = selected;
  document.title = `GoMarkEdit [native-evidence:${selected}]`;
  reportEvidence(`scenario=${selected} status=running`);
  switch (selected) {
    case 'pending-close':
      await driveSeparator(2);
      await delay(40);
      nativeEvidenceRuntime.logInfo(
        JSON.stringify({ scenario: selected, status: 'close-requested' }),
      );
      nativeEvidenceRuntime.quit();
      return;
    case 'stale-close-old':
      await driveSeparator(2);
      await delay(15_000);
      nativeEvidenceRuntime.logInfo(
        JSON.stringify({ scenario: selected, status: 'close-requested' }),
      );
      nativeEvidenceRuntime.quit();
      return;
    case 'stale-close-new':
      await driveSeparator(6);
      await delay(4500);
      nativeEvidenceRuntime.logInfo(
        JSON.stringify({ scenario: selected, status: 'close-requested' }),
      );
      nativeEvidenceRuntime.quit();
      return;
    case 'divider-acknowledgement':
      await observeDividerAcknowledgement();
      await delay(60_000);
      nativeEvidenceRuntime.quit();
      return;
    case 'notifications':
      await waitForEvidenceStart();
      await observeNotifications();
      await delay(60_000);
      nativeEvidenceRuntime.quit();
      return;
    case 'startup-retry':
      nativeEvidenceRuntime.logInfo(
        JSON.stringify({ scenario: selected, status: 'awaiting-retry' }),
      );
      return;
    case 'autosave-latency':
      await runAutosaveLatency();
      return;
    case 'explicit-save-latency':
      // Go drives this walkthrough end to end. SC-FT-002's interval stops at
      // the explicit-save confirmation, and a webview round trip inside that
      // interval would be measured instead of the application. The frontend
      // only proves the real shell mounted, then waits for Go to quit.
      await waitForApplicationState();
      reportEvidence(`scenario=${selected} status=go-driven`);
      nativeEvidenceRuntime.logInfo(
        JSON.stringify({ scenario: selected, status: 'go-driven' }),
      );
      return;
    default:
      throw new Error(`Unknown native evidence scenario: ${selected}`);
  }
}

async function runAutosaveLatency(): Promise<void> {
  if (appModelAdapter.openDocument === undefined) {
    throw new Error('AppModelAdapter.openDocument is unavailable.');
  }
  const sizes = [1024, 262_144, 1_048_576, 2_097_152];
  const rows: NativeAutosaveCommit[] = [];
  await waitForApplicationState();

  for (const sizeBytes of sizes) {
    const beforeOpen = await appModelAdapter.getState();
    const opened = await appModelAdapter.openDocument(
      beforeOpen.snapshot.tabSetRevision,
    );
    if (opened.activeBuffer === undefined) {
      throw new Error(`No active buffer was returned for ${sizeBytes} bytes.`);
    }
    const documentId = opened.activeBuffer.documentId;
    let content = opened.activeBuffer.content;
    if (content.length !== sizeBytes) {
      throw new Error(
        `Fixture ${sizeBytes} bytes opened as ${content.length} characters.`,
      );
    }

    for (let trial = 1; trial <= 30; trial += 1) {
      const warmup = trial <= 5;
      const input = { trial, warmup, sizeBytes, documentId };
      const nextContent = replaceOneCharacter(content, trial - 1);
      const commitPromise = waitForAutosaveCommit(input);
      await appModelAdapter.updateBuffer(documentId, nextContent);
      // This acknowledgement is emitted only after the final input handler
      // has returned. The adapter's 200 ms synchronization remains inside the
      // Go t0-to-t1 interval, before the production one-second timer fires.
      nativeEvidenceRuntime.acknowledgeAutosaveInput(input);
      const commit = await commitPromise;
      rows.push(commit);
      content = nextContent;
      reportEvidence(
        `scenario=autosave-latency size=${sizeBytes} trial=${trial} status=${commit.status}`,
        true,
      );
    }
  }

  const measured = rows.filter((row) => !row.warmup);
  const successful = measured.filter((row) => row.status === 'committed');
  const withinFiveSeconds = successful.filter(
    (row) => (row.durationNs ?? Number.POSITIVE_INFINITY) <= 5_000_000_000,
  ).length;
  const status =
    measured.length === 100 &&
    successful.length === 100 &&
    withinFiveSeconds >= 95
      ? 'PASS'
      : 'FAIL';
  nativeEvidenceRuntime.logInfo(
    JSON.stringify({
      scenario: 'autosave-latency',
      status,
      warmups: rows.length - measured.length,
      measured: measured.length,
      successful: successful.length,
      withinFiveSeconds,
    }),
  );
  document.title = `GoMarkEdit [native-evidence:autosave ${status} successful=${successful.length}/100 <=5s=${withinFiveSeconds}]`;
  if (status === 'FAIL') {
    throw new Error(
      `Autosave latency evidence failed: ${successful.length}/100 committed, ${withinFiveSeconds}/100 <=5s.`,
    );
  }
  await delay(250);
  nativeEvidenceRuntime.quit();
}

function replaceOneCharacter(content: string, trial: number): string {
  const offset = trial % content.length;
  const current = content[offset];
  const replacement = current === 'a' ? 'b' : 'a';
  return `${content.slice(0, offset)}${replacement}${content.slice(offset + 1)}`;
}

async function waitForApplicationState(): Promise<void> {
  const deadline = performance.now() + 15_000;
  let lastError: unknown;
  while (performance.now() < deadline) {
    try {
      await appModelAdapter.getState();
      return;
    } catch (error: unknown) {
      lastError = error;
      await delay(100);
    }
  }
  throw new Error(
    `Application state did not become available: ${String(lastError)}`,
  );
}

function waitForAutosaveCommit(input: {
  trial: number;
  warmup: boolean;
  sizeBytes: number;
  documentId: string;
}): Promise<NativeAutosaveCommit> {
  return new Promise((resolve) => {
    const dispose = nativeEvidenceRuntime.onAutosaveCommit((commit) => {
      if (
        commit.documentId !== input.documentId ||
        commit.trial !== input.trial ||
        commit.sizeBytes !== input.sizeBytes ||
        commit.warmup !== input.warmup
      ) {
        return;
      }
      window.clearTimeout(timeoutId);
      dispose();
      resolve(commit);
    });
    const timeoutId = window.setTimeout(() => {
      dispose();
      nativeEvidenceRuntime.recordAutosaveMiss(input);
      resolve({
        ...input,
        status: 'missed',
        expectedDiskBytes: input.sizeBytes,
      });
    }, 7_500);
  });
}

async function findSeparator(): Promise<HTMLElement> {
  const deadline = performance.now() + 10_000;
  while (performance.now() < deadline) {
    const separator = document.querySelector<HTMLElement>(
      '[role="separator"][aria-label="Resize workspace"]',
    );
    if (separator !== null) {
      return separator;
    }
    await delay(25);
  }
  throw new Error('Production workspace separator did not render.');
}

async function driveSeparator(steps: number): Promise<{
  expected: number;
  separator: HTMLElement;
}> {
  const separator = await findSeparator();
  const initial = Number(separator.getAttribute('aria-valuenow'));
  separator.focus();
  for (let step = 0; step < steps; step += 1) {
    separator.dispatchEvent(
      new KeyboardEvent('keydown', {
        bubbles: true,
        cancelable: true,
        key: 'ArrowRight',
      }),
    );
    await delay(10);
  }
  await delay(25);
  const expected = initial + steps * 16;
  const visible = Number(separator.getAttribute('aria-valuenow'));
  if (visible !== expected) {
    throw new Error(
      `separator remained ${visible}; expected ${expected} after ${steps} steps from ${initial}`,
    );
  }
  return { expected, separator };
}

async function observeDividerAcknowledgement(): Promise<void> {
  const { expected, separator } = await driveSeparator(3);
  const visible = Number(separator.getAttribute('aria-valuenow'));
  await delay(400);
  const state = await appModelAdapter.getState();
  const acknowledged = state.snapshot.ui.sidebarWidth;
  const status = acknowledged === visible ? 'PASS' : 'FAIL';
  document.title = `GoMarkEdit [native-evidence:divider ${status} visible=${visible} acknowledged=${String(acknowledged)}]`;
  reportEvidence(
    `scenario=divider-acknowledgement status=${status} expected=${expected} visible=${visible} acknowledged=${String(acknowledged)}`,
  );
  nativeEvidenceRuntime.logInfo(
    JSON.stringify({
      scenario: 'divider-acknowledgement',
      status,
      visible,
      acknowledged,
    }),
  );
  if (status === 'FAIL') {
    throw new Error(
      `divider visible ${visible} does not match acknowledgement ${String(acknowledged)}`,
    );
  }
}

async function observeNotifications(): Promise<void> {
  await findSeparator();
  const started = performance.now();
  store.dispatch(
    notifyToast({
      code: 'evidence-success',
      message: 'Completed event',
      severity: 'success',
      subject: 'success-subject',
      title: 'Success',
    }),
  );
  store.dispatch(
    notifyToast({
      code: 'evidence-info',
      message: 'Informational event',
      severity: 'info',
      subject: 'info-subject',
      title: 'Information',
    }),
  );
  store.dispatch(
    notifyToast({
      code: 'evidence-warning',
      message: 'Warning event',
      severity: 'warning',
      subject: 'warning-subject',
      title: 'Warning',
    }),
  );
  store.dispatch(
    notifyCondition({
      code: 'evidence-condition',
      message: 'Continuing condition',
      severity: 'warning',
      subject: 'condition-subject',
      title: 'Condition',
    }),
  );
  store.dispatch(
    notifyCondition({
      code: 'evidence-condition',
      message: 'Continuing condition',
      severity: 'warning',
      subject: 'condition-subject',
      title: 'Condition',
    }),
  );
  await delay(1000);
  store.dispatch(
    notifyToast({
      code: 'evidence-info',
      message: 'Informational event',
      severity: 'info',
      subject: 'info-subject',
      title: 'Information',
    }),
  );
  recordNotificationSnapshot(started, 'deduplicated');

  await delay(3250);
  recordNotificationSnapshot(started, 'after-success-deadline');
  await delay(3000);
  recordNotificationSnapshot(started, 'after-refreshed-info-deadline');
  await delay(1000);
  recordNotificationSnapshot(started, 'after-warning-deadline');

  for (const suffix of ['one', 'two', 'three', 'four']) {
    store.dispatch(
      notifyToast({
        code: `evidence-error-${suffix}`,
        message: `Queued error ${suffix}`,
        severity: 'error',
        subject: `error-${suffix}`,
        title: `Error ${suffix}`,
      }),
    );
  }
  await delay(100);
  recordNotificationSnapshot(started, 'errors-queued');
  const firstVisibleError = store
    .getState()
    .notifications.items.find(
      (notification) => notification.severity === 'error',
    );
  if (firstVisibleError === undefined) {
    throw new Error('No visible error was available for queue promotion.');
  }
  store.dispatch(dismissNotification(firstVisibleError.id));
  await delay(100);
  recordNotificationSnapshot(started, 'error-promoted');
}

function waitForEvidenceStart(): Promise<void> {
  return new Promise((resolve): void => {
    const button = document.createElement('button');
    button.id = 'native-evidence-start';
    button.type = 'button';
    button.textContent = 'Start notification evidence';
    button.style.cssText =
      'position:fixed;left:50%;top:50%;z-index:2147483647;transform:translate(-50%,-50%);padding:16px;background:#fff;color:#111;border:3px solid #b000b5;border-radius:6px;font:700 16px system-ui';
    button.addEventListener(
      'click',
      (): void => {
        button.remove();
        resolve();
      },
      { once: true },
    );
    document.body.append(button);
    button.focus();
    reportEvidence('scenario=notifications status=ready-click-start');
  });
}

function recordNotificationSnapshot(started: number, phase: string): void {
  const notifications = store.getState().notifications;
  document.title = `GoMarkEdit [native-evidence:notifications ${phase} visible=${notifications.items.length} queued=${notifications.queuedErrors.length} banners=${notifications.banners.length}]`;
  const elapsedMs = Math.round(performance.now() - started);
  reportEvidence(
    `scenario=notifications phase=${phase} elapsedMs=${elapsedMs} visible=${notifications.items.map((item) => `${item.code}:${item.count}`).join(',') || 'none'} queued=${notifications.queuedErrors.map((item) => `${item.code}:${item.count}`).join(',') || 'none'} banners=${notifications.banners.map((item) => `${item.code}:${item.count}`).join(',') || 'none'}`,
    true,
  );
  nativeEvidenceRuntime.logInfo(
    JSON.stringify({
      scenario: 'notifications',
      phase,
      elapsedMs,
      visible: notifications.items.map((item) => ({
        code: item.code,
        count: item.count,
        severity: item.severity,
      })),
      queued: notifications.queuedErrors.map((item) => item.code),
      banners: notifications.banners.map((item) => ({
        code: item.code,
        count: item.count,
      })),
    }),
  );
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, milliseconds));
}

function reportEvidence(value: string, append = false): void {
  let reporter = document.getElementById('native-evidence-result');
  if (reporter === null) {
    reporter = document.createElement('div');
    reporter.id = 'native-evidence-result';
    reporter.setAttribute('role', 'status');
    reporter.setAttribute('aria-live', 'polite');
    reporter.style.position = 'fixed';
    reporter.style.right = '8px';
    reporter.style.bottom = '8px';
    reporter.style.zIndex = '2147483647';
    reporter.style.padding = '4px 6px';
    reporter.style.background = '#7a005c';
    reporter.style.color = '#ffffff';
    reporter.style.border = '2px solid #ffffff';
    reporter.style.font = '11px system-ui';
    reporter.style.maxWidth = '70vw';
    reporter.style.whiteSpace = 'pre-wrap';
    (document.querySelector('.application-frame') ?? document.body).append(
      reporter,
    );
  }
  reporter.textContent =
    append && reporter.textContent !== ''
      ? `${reporter.textContent}\n${value}`
      : value;
}
