import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import CreateEntryPrompt, {
    type CreateEntryPromptProps,
} from '../../../../src/ui/widgets/WorkspaceTree/CreateEntryPrompt';

const suffixes = ['.md', '.markdown', '.mdown', '.txt'];

function setup(
    kind: 'file' | 'folder' = 'file',
    onCreate: CreateEntryPromptProps['onCreate'] = jest.fn(async () => undefined),
) {
    const onCancel = jest.fn();
    render(
        <CreateEntryPrompt
            open
            parentPath="/notes"
            kind={kind}
            supportedSuffixes={suffixes}
            onCreate={onCreate}
            onCancel={onCancel}
        />,
    );
    return { onCreate, onCancel };
}

it.each([
    ['draft', 'draft.md'],
    ['draft.MD', 'draft.MD'],
    ['draft.markdown', 'draft.markdown'],
    ['draft.mdown', 'draft.mdown'],
    ['draft.txt', 'draft.txt'],
])('sends file name %s as %s', async (typed, expected) => {
    const { onCreate } = setup();
    fireEvent.change(screen.getByRole('textbox', { name: 'Name' }), { target: { value: typed } });
    fireEvent.click(screen.getByRole('button', { name: 'Create' }));
    await waitFor(() => expect(onCreate).toHaveBeenCalledWith(expected));
});

it('sends a folder name without an extension', async () => {
    const { onCreate } = setup('folder');
    fireEvent.change(screen.getByRole('textbox', { name: 'Name' }), { target: { value: 'draft' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create' }));
    await waitFor(() => expect(onCreate).toHaveBeenCalledWith('draft'));
});

it('disables Create for empty names and path separators', () => {
    setup();
    const input = screen.getByRole('textbox', { name: 'Name' });
    expect(screen.getByRole('button', { name: 'Create' })).toBeDisabled();
    fireEvent.change(input, { target: { value: 'dir/name' } });
    expect(screen.getByRole('button', { name: 'Create' })).toBeDisabled();
    fireEvent.change(input, { target: { value: 'dir\\name' } });
    expect(screen.getByRole('button', { name: 'Create' })).toBeDisabled();
});

it.each(['file', 'folder'] as const)('keeps a leading dot name and explains refusal for %s', (kind) => {
    const { onCreate } = setup(kind);
    fireEvent.change(screen.getByRole('textbox', { name: 'Name' }), { target: { value: '.hidden' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create' }));
    expect(onCreate).not.toHaveBeenCalled();
    expect(screen.getByRole('textbox', { name: 'Name' })).toHaveValue('.hidden');
    expect(screen.getByRole('alert')).toHaveTextContent(/dot/i);
});

it('retains a conflicting name and explains the backend refusal inline', async () => {
    const onCreate = jest.fn(async () => ({
        error: { category: 'conflict' as const, message: 'Name taken', remediations: [], dedupKey: 'x' },
    }));
    setup('file', onCreate);
    fireEvent.change(screen.getByRole('textbox', { name: 'Name' }), { target: { value: 'taken' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create' }));
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Name taken'));
    expect(screen.getByRole('textbox', { name: 'Name' })).toHaveValue('taken');
});

it('keeps Escape from cancelling a create while the backend is busy', async () => {
    const onCreate = jest.fn(() => new Promise<{ status: 'opened' }>(() => undefined));
    const { onCancel } = setup('file', onCreate);
    fireEvent.change(screen.getByRole('textbox', { name: 'Name' }), { target: { value: 'draft' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create' }));
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    expect(onCancel).not.toHaveBeenCalled();
});
