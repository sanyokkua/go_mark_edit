import { useHorizontalResize } from './useHorizontalResize';
import styles from './SplitDivider.module.css';

export interface SplitDividerProps {
    ariaLabel: string;
    identity: string;
    value: number;
    getWidth: () => number;
    onResize: (value: number) => void;
    onCommit: (value: number) => void;
    valueText: (value: number) => string;
}

function constrain(value: number): number {
    return Math.max(0.2, Math.min(0.8, Math.round(value * 10000) / 10000));
}

export default function SplitDivider({
    ariaLabel,
    identity,
    value,
    getWidth,
    onResize,
    onCommit,
    valueText,
}: SplitDividerProps): React.JSX.Element {
    const onPointerDown = useHorizontalResize({
        value,
        identity,
        unitsPerPixel: () => {
            const width = getWidth();
            return width > 0 ? 1 / width : 0;
        },
        constrain,
        onResize,
        onCommit,
        onCancel: onResize,
    });

    return (
        <div
            className={styles.divider}
            role="separator"
            tabIndex={0}
            aria-label={ariaLabel}
            aria-orientation="vertical"
            aria-valuemin={20}
            aria-valuemax={80}
            aria-valuenow={Math.round(value * 100)}
            aria-valuetext={valueText(value)}
            onPointerDown={onPointerDown}
            onKeyDown={(event): void => {
                const values: Record<string, number> = {
                    ArrowLeft: value - 0.02,
                    ArrowRight: value + 0.02,
                    Home: 0.2,
                    End: 0.8,
                };
                const next = values[event.key];
                if (next === undefined) return;
                event.preventDefault();
                const ratio = constrain(next);
                onResize(ratio);
                onCommit(ratio);
            }}
        />
    );
}
