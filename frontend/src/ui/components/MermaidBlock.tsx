import { memo, useEffect, useId, useMemo, useState } from 'react';

import { t } from '../../i18n';
import { mermaidQueue, type MermaidResult } from '../../logic/markdown/mermaid/queue';
import { namespaceMermaidSvg } from '../../logic/markdown/mermaid/scrub';
import { resolveMermaidTheme } from '../../logic/markdown/mermaid/theme';
import styles from './MermaidBlock.module.css';

interface MermaidBlockProps {
    source: string;
    index: number;
    sourceLine?: number | string;
}

interface DisplayedResult {
    source: string;
    result: MermaidResult;
}

function MermaidBlock({ source, index, sourceLine }: MermaidBlockProps): React.JSX.Element {
    const namespace = useId();
    const [theme, setTheme] = useState<string>();
    const [displayed, setDisplayed] = useState<DisplayedResult>();
    const limit = index > 50 ? 'tooManyDiagrams' : source.length > 50_000 ? 'tooLarge' : null;

    useEffect(() => {
        if (limit !== null) return;
        const root = document.documentElement;
        const apply = (): void => setTheme(resolveMermaidTheme());
        apply();
        const observer = new MutationObserver(apply);
        observer.observe(root, { attributes: true, attributeFilter: ['data-theme', 'data-mode'] });
        return () => observer.disconnect();
    }, [limit]);

    useEffect(() => {
        if (limit !== null || theme === undefined) return;
        const controller = new AbortController();
        let current = true;
        void mermaidQueue
            .render({ source, theme, signal: controller.signal })
            .then((result) => {
                if (current && result.kind !== 'aborted') setDisplayed({ source, result });
            })
            .catch((error: unknown) => {
                if (current) {
                    setDisplayed({
                        source,
                        result: { kind: 'error', message: error instanceof Error ? error.message : String(error) },
                    });
                }
            });
        return () => {
            current = false;
            controller.abort();
        };
    }, [source, theme, limit]);

    const current = displayed?.source === source ? displayed.result : undefined;
    const svg = current?.kind === 'svg' ? current.svg : undefined;
    const namespacedSvg = useMemo(
        () => (svg === undefined ? '' : namespaceMermaidSvg(svg, namespace)),
        [svg, namespace],
    );
    const state =
        limit !== null ? 'limit' : current?.kind === 'svg' ? 'drawn' : current?.kind === 'error' ? 'error' : 'pending';
    return (
        <div
            className={styles.block}
            data-mermaid-block={index}
            data-mermaid-state={state}
            data-source-line={sourceLine}
        >
            {limit !== null ? (
                <div className={styles.placeholder} role="status">
                    {t(`preview.mermaid.${limit}`)}
                </div>
            ) : current?.kind === 'svg' ? (
                <div
                    aria-label={t('preview.mermaid.diagram')}
                    className={styles.diagram}
                    role="img"
                    dangerouslySetInnerHTML={{ __html: namespacedSvg }}
                />
            ) : current?.kind === 'error' ? (
                <div className={styles.error} role="alert">
                    <strong>
                        {t(current.stage === 'load' ? 'preview.mermaid.loadError' : 'preview.mermaid.error')}
                    </strong>
                    <pre className={styles.errorMessage}>{current.message}</pre>
                </div>
            ) : (
                <div className={styles.loading} role="status">
                    {t('preview.mermaid.loading')}
                </div>
            )}
        </div>
    );
}

export default memo(MermaidBlock);
