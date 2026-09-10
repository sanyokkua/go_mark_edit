import {
  createLifecycleBarrier,
  LifecycleBarrierError,
  type LifecycleCapture,
} from '../../../src/logic/hooks/useLifecycleBarrier';

interface TestView {
  cursor: number;
}

const activationToken = Symbol('activation');

function captureSnapshot(
  content = 'latest content',
  view: TestView = { cursor: 7 },
): LifecycleCapture<string, TestView, symbol> {
  return {
    documentId: 'document-1',
    activationToken,
    content,
    view,
  };
}

it('flushActiveSession accepts latest content and view', async (): Promise<void> => {
  const order: string[] = [];
  const flushBuffer = jest.fn(async (): Promise<void> => {
    order.push('flush-buffer');
  });
  const flushDocView = jest.fn(async (): Promise<void> => {
    order.push('flush-view');
  });
  const queueBuffer = jest.fn(
    async (documentId: string, content: string): Promise<void> => {
      order.push(`queue-buffer:${documentId}:${content}`);
    },
  );
  const queueDocView = jest.fn(
    async (documentId: string, view: TestView): Promise<void> => {
      order.push(`queue-view:${documentId}:${view.cursor}`);
    },
  );
  const barrier = createLifecycleBarrier({
    flushBuffer,
    flushDocView,
    queueBuffer,
    queueDocView,
  });

  const result = await barrier.flushActiveSession(
    'document-1',
    activationToken,
    () => captureSnapshot(),
  );

  expect(result).toEqual(captureSnapshot());
  expect(order).toEqual([
    'queue-buffer:document-1:latest content',
    'queue-view:document-1:7',
    'flush-buffer',
    'flush-view',
  ]);
  expect(queueBuffer).toHaveBeenCalledWith('document-1', 'latest content');
  expect(queueDocView).toHaveBeenCalledWith('document-1', { cursor: 7 });
});

it('one failed queue aborts lifecycle', async (): Promise<void> => {
  const failure = new Error('view queue failed');
  const queueBuffer = jest.fn(async (): Promise<void> => undefined);
  const queueDocView = jest.fn(async (): Promise<void> => {
    throw failure;
  });
  const flushBuffer = jest.fn(async (): Promise<void> => undefined);
  const flushDocView = jest.fn(async (): Promise<void> => undefined);
  const barrier = createLifecycleBarrier({
    flushBuffer,
    flushDocView,
    queueBuffer,
    queueDocView,
  });

  await expect(
    barrier.flushActiveSession('document-1', activationToken, () =>
      captureSnapshot(),
    ),
  ).rejects.toBe(failure);
  expect(flushBuffer).not.toHaveBeenCalled();
  expect(flushDocView).not.toHaveBeenCalled();
});

it('immediate Save waits for pending keystroke', async (): Promise<void> => {
  let releaseBufferQueue: (() => void) | undefined;
  const queueBuffer = jest.fn(
    (): Promise<void> =>
      new Promise<void>((resolve): void => {
        releaseBufferQueue = resolve;
      }),
  );
  const flushBuffer = jest.fn(async (): Promise<void> => undefined);
  const flushDocView = jest.fn(async (): Promise<void> => undefined);
  const barrier = createLifecycleBarrier({
    flushBuffer,
    flushDocView,
    queueBuffer,
  });

  let settled = false;
  const save = barrier
    .flushActiveSession('document-1', activationToken, () =>
      captureSnapshot('keystroke not yet flushed'),
    )
    .then((): void => {
      settled = true;
    });

  await Promise.resolve();
  expect(settled).toBe(false);
  expect(flushBuffer).not.toHaveBeenCalled();

  releaseBufferQueue?.();
  await save;

  expect(settled).toBe(true);
  expect(flushBuffer).toHaveBeenCalledWith('document-1');
  expect(flushDocView).toHaveBeenCalledWith('document-1');
});

it('rejects a capture from a different document before queueing', async (): Promise<void> => {
  const queueBuffer = jest.fn(async (): Promise<void> => undefined);
  const queueDocView = jest.fn(async (): Promise<void> => undefined);
  const barrier = createLifecycleBarrier({
    flushBuffer: async (): Promise<void> => undefined,
    flushDocView: async (): Promise<void> => undefined,
    queueBuffer,
    queueDocView,
  });

  await expect(
    barrier.flushActiveSession('document-1', activationToken, () => ({
      ...captureSnapshot(),
      documentId: 'document-2',
    })),
  ).rejects.toMatchObject<Partial<LifecycleBarrierError>>({
    code: 'document-mismatch',
  });
  expect(queueBuffer).not.toHaveBeenCalled();
  expect(queueDocView).not.toHaveBeenCalled();
});

it('rejects a capture from a different activation before queueing', async (): Promise<void> => {
  const otherToken = Symbol('other-activation');
  const queueBuffer = jest.fn(async (): Promise<void> => undefined);
  const queueDocView = jest.fn(async (): Promise<void> => undefined);
  const barrier = createLifecycleBarrier({
    flushBuffer: async (): Promise<void> => undefined,
    flushDocView: async (): Promise<void> => undefined,
    queueBuffer,
    queueDocView,
  });

  await expect(
    barrier.flushActiveSession('document-1', activationToken, () => ({
      ...captureSnapshot(),
      activationToken: otherToken,
    })),
  ).rejects.toMatchObject<Partial<LifecycleBarrierError>>({
    code: 'activation-mismatch',
  });
  expect(queueBuffer).not.toHaveBeenCalled();
  expect(queueDocView).not.toHaveBeenCalled();
});
