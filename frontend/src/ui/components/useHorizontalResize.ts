import { useEffect, useLayoutEffect, useRef, type PointerEvent as ReactPointerEvent } from 'react';

interface DragState {
    pointerId: number;
    startX: number;
    startValue: number;
    currentValue: number;
    unitsPerPixel: number;
    target: HTMLElement;
}

interface HorizontalResizeOptions {
    value: number;
    disabled?: boolean;
    identity?: string;
    unitsPerPixel: () => number;
    constrain: (value: number) => number;
    onResize: (value: number) => void;
    onCommit: (value: number) => void;
    onCancel?: (startValue: number) => void;
}

/** Shared pointer lifecycle; each consumer owns units, limits and keyboard behavior. */
export function useHorizontalResize(
    options: HorizontalResizeOptions,
): (event: ReactPointerEvent<HTMLDivElement>) => void {
    const current = useRef(options);
    useLayoutEffect((): void => {
        current.current = options;
    });
    const dragRef = useRef<DragState | null>(null);

    useEffect(() => {
        const matches = (event: PointerEvent, drag: DragState): boolean =>
            event.pointerId === 0 || event.pointerId === drag.pointerId;
        const release = (drag: DragState): void => {
            if (drag.target.hasPointerCapture?.(drag.pointerId)) {
                drag.target.releasePointerCapture(drag.pointerId);
            }
        };
        const move = (event: PointerEvent): void => {
            const drag = dragRef.current;
            if (drag === null || !matches(event, drag)) return;
            drag.currentValue = current.current.constrain(
                drag.startValue + (event.clientX - drag.startX) * drag.unitsPerPixel,
            );
            current.current.onResize(drag.currentValue);
        };
        const finish = (event: PointerEvent): void => {
            const drag = dragRef.current;
            if (drag === null || !matches(event, drag)) return;
            dragRef.current = null;
            release(drag);
            if (event.type === 'pointercancel' && current.current.onCancel !== undefined) {
                current.current.onCancel(drag.startValue);
            } else {
                current.current.onCommit(drag.currentValue);
            }
        };
        window.addEventListener('pointermove', move);
        window.addEventListener('pointerup', finish);
        window.addEventListener('pointercancel', finish);
        return (): void => {
            window.removeEventListener('pointermove', move);
            window.removeEventListener('pointerup', finish);
            window.removeEventListener('pointercancel', finish);
            const drag = dragRef.current;
            dragRef.current = null;
            if (drag !== null) release(drag);
        };
    }, [options.identity, options.disabled]);

    return (event): void => {
        if (current.current.disabled || dragRef.current !== null || event.button > 0) return;
        const unitsPerPixel = current.current.unitsPerPixel();
        if (!Number.isFinite(unitsPerPixel) || unitsPerPixel === 0) return;
        event.preventDefault();
        dragRef.current = {
            pointerId: event.pointerId,
            startX: event.clientX,
            startValue: current.current.value,
            currentValue: current.current.value,
            unitsPerPixel,
            target: event.currentTarget,
        };
        event.currentTarget.setPointerCapture?.(event.pointerId);
    };
}
