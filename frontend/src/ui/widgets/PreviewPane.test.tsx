import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';

import PreviewPane, {
  PREVIEW_BYTE_LIMIT,
  type PreviewSnapshot,
} from './PreviewPane';

function snapshot(
  revision: number,
  content: string,
  byteLength: number,
): PreviewSnapshot {
  return { revision, content, byteLength };
}

function deferred<T>(): {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (reason?: unknown) => void;
} {
  let resolvePromise!: (value: T) => void;
  let rejectPromise!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolve, reject): void => {
    resolvePromise = resolve;
    rejectPromise = reject;
  });

  return { promise, resolve: resolvePromise, reject: rejectPromise };
}

it('renders at the inclusive 2 MiB boundary and pauses above it', async () => {
  const refresh = jest.fn<Promise<PreviewSnapshot>, []>(async () =>
    snapshot(2, '# refreshed', PREVIEW_BYTE_LIMIT + 1),
  );

  const { rerender } = render(
    <PreviewPane
      accepted={snapshot(1, '# exactly 2 MiB', PREVIEW_BYTE_LIMIT)}
      onRefresh={refresh}
    />,
  );

  expect(screen.getByText('exactly 2 MiB')).toBeInTheDocument();
  expect(screen.queryByText(/preview paused/i)).not.toBeInTheDocument();

  rerender(
    <PreviewPane
      accepted={snapshot(2, '# over 2 MiB', PREVIEW_BYTE_LIMIT + 1)}
      onRefresh={refresh}
    />,
  );

  await waitFor(() => {
    expect(screen.getByText(/live preview is paused/i)).toBeInTheDocument();
  });
  expect(screen.getByRole('button', { name: 'Refresh preview' })).toBeVisible();
  expect(screen.queryByText('over 2 MiB')).not.toBeInTheDocument();
});

it('T064 presents source-backed paused preview chrome above the pane content', () => {
  render(
    <PreviewPane
      accepted={snapshot(2, '# over 2 MiB', PREVIEW_BYTE_LIMIT + 1)}
      onRefresh={jest.fn(async () => snapshot(2, '', PREVIEW_BYTE_LIMIT + 1))}
    />,
  );

  const paused = screen.getByRole('status');
  expect(paused).toHaveAttribute('data-preview-paused-bar', 'true');
  expect(paused.textContent).toContain(
    'Live preview is paused — this document is over 2\u00a0MB.',
  );
  expect(
    within(paused).getByRole('button', { name: 'Refresh preview' }),
  ).toBeEnabled();
});

it('renders the accepted revision once and coalesces duplicate refresh requests', async () => {
  const pending = deferred<PreviewSnapshot>();
  const refresh = jest.fn<Promise<PreviewSnapshot>, []>(() => pending.promise);

  render(
    <PreviewPane
      accepted={snapshot(17, '# accepted revision 17', PREVIEW_BYTE_LIMIT + 1)}
      onRefresh={refresh}
    />,
  );

  const refreshButton = screen.getByRole('button', { name: 'Refresh preview' });
  fireEvent.click(refreshButton);
  expect(refreshButton).toHaveAttribute('aria-busy', 'true');
  expect(refreshButton).toBeDisabled();
  fireEvent.click(refreshButton);
  expect(refresh).toHaveBeenCalledTimes(1);

  pending.resolve(
    snapshot(17, '# accepted revision 17', PREVIEW_BYTE_LIMIT + 1),
  );

  await waitFor(() => {
    expect(screen.getByText('accepted revision 17')).toBeInTheDocument();
  });
  expect(screen.getByRole('region', { name: 'Preview pane' })).toHaveAttribute(
    'data-preview-revision',
    '17',
  );
});

