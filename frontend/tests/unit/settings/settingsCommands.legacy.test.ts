import type { EditorSettings, FileSettings, MarkdownSettings } from '../../../src/logic/adapter/settingsTypes';
import {
    acknowledgeEditorSettingsUpdate,
    acknowledgeFileSettingsUpdate,
    acknowledgeMarkdownSettingsUpdate,
} from '../../../src/logic/settings/settingsCommands';

const currentEditor: EditorSettings = {
    lineNumbers: true,
    wordWrap: false,
    scrollSync: true,
    fontSize: 14,
};
const currentMarkdown: MarkdownSettings = {
    standard: 'gfm',
    formatOnSave: false,
    lintOnSave: false,
    bulletMarker: '-',
    emphasisMarker: '*',
    headingStyle: 'atx',
};
const currentFile: FileSettings = { autosave: true };

it('retains editor projection on a rejected backend acknowledgement', async () => {
    const dispatch = jest.fn();
    const adapter = {
        updateEditor: jest.fn().mockRejectedValue(new Error('write failed')),
    };

    await expect(acknowledgeEditorSettingsUpdate(adapter, currentEditor, { fontSize: 16 }, dispatch)).rejects.toThrow(
        'write failed',
    );
    expect(dispatch).not.toHaveBeenCalled();
});

it('persists the whole Markdown group and projects a new standard only after acknowledgement', async () => {
    const dispatch = jest.fn();
    let release: (() => void) | undefined;
    const adapter = {
        updateMarkdown: jest.fn(
            () =>
                new Promise<void>((resolve) => {
                    release = resolve;
                }),
        ),
    };
    const next = { ...currentMarkdown, standard: 'full' as const };

    const update = acknowledgeMarkdownSettingsUpdate(adapter, currentMarkdown, { standard: 'full' }, dispatch);
    expect(adapter.updateMarkdown).toHaveBeenCalledTimes(1);
    expect(adapter.updateMarkdown).toHaveBeenCalledWith(next);
    expect(dispatch).not.toHaveBeenCalled();
    release?.();
    await update;
    expect(dispatch).toHaveBeenCalledTimes(1);
    expect(dispatch.mock.calls[0]?.[0]).toMatchObject({
        payload: next,
    });
});

it('does not write a Markdown group before it has loaded', async () => {
    const dispatch = jest.fn();
    const adapter = { updateMarkdown: jest.fn() };
    await acknowledgeMarkdownSettingsUpdate(adapter, undefined, { bulletMarker: '+' }, dispatch);
    expect(adapter.updateMarkdown).not.toHaveBeenCalled();
    expect(dispatch).not.toHaveBeenCalled();
});

it('keeps the acknowledged standard when persistence fails', async () => {
    const dispatch = jest.fn();
    const adapter = { updateMarkdown: jest.fn().mockRejectedValue(new Error('write failed')) };
    await expect(
        acknowledgeMarkdownSettingsUpdate(adapter, currentMarkdown, { standard: 'minimal' }, dispatch),
    ).rejects.toThrow('write failed');
    expect(dispatch).not.toHaveBeenCalled();
});

it('autosave setting is acknowledged before it applies', async () => {
    const dispatch = jest.fn();
    let resolveUpdate: (() => void) | undefined;
    const adapter = {
        updateFile: jest.fn(
            () =>
                new Promise<void>((resolve) => {
                    resolveUpdate = resolve;
                }),
        ),
    };
    const update = acknowledgeFileSettingsUpdate(adapter, currentFile, { autosave: false }, dispatch);

    await Promise.resolve();
    expect(dispatch).not.toHaveBeenCalled();
    resolveUpdate?.();
    await update;
    expect(dispatch).toHaveBeenCalledWith({
        type: 'settings/acknowledgeFileSettings',
        payload: { autosave: false },
    });
});

it('keeps acknowledged autosave unchanged when persistence rejects', async () => {
    const dispatch = jest.fn();
    const adapter = {
        updateFile: jest.fn().mockRejectedValue(new Error('write failed')),
    };

    await expect(acknowledgeFileSettingsUpdate(adapter, currentFile, { autosave: false }, dispatch)).rejects.toThrow(
        'write failed',
    );
    expect(dispatch).not.toHaveBeenCalled();
});
