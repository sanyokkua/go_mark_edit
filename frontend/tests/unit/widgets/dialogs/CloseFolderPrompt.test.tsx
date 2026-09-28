import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import CloseFolderPrompt from '../../../../src/ui/widgets/dialogs/CloseFolderPrompt';

describe('CloseFolderPrompt', () => {
    it.each([
        ['Close the tabs too', 'close-tabs'],
        ['Keep them open', 'keep-tabs'],
        ['Cancel', 'cancel'],
    ] as const)('sends %s as %s', async (label, choice) => {
        const onChoice = jest.fn(async (): Promise<void> => undefined);
        render(<CloseFolderPrompt onChoice={onChoice} open />);
        fireEvent.click(screen.getByRole('button', { name: label }));
        await waitFor(() => expect(onChoice).toHaveBeenCalledWith(choice));
        expect(onChoice).toHaveBeenCalledTimes(1);
    });
    it('focuses Cancel and maps Escape to cancellation', async () => {
        const onChoice = jest.fn(async (): Promise<void> => undefined);
        render(<CloseFolderPrompt onChoice={onChoice} open />);
        expect(screen.getByRole('button', { name: 'Cancel' })).toHaveFocus();
        fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
        await waitFor(() => expect(onChoice).toHaveBeenCalledWith('cancel'));
    });
    it('blocks buttons and repeated Escape while a choice is pending', async () => {
        let resolve!: () => void;
        const onChoice = jest.fn(
            (): Promise<void> =>
                new Promise<void>((done) => {
                    resolve = done;
                }),
        );
        render(<CloseFolderPrompt onChoice={onChoice} open />);
        fireEvent.click(screen.getByRole('button', { name: 'Close the tabs too' }));
        expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled();
        expect(screen.getByRole('button', { name: 'Keep them open' })).toBeDisabled();
        fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
        expect(onChoice).toHaveBeenCalledTimes(1);
        resolve();
        await waitFor(() => expect(screen.getByRole('button', { name: 'Cancel' })).toBeEnabled());
    });
    it('does not render when closed', () => {
        render(<CloseFolderPrompt onChoice={jest.fn()} open={false} />);
        expect(screen.queryByRole('dialog')).toBeNull();
    });
});
