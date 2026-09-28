import { fireEvent, render, screen } from '@testing-library/react';
import FolderDropPrompt from '../../../../src/ui/widgets/dialogs/FolderDropPrompt';

describe('FolderDropPrompt', () => {
    it.each(['first-only', 'all-new-windows', 'cancel'] as const)('sends %s once for the entire drop', (choice) => {
        const onChoice = jest.fn(async () => undefined);
        render(<FolderDropPrompt open folderPaths={['/one', '/two']} onChoice={onChoice} />);
        fireEvent.click(screen.getByTestId(`folder-drop-${choice}`));
        expect(onChoice).toHaveBeenCalledTimes(1);
        expect(onChoice).toHaveBeenCalledWith(choice);
    });

    it('guards choices while a decision is pending', () => {
        const onChoice = jest.fn(() => new Promise<void>(() => undefined));
        render(<FolderDropPrompt open folderPaths={['/one', '/two']} onChoice={onChoice} />);
        fireEvent.click(screen.getByTestId('folder-drop-first-only'));
        fireEvent.click(screen.getByTestId('folder-drop-all-new-windows'));
        expect(onChoice).toHaveBeenCalledTimes(1);
    });
});
