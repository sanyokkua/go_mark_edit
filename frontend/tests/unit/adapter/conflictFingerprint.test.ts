jest.mock('wailsjs/go/appmodel/AppModelHandler', () => ({
    ...jest.requireActual('wailsjs/go/appmodel/AppModelHandler'),
    CheckExternalChanges: jest.fn(async function check(request, documentId) {
        void request;
        void documentId;
        return {
            status: 'detected',
            preview: {
                documentId: 'one',
                contentRevision: 0,
                readOnly: false,
                detectedDiskVersion: { exists: true, size: 5, mode: 420, modifiedUnixNano: 200, rawHash: 'abc' },
                onDisk: { text: 'disk', byteCount: 4, lineCount: 1 },
                yours: { text: 'mine', byteCount: 4, lineCount: 1 },
            },
        };
    }),
    SkipConflict: jest.fn(async function skip(request, documentId, revision, version) {
        void request;
        void documentId;
        void revision;
        void version;
        return { status: 'skipped' };
    }),
}));

import { SkipConflict } from 'wailsjs/go/appmodel/AppModelHandler';
import { documentConflictAdapter } from '../../../src/logic/adapter';
import { setBootstrapStatus } from '../../../src/logic/adapter/command';

it('preserves the raw disk fingerprint through the comparison and decision bridge', async () => {
    setBootstrapStatus('ready');
    const result = await documentConflictAdapter.checkExternalChanges('one');
    expect(result.preview?.detectedDiskVersion).toMatchObject({ rawHash: 'abc' });
    await documentConflictAdapter.skipConflict('one', 0, result.preview!.detectedDiskVersion);
    expect(SkipConflict).toHaveBeenCalledWith(expect.anything(), 'one', 0, expect.objectContaining({ rawHash: 'abc' }));
});
