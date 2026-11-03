import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { t } from '../i18n';
import type { AppModelAdapter } from '../logic/adapter/appModelAdapter';
import type { PendingClose } from '../logic/store/appModelTypes';
import ModalShell from '../ui/components/ModalShell';
import modalStyles from '../ui/components/ModalShell/ModalShell.module.css';
import Button from '../ui/primitives/Button';
import LiveRegion from '../ui/primitives/LiveRegion';
import styles from '../ui/widgets/StartupFailure/StartupFailure.module.css';
import type { ShutdownController } from './useShutdown';

interface Props {
    readonly shutdown: ShutdownController;
    readonly orderedDocumentIds: readonly string[];
    readonly adapter: Pick<AppModelAdapter, 'getState' | 'flushBuffer' | 'getPendingBufferDocumentIds'>;
    readonly reload: () => void;
}

type Decision = { id: string; count: number } | null;
const LIMIT_MS = 1000;
class AttemptTimeout extends Error {}

/** Recovery controls stay outside the subtree that failed to render. */
export default function InterfaceFailure({ shutdown, orderedDocumentIds, adapter, reload }: Props): React.JSX.Element {
    const reloadRef = useRef<HTMLButtonElement>(null);
    const cancelRef = useRef<HTMLButtonElement>(null);
    const shutdownRef = useRef(shutdown);
    useLayoutEffect(() => {
        shutdownRef.current = shutdown;
    }, [shutdown]);
    const mounted = useRef(true);
    const reloadToken = useRef(0);
    const closeToken = useRef(0);
    const cancelToken = useRef(0);
    const timers = useRef(new Set<ReturnType<typeof setTimeout>>());
    const reloadBusyRef = useRef(false);
    const closeBusyRef = useRef(false);
    const terminalRef = useRef(false);
    const activeClose = useRef<PendingClose | null>(shutdown.pendingClose);
    const [reloadBusy, setReloadBusy] = useState(false);
    const [closeBusy, setCloseBusy] = useState(false);
    const [decision, setDecision] = useState<Decision>(null);
    const decisionRef = useRef<Decision>(null);
    const [message, setMessage] = useState('');
    const setDecisionValue = (value: Decision): void => {
        decisionRef.current = value;
        setDecision(value);
    };

    useEffect(() => {
        mounted.current = true;
        reloadRef.current?.focus();
        const reloadGeneration = reloadToken;
        const closeGeneration = closeToken;
        const cancelGeneration = cancelToken;
        const pendingTimers = timers.current;
        return () => {
            mounted.current = false;
            reloadGeneration.current++;
            closeGeneration.current++;
            cancelGeneration.current++;
            pendingTimers.forEach(clearTimeout);
            pendingTimers.clear();
            reloadBusyRef.current = false;
            closeBusyRef.current = false;
            terminalRef.current = false;
        };
    }, []);

    const bounded = async <T,>(work: () => Promise<T>): Promise<T> => {
        let timer: ReturnType<typeof setTimeout> | undefined;
        try {
            return await Promise.race([
                Promise.resolve().then(work),
                new Promise<never>((_, reject) => {
                    timer = setTimeout(() => reject(new AttemptTimeout()), LIMIT_MS);
                    timers.current.add(timer);
                }),
            ]);
        } finally {
            if (timer !== undefined) {
                clearTimeout(timer);
                timers.current.delete(timer);
            }
        }
    };

    const prepareClose = useCallback(
        (id: string): void => {
            if (closeBusyRef.current || terminalRef.current || decisionRef.current !== null) return;
            const token = ++closeToken.current;
            closeBusyRef.current = true;
            setCloseBusy(true);
            setMessage('');
            const valid = (): boolean =>
                mounted.current &&
                closeToken.current === token &&
                activeClose.current?.id === id &&
                activeClose.current.owner === 'frontend';
            const before = adapter.getPendingBufferDocumentIds();
            void bounded(async () => {
                const error = await shutdownRef.current.acknowledgeRecoveryClose(id);
                if (!valid() || error !== undefined) throw new Error('close unavailable');
                const state = await adapter.getState();
                if (!valid()) throw new Error('stale');
                const current = state.snapshot.pendingClose;
                if (current?.id !== id || current.owner !== 'frontend') throw new Error('stale');
                const ids = new Set([...before, ...adapter.getPendingBufferDocumentIds()]);
                for (const [documentId, doc] of Object.entries(state.snapshot.documents))
                    if (doc.dirty) ids.add(documentId);
                return ids.size;
            })
                .then(async (count) => {
                    if (!valid()) return;
                    if (count > 0) {
                        setDecisionValue({ id, count });
                        return;
                    }
                    terminalRef.current = true;
                    const error = await shutdownRef.current.authorizeQuit(id);
                    if (error !== undefined) throw new Error('close unavailable');
                })
                .catch(() => {
                    const current = valid();
                    if (current || (mounted.current && terminalRef.current)) {
                        if (current) closeToken.current++;
                        terminalRef.current = false;
                        closeBusyRef.current = false;
                        setCloseBusy(false);
                        if (current) setMessage(t('interface.failure.closeError'));
                    }
                })
                .finally(() => {
                    if (valid() && !terminalRef.current) {
                        closeBusyRef.current = false;
                        setCloseBusy(false);
                    }
                });
        },
        [adapter],
    );

    useEffect(() => {
        const previous = activeClose.current;
        const next = shutdown.pendingClose;
        activeClose.current = next;
        const changed = previous?.id !== next?.id || previous?.owner !== next?.owner;
        if (changed) {
            if (next !== null) reloadToken.current++;
            closeToken.current++;
            cancelToken.current++;
            if (next !== null) reloadBusyRef.current = false;
            if (!terminalRef.current) closeBusyRef.current = false;
        }
        let cancelled = false;
        void Promise.resolve().then(() => {
            if (cancelled || !mounted.current) return;
            if (changed) {
                if (next !== null) setReloadBusy(false);
                if (!terminalRef.current) setCloseBusy(false);
                setDecisionValue(null);
            }
            if (next?.owner === 'frontend') prepareClose(next.id);
            else if (next?.owner === 'native') setMessage(t('interface.failure.nativeWait'));
        });
        return () => {
            cancelled = true;
        };
    }, [shutdown.pendingClose, prepareClose]);

    const reloadInterface = (): void => {
        if (reloadBusyRef.current || terminalRef.current || decisionRef.current !== null) return;
        const token = ++reloadToken.current;
        reloadBusyRef.current = true;
        setReloadBusy(true);
        setMessage('');
        const valid = (): boolean => mounted.current && token === reloadToken.current;
        const gate = async (): Promise<void> => {
            const current = (await adapter.getState()).snapshot.pendingClose;
            if (!valid()) throw new Error('stale');
            if (current?.owner === 'native') throw new Error('native');
            if (current?.owner === 'frontend') await shutdownRef.current.cancelQuit(current.id);
            if (!valid()) throw new Error('stale');
        };
        void bounded(async () => {
            const initial = await adapter.getState();
            if (!valid()) throw new Error('stale');
            const pending = initial.snapshot.pendingClose;
            if (pending?.owner === 'native') throw new Error('native');
            if (pending?.owner === 'frontend') await shutdownRef.current.cancelQuit(pending.id);
            if (!valid()) throw new Error('stale');
            const ids = new Set([
                ...orderedDocumentIds,
                ...(initial.snapshot.orderedDocumentIds ?? []),
                ...adapter.getPendingBufferDocumentIds(),
            ]);
            await Promise.all([...ids].map((id) => adapter.flushBuffer(id)));
            if (!valid() || adapter.getPendingBufferDocumentIds().length > 0) throw new Error('pending');
            await gate();
            if (!valid() || adapter.getPendingBufferDocumentIds().length > 0) throw new Error('pending');
        })
            .then(() => {
                if (valid()) reload();
            })
            .catch(() => {
                if (valid()) {
                    reloadToken.current++;
                    reloadBusyRef.current = false;
                    setReloadBusy(false);
                    setMessage(t('interface.failure.reloadError'));
                }
            })
            .finally(() => {
                if (valid()) {
                    reloadBusyRef.current = false;
                    setReloadBusy(false);
                }
            });
    };

    const quit = (): void => {
        shutdownRef.current.requestQuit();
        const current = activeClose.current;
        if (current?.owner === 'frontend') prepareClose(current.id);
    };
    const cancel = (): void => {
        const current = decisionRef.current;
        if (current === null || closeBusyRef.current || terminalRef.current) return;
        const token = ++cancelToken.current;
        closeBusyRef.current = true;
        setCloseBusy(true);
        setMessage('');
        void bounded(() => shutdownRef.current.cancelQuit(current.id))
            .then(() => {
                if (mounted.current && token === cancelToken.current && decisionRef.current?.id === current.id)
                    setDecisionValue(null);
            })
            .catch(async (error: unknown) => {
                const valid = (): boolean =>
                    mounted.current &&
                    token === cancelToken.current &&
                    decisionRef.current?.id === current.id &&
                    activeClose.current?.id === current.id &&
                    activeClose.current.owner === 'frontend';
                if (!valid()) return;
                // A lost successful response makes a retry stale. Only authoritative
                // absence permits clearing this exact frontend-owned request.
                if (!(error instanceof AttemptTimeout)) {
                    try {
                        const latest = await bounded(() => adapter.getState());
                        if (!valid()) return;
                        if (latest.snapshot.pendingClose == null) {
                            shutdownRef.current.clearPendingClose(current.id);
                            setDecisionValue(null);
                            return;
                        }
                    } catch {
                        // Keep the decision and offer another explicit retry.
                    }
                }
                if (valid()) {
                    setMessage(t('interface.failure.closeError'));
                }
            })
            .finally(() => {
                if (mounted.current && token === cancelToken.current) {
                    closeBusyRef.current = false;
                    setCloseBusy(false);
                }
            });
    };
    const discard = (): void => {
        const current = decisionRef.current;
        if (current === null || closeBusyRef.current || terminalRef.current) return;
        const token = ++closeToken.current;
        terminalRef.current = true;
        closeBusyRef.current = true;
        setCloseBusy(true);
        setMessage('');
        void Promise.resolve()
            .then(() => shutdownRef.current.discardAndAuthorizeQuit(current.id))
            .then((error) => {
                if (error !== undefined) throw new Error('close unavailable');
            })
            .catch(() => {
                if (mounted.current && terminalRef.current) {
                    terminalRef.current = false;
                    closeBusyRef.current = false;
                    setCloseBusy(false);
                    if (token === closeToken.current && decisionRef.current?.id === current.id) {
                        setMessage(t('interface.failure.closeError'));
                    }
                }
            });
    };
    return (
        <section className={styles.failure}>
            <div className={styles.panel} aria-busy={reloadBusy || closeBusy}>
                <h1>{t('interface.failure.title')}</h1>
                {decision === null && <LiveRegion message={message} />}
                {message !== '' && <p className={styles.message}>{message}</p>}
                <div className={styles.actions}>
                    <Button
                        ref={reloadRef}
                        className={styles.retry}
                        variant="primary"
                        disabled={reloadBusy || closeBusy}
                        onClick={reloadInterface}
                    >
                        {t('interface.failure.reload')}
                    </Button>
                    <Button variant="secondary" disabled={reloadBusy || closeBusy} onClick={quit}>
                        {t('interface.failure.quit')}
                    </Button>
                </div>
            </div>
            <ModalShell
                open={decision !== null}
                dismiss="escape"
                initialFocus={cancelRef}
                returnFocusTo={reloadRef}
                onRequestClose={cancel}
                title={t(decision?.count === 1 ? 'interface.failure.discardOne' : 'interface.failure.discardMany', {
                    count: decision?.count ?? 0,
                })}
            >
                <div className={modalStyles.promptBody}>
                    <LiveRegion message={message} />
                    {message !== '' && <p>{message}</p>}
                    <div className={modalStyles.actions}>
                        <Button variant="primary" disabled={closeBusy} onClick={discard}>
                            {t('interface.failure.quit')}
                        </Button>
                        <Button ref={cancelRef} variant="secondary" disabled={closeBusy} onClick={cancel}>
                            {t('close.cancel')}
                        </Button>
                    </div>
                </div>
            </ModalShell>
        </section>
    );
}
