import { EVENTS } from '../../src/logic/adapter/events';

type Listener = (payload: unknown) => void;

export interface StatePatchDriver {
  eventsOn: (eventName: string, listener: Listener) => () => void;
  emitStatePatch: (patch: unknown) => void;
  emitStateError: (error: unknown) => void;
}

export function createStatePatchDriver(): StatePatchDriver {
  const listeners = new Map<string, Set<Listener>>();

  const eventsOn = (eventName: string, listener: Listener): (() => void) => {
    const eventListeners = listeners.get(eventName) ?? new Set<Listener>();
    eventListeners.add(listener);
    listeners.set(eventName, eventListeners);
    return (): void => {
      eventListeners.delete(listener);
      if (eventListeners.size === 0) listeners.delete(eventName);
    };
  };

  const emit = (eventName: string, payload: unknown): void => {
    listeners.get(eventName)?.forEach((listener) => listener(payload));
  };

  return {
    eventsOn,
    emitStatePatch: (patch): void => emit(EVENTS.statePatch, patch),
    emitStateError: (error): void => emit(EVENTS.stateError, error),
  };
}
