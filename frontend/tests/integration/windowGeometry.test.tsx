import { fireEvent, renderHook } from '@testing-library/react';

jest.mock('../../src/logic/adapter', () => ({
    appModelAdapter: { setUILayout: jest.fn() },
    windowAdapter: { getNativeGeometry: jest.fn() },
}));

import { windowAdapter } from '../../src/logic/adapter';
import { useWindowGeometry } from '../../src/app/useWindowGeometry';
import { createCommandRecorder } from '../support/commandRecorder';

it('subscribes to resize only while ready and disposes the native geometry listener', () => {
    const recorder = createCommandRecorder();
    const read = recorder.binding('GetNativeGeometry');
    (windowAdapter.getNativeGeometry as jest.Mock).mockImplementation(() => read({ id: 'geometry' }));
    const owner = renderHook(({ status }: { status: 'loading' | 'ready' | 'failed' }) => useWindowGeometry(status), {
        initialProps: { status: 'loading' },
    });
    fireEvent.resize(window);
    expect(recorder.calls).toHaveLength(0);
    owner.rerender({ status: 'ready' });
    fireEvent.resize(window);
    expect(recorder.calls).toEqual([{ name: 'GetNativeGeometry', requestId: 'geometry', args: [] }]);
    owner.rerender({ status: 'failed' });
    fireEvent.resize(window);
    expect(recorder.calls).toHaveLength(1);
    owner.rerender({ status: 'ready' });
    owner.unmount();
    fireEvent.resize(window);
    expect(recorder.calls).toHaveLength(1);
});
