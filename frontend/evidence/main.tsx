import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import App from '../src/App';
import {
  dismissNotification,
  notifyCondition,
  notifyToast,
} from '../src/logic/store/notificationsSlice';
import { appModelAdapter } from '../src/logic/adapter';
import { nativeEvidenceRuntime } from '../src/logic/adapter/nativeEvidenceRuntime';
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
    default:
      throw new Error(`Unknown native evidence scenario: ${selected}`);
  }
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
