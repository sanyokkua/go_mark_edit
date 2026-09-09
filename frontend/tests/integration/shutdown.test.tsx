import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { useShutdown } from '../../src/app/useShutdown';
import type { NativeLifecycleAdapter } from '../../src/logic/adapter';
import type { AppModelState } from '../../src/logic/store/appModelTypes';

interface Deferred {
  promise: Promise<void>;
  resolve: () => void;
}

function deferred(): Deferred {
  let resolve: () => void = (): void => undefined;
  const promise = new Promise<void>((resolvePromise): void => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

function nativeAdapter(): NativeLifecycleAdapter & {
  emit: (closeID?: string) => void;
} {
  let listener: ((closeID?: string) => void) | undefined;
  return {
    onCloseRequested: (nextListener): (() => void) => {
      listener = nextListener;
      return (): void => {
        listener = undefined;
      };
    },
    emit: (closeID): void => listener?.(closeID),
    requestQuit: jest.fn(),
    authorizeQuit: jest.fn(async () => undefined),
    cancelQuit: jest.fn(async () => undefined),
  };
}

function stateWithPendingClose(closeID: string): AppModelState {
  return {
    snapshot: {
      revision: 1,
      documents: {},
      activeDocumentId: null,
      ui: {},
      pendingClose: { id: closeID },
    },
    activeBuffer: null,
  };
}

function Harness(props: {
  bootstrapStatus: 'loading' | 'ready' | 'failed';
  native: NativeLifecycleAdapter;
  onRequest: (closeID: string) => void;
  hydratedPendingCloseId?: string | null;
  hydratedState?: AppModelState;
}): React.JSX.Element {
  const shutdown = useShutdown({
    bootstrapStatus: props.bootstrapStatus,
    dependencies: { native: props.native },
    hydratedPendingCloseId: props.hydratedPendingCloseId,
    hydratedState: props.hydratedState,
    onRequest: props.onRequest,
  });
  return (
    <>
      <output aria-label="Pending close">{shutdown.pendingClose ?? ''}</output>
      <button type="button" onClick={(): void => void shutdown.cancelQuit()}>
        Cancel
      </button>
    </>
  );
}

it('buffers a close event before readiness and handles it after readiness', async () => {
  const native = nativeAdapter();
  const onRequest = jest.fn();
  const view = render(
    <Harness
      bootstrapStatus="loading"
      hydratedPendingCloseId={null}
      native={native}
      onRequest={onRequest}
    />,
  );

  act((): void => native.emit('early-close'));
  expect(onRequest).not.toHaveBeenCalled();

  view.rerender(
    <Harness
      bootstrapStatus="ready"
      hydratedPendingCloseId={null}
      native={native}
      onRequest={onRequest}
    />,
  );

  await waitFor(() => expect(onRequest).toHaveBeenCalledWith('early-close'));
  expect(
    screen.getByRole('status', { name: 'Pending close' }),
  ).toHaveTextContent('early-close');
});

it('handles a pending close discovered in the hydrated state', async () => {
  const native = nativeAdapter();
  const onRequest = jest.fn();
  render(
    <Harness
      bootstrapStatus="ready"
      hydratedState={stateWithPendingClose('hydrated-close')}
      native={native}
      onRequest={onRequest}
    />,
  );

  await waitFor(() => expect(onRequest).toHaveBeenCalledWith('hydrated-close'));
  expect(
    screen.getByRole('status', { name: 'Pending close' }),
  ).toHaveTextContent('hydrated-close');
});

it('keeps the pending close visible until cancellation is acknowledged', async () => {
  const native = nativeAdapter();
  const cancellation = deferred();
  native.cancelQuit = jest.fn(() => cancellation.promise);
  const onRequest = jest.fn();
  render(
    <Harness
      bootstrapStatus="ready"
      hydratedPendingCloseId={null}
      native={native}
      onRequest={onRequest}
    />,
  );

  act((): void => native.emit('cancel-close'));
  await waitFor(() => expect(onRequest).toHaveBeenCalledWith('cancel-close'));
  fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

  expect(
    screen.getByRole('status', { name: 'Pending close' }),
  ).toHaveTextContent('cancel-close');
  act((): void => cancellation.resolve());
  await waitFor(() =>
    expect(
      screen.getByRole('status', { name: 'Pending close' }),
    ).toHaveTextContent(''),
  );
  expect(native.cancelQuit).toHaveBeenCalledWith('cancel-close');
});
