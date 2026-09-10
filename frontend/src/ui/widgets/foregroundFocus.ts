/**
 * How long to let the operating system hand the foreground to another
 * application before concluding that it never will.
 *
 * Focus restoration waits until "the application regains foreground
 * focus, since the file manager may briefly own it". A browser cannot observe
 * the file manager's window; all it sees is its own `focus` event. If the host
 * accepted the Reveal but never actually raised anything — a Finder window
 * already frontmost, a Linux handler that exits silently — that event never
 * arrives, and a wait with no floor would strand focus on nothing for the rest
 * of the session. The grace period is not a guess at how long the handover
 * takes: it only decides *when to check*, and the check is
 * `document.hasFocus()`. Still holding the foreground a second later means the
 * foreground was never given away, so there is nothing to wait for.
 */
const FOREGROUND_HANDOVER_GRACE_MS = 1_000;

/**
 * Run `restore` once the application next has foreground focus.
 *
 * Returns a canceller. Calling it abandons the pending restoration and detaches
 * the listener — which is what an unmount or a superseding menu wants, and what
 * keeps a deferred restoration from leaking a `focus` handler per invocation.
 * The canceller is safe to call after the restoration has already run.
 */
export function whenApplicationRegainsForegroundFocus(
  restore: () => void,
): () => void {
  if (typeof window === 'undefined') {
    restore();
    return (): void => undefined;
  }

  // The abort signal is both the listener's own removal mechanism and the
  // single "already settled" flag, so the two cannot disagree.
  const controller = new AbortController();
  let graceTimer: number | undefined;
  const settle = (run: boolean): void => {
    if (controller.signal.aborted) return;
    controller.abort();
    if (graceTimer !== undefined) window.clearTimeout(graceTimer);
    if (run) restore();
  };

  window.addEventListener('focus', (): void => settle(true), {
    signal: controller.signal,
  });
  graceTimer = window.setTimeout((): void => {
    graceTimer = undefined;
    if (globalThis.document.hasFocus()) settle(true);
  }, FOREGROUND_HANDOVER_GRACE_MS);

  return (): void => settle(false);
}

/**
 * Run `enter` every time the application comes back to the foreground, for as
 * long as the returned canceller has not been called.
 *
 * A foreground version check runs on "window focus or resume" and
 * forbids Feature 003 from introducing "a background file watcher or polling
 * timer", so both halves are events and neither is a clock: `focus` is the
 * window regaining focus, and `visibilitychange` settling on `visible` is the
 * resume the OS reports when the window is unminimised or its space comes back.
 *
 * This is deliberately not `whenApplicationRegainsForegroundFocus` re-armed in a
 * loop. That helper is one-shot by design and carries a grace timer that fires
 * when the foreground was never actually given away — re-arming it repeatedly
 * would turn that floor into a check every second, which is the polling timer
 * the requirement rules out. The two live in one module because they observe
 * the same thing; they answer different questions about it.
 *
 * One resume can raise both events. Coalescing is left to the caller, which is
 * the only party that knows whether its work is re-entrant.
 */
export function onApplicationForeground(enter: () => void): () => void {
  if (typeof window === 'undefined') {
    return (): void => undefined;
  }

  const controller = new AbortController();
  window.addEventListener('focus', (): void => enter(), {
    signal: controller.signal,
  });
  globalThis.document.addEventListener(
    'visibilitychange',
    (): void => {
      if (globalThis.document.visibilityState === 'visible') enter();
    },
    { signal: controller.signal },
  );

  return (): void => controller.abort();
}
