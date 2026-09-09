import {
  createCommandInvoker,
  type CommandNoticeOwner,
} from '../../../src/logic/adapter/command';
import { createCommandRecorder } from '../../support/commandRecorder';

interface Deferred<T> {
  promise: Promise<T>;
  resolve: (value: T) => void;
}

function deferred<T>(): Deferred<T> {
  let resolve: (value: T) => void = (): void => undefined;
  const promise = new Promise<T>((resolvePromise): void => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

function notices(): CommandNoticeOwner & {
  show: jest.Mock;
  withdraw: jest.Mock;
} {
  return {
    show: jest.fn(),
    withdraw: jest.fn(),
  };
}

afterEach((): void => {
  jest.useRealTimers();
});

it('attaches a fresh bridge request id to every command call', () => {
  const recorder = createCommandRecorder();
  const invoker = createCommandInvoker({
    isReady: (): boolean => true,
    uuid: jest
      .fn<() => string>()
      .mockReturnValueOnce('request-1')
      .mockReturnValueOnce('request-2'),
  });
  const updateBuffer = invoker.bind(
    'AppModelHandler.UpdateBuffer',
    recorder.binding('AppModelHandler.UpdateBuffer', 2),
  );

  void updateBuffer('document-1', 'first');
  void updateBuffer('document-1', 'second');

  expect(recorder.calls).toEqual([
    {
      name: 'AppModelHandler.UpdateBuffer',
      requestId: 'request-1',
      args: ['document-1', 'first'],
    },
    {
      name: 'AppModelHandler.UpdateBuffer',
      requestId: 'request-2',
      args: ['document-1', 'second'],
    },
  ]);
});

it('shows a bounded command notice at the ten-second bound', () => {
  jest.useFakeTimers();
  const noticeOwner = notices();
  const invoker = createCommandInvoker({
    isReady: (): boolean => true,
    noticeOwner,
    uuid: (): string => 'bounded-request',
  });
  const command = invoker.bind(
    'AppModelHandler.GetState',
    function getState(request: { id: string }): Promise<never> {
      void request;
      return new Promise<never>(() => undefined);
    },
  );

  void command();
  jest.advanceTimersByTime(9_999);
  expect(noticeOwner.show).not.toHaveBeenCalled();
  jest.advanceTimersByTime(1);

  expect(noticeOwner.show).toHaveBeenCalledWith({
    command: 'AppModelHandler.GetState',
    requestId: 'bounded-request',
  });
});

it('does not show a stuck notice for a user-paced command', () => {
  jest.useFakeTimers();
  const noticeOwner = notices();
  const invoker = createCommandInvoker({
    isReady: (): boolean => true,
    noticeOwner,
    uuid: (): string => 'open-request',
  });
  const openDocument = invoker.bind(
    'AppModelHandler.OpenDocument',
    function openDocument(request: { id: string }): Promise<never> {
      void request;
      return new Promise<never>(() => undefined);
    },
    { pacing: 'user-paced' },
  );

  void openDocument();
  jest.advanceTimersByTime(15_000);

  expect(noticeOwner.show).not.toHaveBeenCalled();
});

it('withdraws two bounded notices independently when their results arrive', async () => {
  jest.useFakeTimers();
  const noticeOwner = notices();
  const first = deferred<string>();
  const second = deferred<string>();
  let callCount = 0;
  const invoker = createCommandInvoker({
    isReady: (): boolean => true,
    noticeOwner,
    uuid: jest
      .fn<() => string>()
      .mockReturnValueOnce('first-request')
      .mockReturnValueOnce('second-request'),
  });
  const command = invoker.bind(
    'AppModelHandler.GetState',
    function getState(request: { id: string }): Promise<string> {
      void request;
      callCount += 1;
      return callCount === 1 ? first.promise : second.promise;
    },
  );

  const firstResult = command();
  const secondResult = command();
  jest.advanceTimersByTime(10_000);
  expect(noticeOwner.show).toHaveBeenCalledTimes(2);

  first.resolve('first-result');
  await expect(firstResult).resolves.toBe('first-result');
  expect(noticeOwner.withdraw).toHaveBeenCalledWith('first-request');
  expect(noticeOwner.withdraw).not.toHaveBeenCalledWith('second-request');

  second.resolve('second-result');
  await expect(secondResult).resolves.toBe('second-result');
  expect(noticeOwner.withdraw).toHaveBeenCalledWith('second-request');
});

it('retries a stuck command with the same request id and arguments', async () => {
  jest.useFakeTimers();
  const noticeOwner = notices();
  const first = deferred<string>();
  const retry = deferred<string>();
  const recorder = createCommandRecorder();
  const invoker = createCommandInvoker({
    isReady: (): boolean => true,
    noticeOwner,
    uuid: (): string => 'retry-request',
  });
  let attempt = 0;
  const command = invoker.bind(
    'AppModelHandler.OpenDocument',
    function openDocument(
      request: { id: string },
      expectedRevision: number,
    ): Promise<string> {
      recorder.calls.push({
        name: 'AppModelHandler.OpenDocument',
        requestId: request.id,
        args: [expectedRevision],
      });
      attempt += 1;
      return attempt === 1 ? first.promise : retry.promise;
    },
  );

  const result = command(7);
  jest.advanceTimersByTime(10_000);
  const requestId = recorder.calls[0]?.requestId;
  expect(requestId).toBe('retry-request');

  expect(invoker.retry(requestId ?? '')).toBe(true);
  expect(recorder.calls).toEqual([
    {
      name: 'AppModelHandler.OpenDocument',
      requestId: 'retry-request',
      args: [7],
    },
    {
      name: 'AppModelHandler.OpenDocument',
      requestId: 'retry-request',
      args: [7],
    },
  ]);

  retry.resolve('retried-result');
  await expect(result).resolves.toBe('retried-result');
  first.resolve('late-first-result');
});

it('keeps a cancelled command alive so a late result still settles it silently', async () => {
  jest.useFakeTimers();
  const noticeOwner = notices();
  const pending = deferred<string>();
  const invoker = createCommandInvoker({
    isReady: (): boolean => true,
    noticeOwner,
    uuid: (): string => 'cancel-request',
  });
  const command = invoker.bind(
    'AppModelHandler.GetState',
    function getState(request: { id: string }): Promise<string> {
      void request;
      return pending.promise;
    },
  );

  const result = command();
  jest.advanceTimersByTime(10_000);
  expect(invoker.cancel('cancel-request')).toBe(true);
  expect(noticeOwner.withdraw).toHaveBeenCalledWith('cancel-request');

  pending.resolve('late-result');
  await expect(result).resolves.toBe('late-result');
  expect(noticeOwner.show).toHaveBeenCalledTimes(1);
  expect(noticeOwner.withdraw).toHaveBeenCalledTimes(1);
});
