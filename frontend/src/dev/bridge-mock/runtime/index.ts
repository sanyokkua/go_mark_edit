import { EVENTS } from '../../../logic/adapter/events';

type EventCallback = (...data: unknown[]) => void;

const listeners = new Map<string, Set<EventCallback>>();
const statePatchMirror: unknown[] = [];
let fullscreen = false;
let closeRequestSequence = 0;

declare global {
  interface Window {
    readonly __GME_STATE_PATCHES__?: readonly unknown[];
  }
}

function cloneForBrowserMirror(value: unknown): unknown {
  if (Array.isArray(value)) {
    return Object.freeze(value.map(cloneForBrowserMirror));
  }

  if (isRecord(value)) {
    return Object.freeze(
      Object.fromEntries(
        Object.entries(value).map(([key, child]) => [
          key,
          cloneForBrowserMirror(child),
        ]),
      ),
    );
  }

  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function installStatePatchMirror(): void {
  if (typeof window === 'undefined') {
    return;
  }

  if (Object.getOwnPropertyDescriptor(window, '__GME_STATE_PATCHES__')) {
    return;
  }

  Object.defineProperty(window, '__GME_STATE_PATCHES__', {
    configurable: false,
    enumerable: false,
    get: (): readonly unknown[] => Object.freeze([...statePatchMirror]),
  });
}

installStatePatchMirror();

export function EventsOn(
  eventName: string,
  callback: EventCallback,
): () => void {
  const eventListeners = listeners.get(eventName) ?? new Set<EventCallback>();
  eventListeners.add(callback);
  listeners.set(eventName, eventListeners);

  return (): void => {
    eventListeners.delete(callback);
    if (eventListeners.size === 0) {
      listeners.delete(eventName);
    }
  };
}

export function EventsOnMultiple(
  eventName: string,
  callback: EventCallback,
  maxCallbacks: number,
): () => void {
  let callbackCount = 0;
  const unsubscribe = EventsOn(eventName, (...data: unknown[]): void => {
    callback(...data);
    callbackCount += 1;
    if (maxCallbacks >= 0 && callbackCount >= maxCallbacks) {
      unsubscribe();
    }
  });

  return unsubscribe;
}

export function EventsOnce(
  eventName: string,
  callback: EventCallback,
): () => void {
  return EventsOnMultiple(eventName, callback, 1);
}

export function EventsEmit(eventName: string, ...data: unknown[]): void {
  if (eventName === EVENTS.statePatch) {
    statePatchMirror.push(cloneForBrowserMirror(data[0]));
  }
  listeners.get(eventName)?.forEach((callback) => callback(...data));
}

export function EventsOff(
  eventName: string,
  ...additionalEventNames: string[]
): void {
  listeners.delete(eventName);
  additionalEventNames.forEach((name) => listeners.delete(name));
}

export function EventsOffAll(): void {
  listeners.clear();
}

export function WindowFullscreen(): void {
  fullscreen = true;
}

export function WindowUnfullscreen(): void {
  fullscreen = false;
}

export function WindowIsFullscreen(): Promise<boolean> {
  return Promise.resolve(fullscreen);
}

export function WindowGetSize(): Promise<{ h: number; w: number }> {
  return Promise.resolve({ h: window.innerHeight, w: window.innerWidth });
}

export function WindowIsMaximised(): Promise<boolean> {
  return Promise.resolve(false);
}

export function Quit(): void {
  closeRequestSequence += 1;
  EventsEmit(EVENTS.applicationCloseRequested, {
    id: `mock-close-${closeRequestSequence}`,
  });
}
