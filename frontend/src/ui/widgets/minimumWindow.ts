import { useEffect, useState } from 'react';

/*
 * The native minimum window is 375x480 (`main.go:104-105`), and frame rounding
 * can expose a 376px CSS viewport at that size — so the minimum presentation
 * owns that one-pixel boundary too. This is the same bound the module CSS
 * spells as `@media (max-width: 376px)`, kept here as one constant so the
 * script and the stylesheets cannot drift apart.
 */
export const MINIMUM_WINDOW_MAX_WIDTH = 376;

const MINIMUM_WINDOW_QUERY = `(max-width: ${MINIMUM_WINDOW_MAX_WIDTH}px)`;

/*
 * The static read. Callers that only sample the width at a moment — popup
 * placement, an event handler — use this; anything whose rendering must follow
 * a resize uses `useMinimumWindow`.
 */
export function isMinimumWindow(): boolean {
  return (
    typeof window !== 'undefined' &&
    window.innerWidth <= MINIMUM_WINDOW_MAX_WIDTH
  );
}

function minimumWindowNow(): boolean {
  if (typeof window === 'undefined') {
    return false;
  }
  if (typeof window.matchMedia !== 'function') {
    return isMinimumWindow();
  }
  return window.matchMedia(MINIMUM_WINDOW_QUERY).matches;
}

/*
 * Reactive: the collapse to a minimum window is a presentation of the current
 * width, not a recorded mode, so widening the window has to restore the wide
 * layout with no user action and nothing dispatched. A media-query listener is
 * what makes that true — a value sampled once at mount would strand the
 * collapsed layout on a window that is no longer narrow.
 */
export function useMinimumWindow(): boolean {
  const [minimumWindow, setMinimumWindow] = useState(minimumWindowNow);

  useEffect((): (() => void) => {
    if (typeof window === 'undefined') {
      return (): void => undefined;
    }
    const sync = (): void => setMinimumWindow(minimumWindowNow());
    sync();
    if (typeof window.matchMedia !== 'function') {
      /*
       * No media queries at all here — jsdom is the environment this ships
       * against that has none. `resize` re-reads `window.innerWidth`, which is
       * the same fact by the only route left.
       */
      window.addEventListener('resize', sync);
      return (): void => window.removeEventListener('resize', sync);
    }
    const query = window.matchMedia(MINIMUM_WINDOW_QUERY);
    query.addEventListener('change', sync);
    return (): void => query.removeEventListener('change', sync);
  }, []);

  return minimumWindow;
}
