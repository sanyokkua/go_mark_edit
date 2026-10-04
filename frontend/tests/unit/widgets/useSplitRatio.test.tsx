import { act, renderHook } from '@testing-library/react';
import type { PropsWithChildren } from 'react';
import { Provider } from 'react-redux';

import { store } from '../../../src/logic/store';
import { useSplitRatio } from '../../../src/ui/widgets/EditorStage/useSplitRatio';

const view = {
    arrangement: 'split',
    editorVisible: true,
    previewVisible: true,
    cursor: { line: 1, column: 1 },
    selection: { start: { line: 1, column: 1 }, end: { line: 1, column: 1 } },
    scroll: { editor: 0, preview: 0 },
};

function wrapper({ children }: PropsWithChildren): React.JSX.Element {
    return <Provider store={store}>{children}</Provider>;
}

it('keeps the newest resize visible while older backend acknowledgements arrive', async () => {
    const completions: (() => void)[] = [];
    const setDocView = jest.fn(
        () =>
            new Promise<void>((resolve) => {
                completions.push(resolve);
            }),
    );
    const { result, rerender } = renderHook(
        ({ ratio }) => useSplitRatio('one', { ...view, splitRatio: ratio }, setDocView),
        { wrapper, initialProps: { ratio: 0.5 } },
    );
    act(() => {
        result.current.resize(0.52);
        result.current.commit(0.52);
    });
    act(() => {
        result.current.resize(0.54);
        result.current.commit(0.54);
    });
    rerender({ ratio: 0.52 });
    expect(result.current.ratio).toBe(0.54);
    await act(async () => {
        completions[0]();
    });
    expect(result.current.ratio).toBe(0.54);
    act(() => {
        const next = result.current.ratio + 0.02;
        result.current.resize(next);
        result.current.commit(next);
    });
    expect(result.current.ratio).toBeCloseTo(0.56);
    rerender({ ratio: 0.54 });
    await act(async () => {
        completions[1]();
    });
    expect(result.current.ratio).toBeCloseTo(0.56);
    await act(async () => {
        completions[2]();
    });
    expect(result.current.ratio).toBeCloseTo(0.56);
    rerender({ ratio: 0.56 });
    expect(result.current.ratio).toBe(0.56);
    // Once the latest acknowledged command settles, canonical changes are observable.
    rerender({ ratio: 0.6 });
    expect(result.current.ratio).toBe(0.6);
});
