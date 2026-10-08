import { fireEvent, render, waitFor } from '@testing-library/react';

import { createShellActionCatalogue } from '../../../src/logic/actions/shellActions';
import { useShellShortcuts, type ShortcutAction } from '../../../src/logic/actions/useShellShortcuts';

const toggleFullscreen = jest.fn(async (): Promise<boolean> => true);
const toggleSidebar = jest.fn();

function Harness({ modalOpen }: { modalOpen: boolean }): null {
    useShellShortcuts(
        createShellActionCatalogue({
            modalOpen,
            viewAvailable: true,
            openSettings: jest.fn(),
            openView: jest.fn(),
            openAbout: jest.fn(),
            toggleSidebar,
            toggleFullscreen,
        }),
    );
    return null;
}

it('routes F11 through the catalogue and suppresses it under modality', () => {
    const { rerender } = render(<Harness modalOpen={false} />);

    fireEvent.keyDown(window, { key: 'F11' });
    expect(toggleFullscreen).toHaveBeenCalledTimes(1);

    rerender(<Harness modalOpen />);
    fireEvent.keyDown(window, { key: 'F11' });
    expect(toggleFullscreen).toHaveBeenCalledTimes(1);
});

it('routes Mod+\\ Toggle Sidebar through the same catalogue', () => {
    render(<Harness modalOpen={false} />);

    fireEvent.keyDown(window, { key: '\\', ctrlKey: true });

    expect(toggleSidebar).toHaveBeenCalledTimes(1);
});

it('routes the physical shifted Settings binding through the shell catalogue', () => {
    const openSettings = jest.fn();
    function SettingsHarness(): null {
        useShellShortcuts(
            createShellActionCatalogue({
                modalOpen: false,
                viewAvailable: true,
                openSettings,
                openView: jest.fn(),
                openAbout: jest.fn(),
                toggleFullscreen,
            }),
        );
        return null;
    }

    render(<SettingsHarness />);
    fireEvent.keyDown(window, {
        code: 'Comma',
        key: '<',
        ctrlKey: true,
    });

    expect(openSettings).toHaveBeenCalledTimes(1);
});

it('routes the Keyboard shortcuts binding through the canonical catalogue', () => {
    const openShortcuts = jest.fn();
    function ShortcutsHarness(): null {
        useShellShortcuts(
            createShellActionCatalogue({
                modalOpen: false,
                viewAvailable: true,
                openSettings: jest.fn(),
                openView: jest.fn(),
                openAbout: jest.fn(),
                openShortcuts,
                toggleFullscreen,
            }),
        );
        return null;
    }

    render(<ShortcutsHarness />);
    fireEvent.keyDown(window, {
        code: 'Slash',
        key: '?',
        ctrlKey: true,
        shiftKey: true,
    });

    expect(openShortcuts).toHaveBeenCalledTimes(1);
});

it('suppresses F11, Settings, and Toggle Sidebar while a modal is open', () => {
    const openSettings = jest.fn();
    const modalToggleSidebar = jest.fn();
    function ModalHarness(): null {
        useShellShortcuts(
            createShellActionCatalogue({
                modalOpen: true,
                viewAvailable: true,
                openSettings,
                openView: jest.fn(),
                openAbout: jest.fn(),
                toggleSidebar: modalToggleSidebar,
                toggleFullscreen,
            }),
        );
        return null;
    }

    render(<ModalHarness />);
    fireEvent.keyDown(window, { key: 'F11' });
    fireEvent.keyDown(window, { code: 'Comma', key: ',', ctrlKey: true });
    fireEvent.keyDown(window, {
        code: 'Backslash',
        key: '\\',
        ctrlKey: true,
    });

    expect(toggleFullscreen).not.toHaveBeenCalled();
    expect(openSettings).not.toHaveBeenCalled();
    expect(modalToggleSidebar).not.toHaveBeenCalled();
});

