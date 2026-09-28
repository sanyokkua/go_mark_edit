import { fireEvent, render, screen } from '@testing-library/react';
import WindowDropTarget from '../../../src/ui/widgets/WindowDropTarget';

describe('WindowDropTarget', () => {
    it('is inert until a file drag, then clears on leave and drop', () => {
        const onDropPaths = jest.fn();
        const { container } = render(<WindowDropTarget onDropPaths={onDropPaths} />);
        expect(screen.queryByTestId('window-drop-hint')).toBeNull();
        fireEvent.dragEnter(window, { dataTransfer: { types: ['Files'] } });
        expect(screen.getByTestId('window-drop-hint')).toBeInTheDocument();
        fireEvent.dragLeave(window, { relatedTarget: null });
        expect(screen.queryByTestId('window-drop-hint')).toBeNull();
        fireEvent.dragEnter(window, { dataTransfer: { types: ['Files'] } });
        fireEvent.drop(window, { dataTransfer: { files: [] } });
        expect(screen.queryByTestId('window-drop-hint')).toBeNull();
        expect(onDropPaths).not.toHaveBeenCalled();
        expect(container.querySelector('[data-testid="window-drop-overlay"]')).toBeNull();
    });

    it('ignores non-file drags and clears a valid drag on cancellation', () => {
        render(<WindowDropTarget />);
        fireEvent.dragEnter(window, { dataTransfer: { types: ['text/plain'] } });
        expect(screen.queryByTestId('window-drop-overlay')).toBeNull();
        const over = new Event('dragover', { bubbles: true, cancelable: true });
        Object.defineProperty(over, 'dataTransfer', { value: { types: ['Files'] } });
        window.dispatchEvent(over);
        expect(over.defaultPrevented).toBe(true);
        fireEvent.dragEnter(window, { dataTransfer: { types: ['Files'] } });
        expect(screen.getByTestId('window-drop-overlay')).toBeInTheDocument();
        fireEvent.dragEnd(window);
        expect(screen.queryByTestId('window-drop-overlay')).toBeNull();
    });
});
