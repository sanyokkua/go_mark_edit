import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useState } from 'react';
import { Provider } from 'react-redux';

import type { EditorActionSnapshot } from '../../src/logic/actions/editorActionExecutor';
import { store } from '../../src/logic/store';
import { hydrateProjection, resetProjection } from '../../src/logic/store/appModelProjectionActions';
import { hydrateSettings } from '../../src/logic/store/settingsSlice';
import InsertTableDialog from '../../src/ui/widgets/dialogs/InsertTableDialog';
import { DocumentCommandContext, EditorSessionContext } from '../../src/ui/widgets/editorSession';
import FormattingToolbar from '../../src/ui/widgets/FormattingToolbar/FormattingToolbar';
import { InsertTableRequestContext } from '../../src/ui/widgets/insertTableRequest';
import { ModalStateContext } from '../../src/ui/widgets/modalStateContext';
import { documentFixture } from '../support/appFixtures';
import { loadedMarkdownSettings } from '../support/loadedMarkdownSettings';
import { showEditor } from '../support/showEditor';

const caret = { start: { lineNumber: 1, column: 1 }, end: { lineNumber: 1, column: 1 } };

function editorCommands(source = '') {
    const ok = { status: 'available' as const, value: undefined };
    const replaceRange = jest.fn(() => ok);
    const focus = jest.fn(() => ok);
    const commands = {
        focus,
        getContent: () => ({ status: 'available' as const, value: source }),
        getSelection: () => ({ status: 'available' as const, value: caret }),
        replaceAll: jest.fn(),
        applyEdits: jest.fn(() => ok),
        setPosition: jest.fn(() => ok),
        setMarkers: jest.fn(() => ok),
        replaceRange,
    };
    return { commands, focus, replaceRange };
}

function Harness({ commands }: { commands: ReturnType<typeof editorCommands>['commands'] }): React.JSX.Element {
    const [snapshot, setSnapshot] = useState<EditorActionSnapshot | null>(null);
    return (
        <Provider store={store}>
            <ModalStateContext.Provider value={snapshot !== null}>
                <EditorSessionContext.Provider value={{ documentId: 'shown-doc', content: '' }}>
                    <DocumentCommandContext.Provider value={commands}>
                        <InsertTableRequestContext.Provider value={setSnapshot}>
                            <FormattingToolbar arrangement="editor" onArrangementChange={jest.fn()} />
                            <InsertTableDialog open snapshot={snapshot} onClose={(): void => setSnapshot(null)} />
                        </InsertTableRequestContext.Provider>
                    </DocumentCommandContext.Provider>
                </EditorSessionContext.Provider>
            </ModalStateContext.Provider>
        </Provider>
    );
}

async function openDialog(commands: ReturnType<typeof editorCommands>['commands']) {
    store.dispatch(hydrateSettings(loadedMarkdownSettings));
    render(<Harness commands={commands} />);
    fireEvent.click(screen.getByRole('button', { name: 'Table' }));
    return screen.findByRole('dialog', { name: 'Insert table' });
}

beforeEach(() => {
    showEditor();
});

it('opens with 3 columns and 3 rows, focuses Columns and inserts the default table on Insert', async () => {
    const { commands, focus, replaceRange } = editorCommands();
    await openDialog(commands);
    const columns = screen.getByLabelText('Columns');
    expect(columns).toHaveValue(3);
    expect(screen.getByLabelText('Rows')).toHaveValue(3);
    expect(columns).toHaveFocus();
    expect(replaceRange).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Insert' }));

    expect(replaceRange).toHaveBeenCalledTimes(1);
    expect(replaceRange).toHaveBeenCalledWith(
        expect.anything(),
        '| Header 1 | Header 2 | Header 3 |\n| --- | --- | --- |\n|  |  |  |\n|  |  |  |\n|  |  |  |',
        expect.objectContaining({ start: { lineNumber: 1, column: 3 } }),
    );
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(focus).toHaveBeenCalled();
});

