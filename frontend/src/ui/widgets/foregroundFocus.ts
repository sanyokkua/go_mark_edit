/**
 * How long to let the operating system hand the foreground to another
 * application before concluding that it never will.
 *
 * FR-FT-037 defers focus restoration until "the application regains foreground
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
