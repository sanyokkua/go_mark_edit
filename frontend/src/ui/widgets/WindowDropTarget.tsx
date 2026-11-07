import { useEffect, useState } from 'react';

import { t } from '../../i18n';
import styles from './WindowDropTarget.module.css';

export interface WindowDropTargetProps {
    dropEpoch?: number;
    onDropPaths?: (paths: string[]) => void;
}

/** Visual feedback only. Wails supplies native paths through OnFileDrop. */
const WindowDropTarget: React.FC<WindowDropTargetProps> = ({ dropEpoch = 0 }) => {
    const [hoverEpoch, setHoverEpoch] = useState<number | null>(null);
    useEffect(() => {
        const isFileDrag = (event: DragEvent): boolean => Array.from(event.dataTransfer?.types ?? []).includes('Files');
        const enter = (event: DragEvent): void => {
            if (isFileDrag(event)) setHoverEpoch(dropEpoch);
        };
        const over = (event: DragEvent): void => {
            if (isFileDrag(event)) event.preventDefault();
        };
        const leave = (event: DragEvent): void => {
            if (!event.relatedTarget) setHoverEpoch(null);
        };
        const clear = (): void => setHoverEpoch(null);
        globalThis.addEventListener('dragenter', enter);
        globalThis.addEventListener('dragover', over);
        globalThis.addEventListener('dragleave', leave);
        globalThis.addEventListener('drop', clear);
        globalThis.addEventListener('dragend', clear);
        globalThis.addEventListener('blur', clear);
        return () => {
            globalThis.removeEventListener('dragenter', enter);
            globalThis.removeEventListener('dragover', over);
            globalThis.removeEventListener('dragleave', leave);
            globalThis.removeEventListener('drop', clear);
            globalThis.removeEventListener('dragend', clear);
            globalThis.removeEventListener('blur', clear);
        };
    }, [dropEpoch]);
    return hoverEpoch === dropEpoch ? (
        <div className={styles.overlay} data-testid="window-drop-overlay" aria-hidden="true">
            <span data-testid="window-drop-hint">{t('workspace.drop.hint')}</span>
        </div>
    ) : null;
};

export default WindowDropTarget;
