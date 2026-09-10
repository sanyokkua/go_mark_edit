import { whenApplicationRegainsForegroundFocus } from '../../../src/ui/widgets/foregroundFocus';

function focusListenerCount(): number {
  return addSpy.mock.calls.filter(([type]) => type === 'focus').length;
}

let addSpy: jest.SpyInstance;
let hasFocus: jest.SpyInstance;

beforeEach(() => {
  jest.useFakeTimers();
  addSpy = jest.spyOn(window, 'addEventListener');
  hasFocus = jest.spyOn(globalThis.document, 'hasFocus');
});

afterEach(() => {
  jest.runOnlyPendingTimers();
  jest.useRealTimers();
  addSpy.mockRestore();
  hasFocus.mockRestore();
});

it('runs the restoration on the window focus event, not before it', () => {
  const restore = jest.fn();
  whenApplicationRegainsForegroundFocus(restore);

  expect(restore).not.toHaveBeenCalled();
  window.dispatchEvent(new Event('focus'));
  expect(restore).toHaveBeenCalledTimes(1);

  // A second foreground event is not a second restoration.
  window.dispatchEvent(new Event('focus'));
  expect(restore).toHaveBeenCalledTimes(1);
});

/*
 * The wait cannot be unbounded. A browser sees only its own `focus` event, so a
 * host that accepted the Reveal without actually raising a window would never
 * produce one, and focus would sit on nothing for the rest of the session.
 */
it('restores anyway once it can see the foreground was never given away', () => {
  const restore = jest.fn();
  hasFocus.mockReturnValue(true);
  whenApplicationRegainsForegroundFocus(restore);

  expect(restore).not.toHaveBeenCalled();
  jest.advanceTimersByTime(1_000);
  expect(restore).toHaveBeenCalledTimes(1);
});

it('keeps waiting past the grace check while another application holds the foreground', () => {
  const restore = jest.fn();
  hasFocus.mockReturnValue(false);
  whenApplicationRegainsForegroundFocus(restore);

  jest.advanceTimersByTime(10_000);
  expect(restore).not.toHaveBeenCalled();

  window.dispatchEvent(new Event('focus'));
  expect(restore).toHaveBeenCalledTimes(1);
});

it('detaches the listener when the wait is cancelled, so nothing accumulates', () => {
  const restore = jest.fn();
  const listenersBefore = focusListenerCount();
  const cancel = whenApplicationRegainsForegroundFocus(restore);
  expect(focusListenerCount()).toBe(listenersBefore + 1);

  cancel();
  window.dispatchEvent(new Event('focus'));
  jest.advanceTimersByTime(10_000);
  expect(restore).not.toHaveBeenCalled();

  // Cancelling twice, or after the restoration already ran, is inert.
  expect(cancel).not.toThrow();
});
