import { fireEvent, render } from '@testing-library/react';
import { useState } from 'react';

import MarkdownView from '../../../src/ui/components/MarkdownView';

const mockRenderCount = { value: 0 };

jest.mock('react-markdown', () => ({
  __esModule: true,
  default: ({ children }: { children: string }): React.JSX.Element => {
    mockRenderCount.value += 1;
    return <div data-testid="markdown">{children}</div>;
  },
}));

function Parent({ source }: { source: string }): React.JSX.Element {
  const [, setTick] = useState(0);
  return (
    <div>
      <button type="button" onClick={(): void => setTick((n) => n + 1)}>
        re-render
      </button>
      <MarkdownView source={source} />
    </div>
  );
}

beforeEach((): void => {
  mockRenderCount.value = 0;
});

/*
 * Lives in its own file because it stubs `react-markdown` to count renders,
 * and `MarkdownView.test.tsx` beside it needs the real renderer to assert what
 * GFM actually produces. One mock would silently gut the other file's six
 * cases — which is not hypothetical: an earlier pass overwrote that file
 * outright and the suite total fell by four while still reporting all green.
 *
 * . `PreviewPane` renders `MarkdownView`, and `EditorView` hands the pane an
 * inline `onRefresh` arrow, so the pane received a fresh prop identity on every
 * parent render. Neither component was memoized, so every `EditorView` render
 * re-ran the whole GFM pipeline over the document.
 *
 * That is invisible on a small note and decisive at the size requires
 * live preview to keep working at: the shipped component takes about 1.5 s to
 * render 2 MiB of ordinary short-line prose under WebKit. Paying that per
 * keystroke is the difference between an editor and a stopwatch.
 *
 * This does NOT claim to close the multi-minute host stall recorded in
 * `evidence/ft-ev-09/host-walkthrough-2026-08-19/`. That has a different
 * profile — inside a timer-dispatched event listener, not a render — and it was
 * never reproduced outside the packaged app. This removes a separately measured
 * cost.
 */
// pipeline when a parent re-renders without changing the document.)
it('does not re-parse the document when a parent re-renders with the same source', () => {
  const { getByText } = render(<Parent source={'# title\n\nbody\n'} />);
  expect(mockRenderCount.value).toBe(1);

  /*
   * fireEvent, not the DOM's own `.click()`: a bare click leaves the state
   * update unflushed outside `act()`, so the parent never re-renders and this
   * assertion passes without proving anything. The first draft did exactly that
   * and passed against the unmemoized component. With fireEvent it failed
   * `Expected: 1, Received: 3`.
   */
  fireEvent.click(getByText('re-render'));
  fireEvent.click(getByText('re-render'));

  expect(mockRenderCount.value).toBe(1);
});

it('re-parses when the source actually changes', () => {
  const { rerender, getByTestId } = render(<MarkdownView source={'# one\n'} />);
  expect(mockRenderCount.value).toBe(1);

  rerender(<MarkdownView source={'# two\n'} />);

  expect(mockRenderCount.value).toBe(2);
  expect(getByTestId('markdown')).toHaveTextContent('# two');
});