it('re-pauses after the next accepted edit above the limit', async () => {
  const refresh = jest.fn(async () =>
    snapshot(21, '# accepted revision 21', PREVIEW_BYTE_LIMIT + 1),
  );
  const { rerender } = render(
    <PreviewPane
      accepted={snapshot(21, '# accepted revision 21', PREVIEW_BYTE_LIMIT + 1)}
      onRefresh={refresh}
    />,
  );

  fireEvent.click(screen.getByRole('button', { name: 'Refresh preview' }));
  await waitFor(() => {
    expect(screen.getByText('accepted revision 21')).toBeInTheDocument();
  });

  rerender(
    <PreviewPane
      accepted={snapshot(22, '# accepted revision 22', PREVIEW_BYTE_LIMIT + 1)}
      onRefresh={refresh}
    />,
  );

  await waitFor(() => {
    expect(screen.getByText(/live preview is paused/i)).toBeInTheDocument();
  });
  expect(screen.queryByText('accepted revision 21')).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Refresh preview' })).toBeVisible();
});

it('keeps a failed refresh paused, classifies io-failure, and offers Retry', async () => {
  const pending = deferred<PreviewSnapshot>();
  const refresh = jest.fn<Promise<PreviewSnapshot>, []>(() => pending.promise);

  render(
    <PreviewPane
      accepted={snapshot(31, '# accepted revision 31', PREVIEW_BYTE_LIMIT + 1)}
      onRefresh={refresh}
    />,
  );

  const refreshButton = screen.getByRole('button', { name: 'Refresh preview' });
  fireEvent.click(refreshButton);
  fireEvent.click(refreshButton);
  expect(refresh).toHaveBeenCalledTimes(1);

  pending.reject({ code: 'io-failure', message: 'disk read failed' });

  await waitFor(() => {
    expect(screen.getByRole('button', { name: 'Retry' })).toBeVisible();
  });
  expect(screen.getByRole('alert')).toHaveAttribute(
    'data-error-code',
    'io-failure',
  );
  expect(screen.getByText(/preview refresh failed/i)).toBeInTheDocument();
  expect(screen.queryByText('accepted revision 31')).not.toBeInTheDocument();
});

it('does not render a stale refresh result for a newer accepted revision', async () => {
  const pending = deferred<PreviewSnapshot>();
  const refresh = jest.fn<Promise<PreviewSnapshot>, []>(() => pending.promise);
  const { rerender } = render(
    <PreviewPane
      accepted={snapshot(41, '# stale revision', PREVIEW_BYTE_LIMIT + 1)}
      onRefresh={refresh}
    />,
  );

  fireEvent.click(screen.getByRole('button', { name: 'Refresh preview' }));
  rerender(
    <PreviewPane
      accepted={snapshot(42, '# current revision', PREVIEW_BYTE_LIMIT + 1)}
      onRefresh={refresh}
    />,
  );
  pending.resolve(snapshot(41, '# stale revision', PREVIEW_BYTE_LIMIT + 1));

  await waitFor(() => {
    expect(screen.getByText(/live preview is paused/i)).toBeInTheDocument();
  });
  expect(screen.queryByText('stale revision')).not.toBeInTheDocument();
  expect(screen.queryByText('current revision')).not.toBeInTheDocument();
});

/*
 * T173. Two `T045 …` cases were removed here: one asserting the preview showed
 * "We are excited to announce the new release…" on `?parity-case`, and one
 * asserting the correction survived a typo split across a source line wrap.
 *
 * Both were true, and both described a rewrite that only existed on the route.
 * `PreviewPane` ran seven `replaceAll()` calls over the document's text in its
 * render path, correcting the fixture's misspellings before rendering — a
 * production component rendering different *content* on the parity route, which
 * FR-FT-054 does not permit.
 *
 * The misspellings are load-bearing rather than accidental: the mockup shows a
 * lint squiggle under "exited". So the fixture was right and the correction was
 * the invention. The difference now lives where FR-FT-056 puts it — the
 * reference adapter's IN_SCOPE_PREVIEW_CONTENT carries what the application
 * actually renders, and the adapter version is bumped to v4 to say so.
 */