it('shows the range messages and disables Insert for 21 columns and 0 rows, and Enter does not submit', async () => {
    const { commands, replaceRange } = editorCommands();
    await openDialog(commands);
    const insert = screen.getByRole('button', { name: 'Insert' });

    fireEvent.change(screen.getByLabelText('Columns'), { target: { value: '21' } });
    expect(screen.getByText('Columns must be a whole number from 1 to 20.')).toHaveAttribute('role', 'alert');
    expect(insert).toBeDisabled();
    fireEvent.keyDown(screen.getByLabelText('Columns'), { key: 'Enter' });
    expect(replaceRange).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText('Columns'), { target: { value: '20' } });
    expect(screen.queryByText('Columns must be a whole number from 1 to 20.')).toBeNull();
    expect(insert).toBeEnabled();

    fireEvent.change(screen.getByLabelText('Rows'), { target: { value: '0' } });
    expect(screen.getByText('Rows must be a whole number from 1 to 100.')).toHaveAttribute('role', 'alert');
    expect(insert).toBeDisabled();
    fireEvent.change(screen.getByLabelText('Rows'), { target: { value: '101' } });
    expect(insert).toBeDisabled();
    fireEvent.change(screen.getByLabelText('Rows'), { target: { value: '100' } });
    expect(insert).toBeEnabled();
});

it('inserts a 4 by 2 table when Enter is pressed', async () => {
    const { commands, replaceRange } = editorCommands();
    await openDialog(commands);
    fireEvent.change(screen.getByLabelText('Columns'), { target: { value: '4' } });
    fireEvent.change(screen.getByLabelText('Rows'), { target: { value: '2' } });

    fireEvent.keyDown(screen.getByLabelText('Rows'), { key: 'Enter' });

    expect(replaceRange).toHaveBeenCalledTimes(1);
    expect(replaceRange).toHaveBeenCalledWith(
        expect.anything(),
        '| Header 1 | Header 2 | Header 3 | Header 4 |\n| --- | --- | --- | --- |\n|  |  |  |  |\n|  |  |  |  |',
        {
            start: { lineNumber: 1, column: 3 },
            end: { lineNumber: 1, column: 11 },
        },
    );
});

it('leaves the text unchanged and focuses the editor on Cancel and on Escape', async () => {
    const { commands, focus, replaceRange } = editorCommands();
    await openDialog(commands);
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(focus).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole('button', { name: 'Table' }));
    await screen.findByRole('dialog', { name: 'Insert table' });
    fireEvent.keyDown(document, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(focus).toHaveBeenCalledTimes(2);
    expect(replaceRange).not.toHaveBeenCalled();
});

it('does not open for a read-only document', () => {
    const { commands } = editorCommands();
    const requestTable = jest.fn();
    store.dispatch(hydrateSettings(loadedMarkdownSettings));
    store.dispatch(resetProjection());
    store.dispatch(
        hydrateProjection({
            revision: 1,
            documents: { 'shown-doc': { ...documentFixture('shown-doc'), capability: 'unsafe-read-only' } },
            activeDocumentId: 'shown-doc',
            ui: {},
        }),
    );
    render(
        <Provider store={store}>
            <EditorSessionContext.Provider value={{ documentId: 'shown-doc', content: '' }}>
                <DocumentCommandContext.Provider value={commands}>
                    <InsertTableRequestContext.Provider value={requestTable}>
                        <FormattingToolbar arrangement="editor" onArrangementChange={jest.fn()} />
                    </InsertTableRequestContext.Provider>
                </DocumentCommandContext.Provider>
            </EditorSessionContext.Provider>
        </Provider>,
    );
    const table = screen.getByRole('button', { name: 'Table' });
    expect(table).toBeDisabled();
    fireEvent.click(table);
    expect(requestTable).not.toHaveBeenCalled();
});
