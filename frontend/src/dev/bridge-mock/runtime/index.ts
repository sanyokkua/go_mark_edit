type EventCallback = (...data: unknown[]) => void;

const listeners = new Map<string, Set<EventCallback>>();

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
