export type CommandPacing = 'bounded' | 'user-paced';

export type BootstrapStatus = 'loading' | 'ready' | 'failed';

let bootstrapStatus: BootstrapStatus = 'loading';

export function setBootstrapStatus(status: BootstrapStatus): void {
  bootstrapStatus = status;
}

export function getBootstrapStatus(): BootstrapStatus {
  return bootstrapStatus;
}

export interface CommandNoticeOwner {
  show: (notice: { command: string; requestId: string }) => void;
  withdraw: (requestId: string) => void;
}

export interface CommandInvokerOptions {
  isReady: () => boolean;
  noticeOwner?: CommandNoticeOwner;
  requestFactory?: (requestId: string) => { id: string };
  uuid?: () => string;
  boundMs?: number;
  setTimer?: (callback: () => void, delay: number) => TimerHandle;
  clearTimer?: (timer: TimerHandle) => void;
}

export interface CommandBindOptions<TArgs extends unknown[]> {
  pacing?: CommandPacing | ((...args: TArgs) => CommandPacing);
  expectedArity?: number;
}

export interface CommandInvoker {
  bind<TArgs extends unknown[], TResult>(
    commandName: string,
    bound: (request: { id: string }, ...args: TArgs) => Promise<TResult>,
    options?: CommandBindOptions<TArgs>,
  ): (...args: TArgs) => Promise<TResult>;
  retry: (requestId: string) => boolean;
  cancel: (requestId: string) => boolean;
  dispose: () => void;
}

type TimerHandle = ReturnType<typeof setTimeout> | number;

interface PendingCommand<TArgs extends unknown[], TResult> {
  args: TArgs;
  bound: (request: { id: string }, ...args: TArgs) => Promise<TResult>;
  commandName: string;
  request: { id: string };
  requestId: string;
  resolve: (value: TResult | PromiseLike<TResult>) => void;
  reject: (reason?: unknown) => void;
  settled: boolean;
  cancelled: boolean;
  noticeShown: boolean;
  timer?: TimerHandle;
}

const noopNoticeOwner: CommandNoticeOwner = {
  show: (): void => undefined,
  withdraw: (): void => undefined,
};

function mintUUID(): string {
  if (typeof globalThis.crypto?.randomUUID !== 'function') {
    throw new Error('crypto.randomUUID() is unavailable.');
  }
  return globalThis.crypto.randomUUID();
}

export function createCommandInvoker(
  options: CommandInvokerOptions,
): CommandInvoker {
  const boundMs = options.boundMs ?? 10_000;
  const noticeOwner = options.noticeOwner ?? noopNoticeOwner;
  const uuid = options.uuid ?? mintUUID;
  const requestFactory =
    options.requestFactory ?? ((id): { id: string } => ({ id }));
  const setTimer =
    options.setTimer ??
    ((callback: () => void, delay: number): TimerHandle =>
      globalThis.setTimeout(callback, delay));
  const clearTimer =
    options.clearTimer ??
    ((timer: TimerHandle): void => globalThis.clearTimeout(timer));
  const pending = new Map<string, PendingCommand<unknown[], unknown>>();

  function withdrawNotice<TResult>(
    entry: PendingCommand<unknown[], TResult>,
  ): void {
    if (!entry.noticeShown) return;
    entry.noticeShown = false;
    noticeOwner.withdraw(entry.requestId);
  }

  function settle<TResult>(
    entry: PendingCommand<unknown[], TResult>,
    outcome: { ok: true; value: TResult } | { ok: false; error: unknown },
  ): void {
    if (entry.settled) return;
    entry.settled = true;
    if (entry.timer !== undefined) {
      clearTimer(entry.timer);
      entry.timer = undefined;
    }
    withdrawNotice(entry);
    pending.delete(entry.requestId);
    if (outcome.ok) {
      entry.resolve(outcome.value);
    } else {
      entry.reject(outcome.error);
    }
  }

  function send<TResult>(entry: PendingCommand<unknown[], TResult>): void {
    if (entry.settled || entry.cancelled) return;

    let result: Promise<TResult>;
    try {
      result = entry.bound(entry.request, ...entry.args);
    } catch (error) {
      settle(entry, { ok: false, error });
      return;
    }

    void Promise.resolve(result).then(
      (value) => settle(entry, { ok: true, value }),
      (error) => settle(entry, { ok: false, error }),
    );
  }

  function scheduleNotice<TResult>(
    entry: PendingCommand<unknown[], TResult>,
    pacing: CommandPacing,
  ): void {
    if (pacing !== 'bounded' || !options.isReady()) return;
    entry.timer = setTimer((): void => {
      entry.timer = undefined;
      if (
        entry.settled ||
        entry.cancelled ||
        entry.noticeShown ||
        !options.isReady()
      ) {
        return;
      }
      entry.noticeShown = true;
      noticeOwner.show({
        command: entry.commandName,
        requestId: entry.requestId,
      });
    }, boundMs);
  }

  function bind<TArgs extends unknown[], TResult>(
    commandName: string,
    bound: (request: { id: string }, ...args: TArgs) => Promise<TResult>,
    bindOptions: CommandBindOptions<TArgs> = {},
  ): (...args: TArgs) => Promise<TResult> {
    const expectedArity = Math.max(
      0,
      bindOptions.expectedArity ?? bound.length - 1,
    );
    const pacing = bindOptions.pacing ?? 'bounded';

    const invoke = (...args: TArgs): Promise<TResult> => {
      if (args.length !== expectedArity) {
        return Promise.reject(
          new Error(
            `${commandName} expects ${expectedArity} argument(s), received ${args.length}.`,
          ),
        );
      }

      const requestId = uuid();
      let resolvePromise: (
        value: TResult | PromiseLike<TResult>,
      ) => void = (): void => undefined;
      let rejectPromise: (reason?: unknown) => void = (): void => undefined;
      const promise = new Promise<TResult>((resolve, reject): void => {
        resolvePromise = resolve;
        rejectPromise = reject;
      });
      const entry: PendingCommand<unknown[], TResult> = {
        args: [...args],
        bound: bound as PendingCommand<unknown[], TResult>['bound'],
        commandName,
        request: requestFactory(requestId),
        requestId,
        resolve: resolvePromise,
        reject: rejectPromise,
        settled: false,
        cancelled: false,
        noticeShown: false,
      };
      pending.set(requestId, entry as PendingCommand<unknown[], unknown>);
      send(entry);
      scheduleNotice(
        entry,
        typeof pacing === 'function' ? pacing(...args) : pacing,
      );
      return promise;
    };

    Object.defineProperty(invoke, 'length', {
      configurable: true,
      value: expectedArity,
    });
    return invoke;
  }

  return {
    bind,
    retry(requestId: string): boolean {
      const entry = pending.get(requestId);
      if (entry === undefined || entry.settled || entry.cancelled) return false;
      send(entry);
      return true;
    },
    cancel(requestId: string): boolean {
      const entry = pending.get(requestId);
      if (entry === undefined || entry.settled || entry.cancelled) return false;
      entry.cancelled = true;
      if (entry.timer !== undefined) {
        clearTimer(entry.timer);
        entry.timer = undefined;
      }
      withdrawNotice(entry);
      return true;
    },
    dispose(): void {
      for (const entry of pending.values()) {
        if (entry.timer !== undefined) clearTimer(entry.timer);
      }
      pending.clear();
    },
  };
}