it('routes canonical file/tab shortcuts through typed actions', () => {
    const invoke = jest.fn(async () => ({ status: 'closed' }));
    const action: ShortcutAction = {
        id: 'close-tab',
        invoke,
        isAvailable: () => true,
        shortcut: 'Mod+W',
        dispatchContext: {
            applicationFocused: true,
            documentId: 'doc-1',
            projectedState: {
                activeDocumentId: 'doc-1',
                orderedDocumentIds: ['doc-1', 'doc-2'],
                documents: { 'doc-1': { capability: 'writable' } },
            },
        },
    };

    function CanonicalHarness(): null {
        useShellShortcuts([action]);
        return null;
    }

    render(<CanonicalHarness />);
    fireEvent.keyDown(window, { key: 'w', ctrlKey: true });

    expect(invoke).toHaveBeenCalledTimes(1);
});

function ReadingHarness({ documentOpen, toggleReading }: { documentOpen: boolean; toggleReading: () => void }): null {
    useShellShortcuts(
        createShellActionCatalogue({
            modalOpen: false,
            viewAvailable: true,
            openSettings: jest.fn(),
            openView: jest.fn(),
            openAbout: jest.fn(),
            toggleFullscreen,
            toggleReading,
            documentOpen,
        }),
    );
    return null;
}

it('toggles Reading mode on Ctrl+Enter only while a document is open', async () => {
    const toggleReading = jest.fn();
    const { rerender } = render(<ReadingHarness documentOpen={false} toggleReading={toggleReading} />);

    fireEvent.keyDown(window, { key: 'Enter', code: 'Enter', ctrlKey: true });
    expect(toggleReading).not.toHaveBeenCalled();

    rerender(<ReadingHarness documentOpen toggleReading={toggleReading} />);
    fireEvent.keyDown(window, { key: 'Enter', code: 'Enter', ctrlKey: true });
    await waitFor(() => expect(toggleReading).toHaveBeenCalledTimes(1));
});

it('ignores a key combination the focused control already handled', () => {
    const toggleReading = jest.fn();
    render(<ReadingHarness documentOpen toggleReading={toggleReading} />);
    const input = document.createElement('input');
    document.body.append(input);
    input.addEventListener('keydown', (event) => event.preventDefault());

    fireEvent.keyDown(input, { key: 'Enter', code: 'Enter', ctrlKey: true });

    expect(toggleReading).not.toHaveBeenCalled();
    input.remove();
});

describe('Export to PDF shortcut', () => {
    function ExportHarness({ available, invoke }: { available: boolean; invoke: () => void }): null {
        useShellShortcuts([
            {
                id: 'export-pdf',
                invoke,
                isAvailable: (): boolean => available,
                shortcut: 'Mod+P',
                dispatchContext: { applicationFocused: true, documentId: 'doc-1', writable: true },
            },
            { id: 'save', invoke: jest.fn(), isAvailable: (): boolean => false, shortcut: 'Mod+S' },
        ]);
        return null;
    }

    it('prevents the webview default for Mod+P even when Export is unavailable, and runs nothing', () => {
        const invoke = jest.fn();
        render(<ExportHarness available={false} invoke={invoke} />);

        const notCancelled = fireEvent.keyDown(window, { key: 'p', code: 'KeyP', ctrlKey: true });

        expect(notCancelled).toBe(false);
        expect(invoke).not.toHaveBeenCalled();
    });

    it('invokes Export once for Mod+P when it is available', async () => {
        const invoke = jest.fn();
        render(<ExportHarness available invoke={invoke} />);

        const notCancelled = fireEvent.keyDown(window, { key: 'p', code: 'KeyP', ctrlKey: true });

        expect(notCancelled).toBe(false);
        await waitFor(() => expect(invoke).toHaveBeenCalledTimes(1));
    });

    it('leaves other unavailable shortcuts to the webview', () => {
        render(<ExportHarness available invoke={jest.fn()} />);

        expect(fireEvent.keyDown(window, { key: 's', code: 'KeyS', ctrlKey: true })).toBe(true);
    });
});
