import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';

import {
  useBootstrap,
  type BootstrapAdapters,
  type BootstrapStep,
} from '../../src/app/useBootstrap';
import type { AppModelBootstrapResult } from '../../src/logic/store/appModelProjection';

interface Deferred<T> {
  promise: Promise<T>;
  reject: (error: unknown) => void;
  resolve: (value: T) => void;
}

function deferred<T>(): Deferred<T> {
  let resolve: (value: T) => void = (): void => undefined;
  let reject: (error: unknown) => void = (): void => undefined;
  const promise = new Promise<T>((resolvePromise, rejectPromise): void => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, reject, resolve };
}

const readyResult: AppModelBootstrapResult = {
  activeBuffer: null,
  applicationVersion: 'test',
  status: 'ready',
};

function adapters(): BootstrapAdapters {
  return {
    appModelAdapter: {} as BootstrapAdapters['appModelAdapter'],
    applicationAdapter: {
      retryStartup: jest.fn(async (): Promise<void> => undefined),
    },
    settingsAdapter: {} as BootstrapAdapters['settingsAdapter'],
    windowAdapter: {
      windowReady: jest.fn(async (): Promise<void> => undefined),
    },
  };
}

function Harness(
  props: Omit<Parameters<typeof useBootstrap>[0], 'loadAdapters'> & {
    loadAdapters: () => Promise<BootstrapAdapters>;
  },
): React.JSX.Element {
  const bootstrap = useBootstrap(props);
  const failure = bootstrap.failure;
  return (
    <>
      <output aria-label="Bootstrap status">{bootstrap.status}</output>
      <output aria-label="Bootstrap failure">
        {failure === null
          ? ''
          : `${failure.step}:${failure.category}:${String(failure.timedOut)}`}
      </output>
      <button type="button" onClick={bootstrap.retry}>
        Retry
      </button>
    </>
  );
}

afterEach((): void => {
  jest.useRealTimers();
});

it.each<BootstrapStep>(['bridge', 'model', 'settings', 'window-ready'])(
  'shows the name of the %s step when it does not answer within ten seconds',
  async (heldStep) => {
    jest.useFakeTimers();
    const services = adapters();
    const loadAdapters =
      heldStep === 'bridge'
        ? jest.fn(() => new Promise<BootstrapAdapters>(() => undefined))
        : jest.fn(async (): Promise<BootstrapAdapters> => services);
    const model =
      heldStep === 'model'
        ? jest.fn(() => new Promise<AppModelBootstrapResult>(() => undefined))
        : jest.fn(async (): Promise<AppModelBootstrapResult> => readyResult);
    const settings =
      heldStep === 'settings'
        ? jest.fn(() => new Promise<void>(() => undefined))
        : jest.fn(async (): Promise<void> => undefined);
    const windowReady =
      heldStep === 'window-ready'
        ? jest.fn(() => new Promise<void>(() => undefined))
        : undefined;
    if (windowReady !== undefined) {
      services.windowAdapter.windowReady = windowReady;
    }

    render(
      <Harness
        bootstrapModel={model}
        bootstrapSettings={settings}
        loadAdapters={loadAdapters}
      />,
    );
    await act(async (): Promise<void> => {
      await Promise.resolve();
      await Promise.resolve();
    });

    act((): void => {
      jest.advanceTimersByTime(10_000);
    });

    await waitFor(() => {
      expect(
        screen.getByRole('status', { name: 'Bootstrap status' }),
      ).toHaveTextContent('failed');
    });
    expect(
      screen.getByRole('status', { name: 'Bootstrap failure' }),
    ).toHaveTextContent(`${heldStep}:`);
  },
);

it('retries only the failed step and ignores a second retry while it is running', async () => {
  const services = adapters();
  const retryModel = deferred<AppModelBootstrapResult>();
  const model = jest
    .fn<() => Promise<AppModelBootstrapResult>>()
    .mockRejectedValueOnce(new Error('model failed'))
    .mockReturnValueOnce(retryModel.promise);
  const settings = jest.fn(async (): Promise<void> => undefined);
  const loadAdapters = jest.fn(
    async (): Promise<BootstrapAdapters> => services,
  );

  render(
    <Harness
      bootstrapModel={model}
      bootstrapSettings={settings}
      loadAdapters={loadAdapters}
    />,
  );
  await waitFor(() => {
    expect(
      screen.getByRole('status', { name: 'Bootstrap status' }),
    ).toHaveTextContent('failed');
  });

  fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
  await act(async (): Promise<void> => {
    await Promise.resolve();
    await Promise.resolve();
  });
  fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
  expect(model).toHaveBeenCalledTimes(2);
  expect(loadAdapters).toHaveBeenCalledTimes(1);

  await act(async (): Promise<void> => {
    retryModel.resolve(readyResult);
    await retryModel.promise;
  });
  expect(
    screen.getByRole('status', { name: 'Bootstrap status' }),
  ).toHaveTextContent('ready');
  expect(settings).toHaveBeenCalledTimes(1);
});

it('ignores the late answer from a timed-out attempt after a fresh retry succeeds', async () => {
  jest.useFakeTimers();
  const services = adapters();
  const abandoned = deferred<AppModelBootstrapResult>();
  const current = deferred<AppModelBootstrapResult>();
  const model = jest
    .fn<() => Promise<AppModelBootstrapResult>>()
    .mockReturnValueOnce(abandoned.promise)
    .mockReturnValueOnce(current.promise);

  render(
    <Harness
      bootstrapModel={model}
      bootstrapSettings={jest.fn(async (): Promise<void> => undefined)}
      loadAdapters={jest.fn(async (): Promise<BootstrapAdapters> => services)}
    />,
  );
  await act(async (): Promise<void> => {
    await Promise.resolve();
    await Promise.resolve();
  });
  act((): void => {
    jest.advanceTimersByTime(10_000);
  });
  await waitFor(() => {
    expect(
      screen.getByRole('status', { name: 'Bootstrap status' }),
    ).toHaveTextContent('failed');
  });

  fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
  await act(async (): Promise<void> => {
    current.resolve(readyResult);
    await current.promise;
  });
  expect(
    screen.getByRole('status', { name: 'Bootstrap status' }),
  ).toHaveTextContent('ready');

  await act(async (): Promise<void> => {
    abandoned.resolve({ status: 'failed' });
    await abandoned.promise;
  });
  expect(
    screen.getByRole('status', { name: 'Bootstrap status' }),
  ).toHaveTextContent('ready');
});

it('uses the startup failure surface for a held pre-ready step without a stuck notice', async () => {
  jest.useFakeTimers();
  const services = adapters();
  const model = deferred<AppModelBootstrapResult>();
  render(
    <Harness
      bootstrapModel={jest.fn(() => model.promise)}
      bootstrapSettings={jest.fn(async (): Promise<void> => undefined)}
      loadAdapters={jest.fn(async (): Promise<BootstrapAdapters> => services)}
    />,
  );
  await act(async (): Promise<void> => {
    await Promise.resolve();
    await Promise.resolve();
  });
  act((): void => {
    jest.advanceTimersByTime(10_000);
  });

  await waitFor(() => {
    expect(
      screen.getByRole('status', { name: 'Bootstrap status' }),
    ).toHaveTextContent('failed');
  });
  expect(
    screen.queryByText(/taking longer than expected/i),
  ).not.toBeInTheDocument();
  void model;
});
