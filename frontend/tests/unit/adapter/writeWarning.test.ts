import { documentWriteAdapter } from '../../../src/logic/adapter';

it.each(['durability', 'recent-items', 'view-state'] as const)(
    'normalizes a committed %s warning from the Wails bridge',
    async (warning) => {
        const root = window as unknown as { go: unknown };
        const previous = root.go;
        root.go = {
            appmodel: { AppModelHandler: { Save: jest.fn().mockResolvedValue({ status: 'committed', warning }) } },
        };
        try {
            await expect(documentWriteAdapter.save('doc', 1, '')).resolves.toMatchObject({
                status: 'committed',
                warning,
            });
        } finally {
            root.go = previous;
        }
    },
);

it.each(['metadata-stat', 'readback', 'content-mismatch', 'directory-sync', 'unknown'])(
    'normalizes the committed warning reason %s from the bridge',
    async (reason) => {
        const root = window as unknown as { go: unknown };
        const previous = root.go;
        root.go = {
            appmodel: {
                AppModelHandler: {
                    Save: jest
                        .fn()
                        .mockResolvedValue({ status: 'committed', warning: 'durability', warningReason: reason }),
                },
            },
        };
        try {
            const result = await documentWriteAdapter.save('doc', 1, '');
            expect(result.warningReason).toBe(reason === 'unknown' ? undefined : reason);
        } finally {
            root.go = previous;
        }
    },
);
