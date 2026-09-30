import type { SettingsAdapter } from '../../../src/logic/adapter/services';
import { store } from '../../../src/logic/store/index';
import { bootstrapSettingsProjection, disposeSettingsProjection } from '../../../src/logic/store/settingsProjection';

afterEach((): void => {
    disposeSettingsProjection();
});

it('hydrates Redux settings once from the acknowledged adapter authority', async () => {
    const adapter: SettingsAdapter = {
        getSettings: jest.fn(async () => ({
            appearance: {
                theme: 'material',
                mode: 'auto',
                defaultOpenMode: 'editor',
            },
            markdown: {
                standard: 'gfm',
                formatOnSave: false,
                lintOnSave: false,
                bulletMarker: '+',
                emphasisMarker: '_',
                headingStyle: 'atx',
            },
            contentPrivacy: { remotePolicy: 'ask' },
            editor: { lineNumbers: false, wordWrap: true, scrollSync: false, fontSize: 13 },
            file: { autosave: false },
        })),
        updateAppearance: jest.fn(),
        resetAppearance: jest.fn(),
        updateContentPrivacy: jest.fn(),
        updateMarkdown: jest.fn(),
        updateEditor: jest.fn(),
        updateFile: jest.fn(),
    };

    await expect(bootstrapSettingsProjection(adapter)).resolves.toBeUndefined();
    await expect(bootstrapSettingsProjection(adapter)).resolves.toBeUndefined();

    expect(adapter.getSettings).toHaveBeenCalledTimes(1);
    expect(store.getState().settings).toMatchObject({
        hydrated: true,
        editor: { lineNumbers: false, wordWrap: true, scrollSync: false, fontSize: 13 },
        file: { autosave: false },
        markdown: { bulletMarker: '+', emphasisMarker: '_' },
    });
});

it('keeps Markdown absent while the settings read is pending or rejected', async () => {
    let rejectRead: ((reason: Error) => void) | undefined;
    const adapter = {
        getSettings: jest.fn(
            () =>
                new Promise<never>((_resolve, reject) => {
                    rejectRead = reject;
                }),
        ),
    } as unknown as SettingsAdapter;
    const pending = bootstrapSettingsProjection(adapter);
    await Promise.resolve();
    expect(store.getState().settings.markdown).toBeUndefined();
    rejectRead?.(new Error('read failed'));
    await expect(pending).rejects.toThrow('read failed');
    expect(store.getState().settings.markdown).toBeUndefined();
});
