import { useCallback, useEffect, useRef, useState } from 'react';

import type { AppModelAdapter } from '../../../logic/adapter';
import type { DocumentView } from '../../../logic/store/appModelTypes';
import { useAppDispatch } from '../../../logic/store';
import { notifyError } from '../../../logic/store/notificationsSlice';
import { parseError } from '../../../logic/utils/parseError';

interface PendingRatio {
    documentId: string;
    accepted: boolean;
    value: number;
}

export function useSplitRatio(
    documentId: string,
    view: DocumentView,
    setDocView?: AppModelAdapter['setDocView'],
    enabled = true,
): {
    ratio: number;
    resize: (value: number) => void;
    commit: (value: number) => void;
} {
    const dispatch = useAppDispatch();
    const acknowledged = view.splitRatio ?? 0.5;
    const [pending, setPending] = useState<PendingRatio | null>(null);
    const request = useRef(0);
    if (
        pending !== null &&
        (pending.documentId !== documentId || !enabled || (pending.accepted && pending.value === acknowledged))
    ) {
        setPending(null);
    }
    useEffect((): void => {
        request.current += 1;
    }, [documentId, enabled]);
    const ratio = pending?.documentId === documentId ? pending.value : acknowledged;

    const resize = useCallback(
        (value: number): void => {
            setPending({ documentId, accepted: false, value });
        },
        [documentId],
    );

    const commit = useCallback(
        (value: number): void => {
            if (setDocView === undefined) return;
            const intent = ++request.current;
            void setDocView(
                documentId,
                { splitRatio: value },
                {
                    editorVisible: view.editorVisible,
                    previewVisible: view.previewVisible,
                    cursor: { ...view.cursor },
                    selection: { start: { ...view.selection.start }, end: { ...view.selection.end } },
                    scroll: { ...view.scroll },
                    splitRatio: acknowledged,
                },
            )
                .then((): void => {
                    if (request.current === intent) {
                        setPending((current) =>
                            current?.documentId === documentId && current.value === value
                                ? { ...current, accepted: true }
                                : current,
                        );
                    }
                })
                .catch((error: unknown): void => {
                    if (request.current === intent) {
                        setPending((current) =>
                            current?.documentId === documentId && current.value === value ? null : current,
                        );
                    }
                    dispatch(notifyError(parseError(error), documentId));
                });
        },
        [acknowledged, dispatch, documentId, setDocView, view],
    );

    return { ratio, resize, commit };
}
