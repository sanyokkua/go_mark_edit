import { memo, useEffect, useId, useMemo, useRef, useState } from 'react';

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

type DiagramLimit = 'tooManyDiagrams' | 'tooLarge';

function diagramLimit(source: string, index: number): DiagramLimit | null {
    if (index > 50) return 'tooManyDiagrams';
    if (source.length > 50_000) return 'tooLarge';
    return null;
}

function diagramPresentation(limit: DiagramLimit | null, result: MermaidResult | undefined, namespacedSvg: string) {
    if (limit !== null) {
        return {
            state: 'limit',
            content: <output className={styles.placeholder}>{t(`preview.mermaid.${limit}`)}</output>,
        };
    }
    if (result?.kind === 'svg') {
        return {
            state: 'drawn',
            content: (
                <div
                    aria-label={t('preview.mermaid.diagram')}
                    className={styles.diagram}
                    role="img"
                    dangerouslySetInnerHTML={{ __html: namespacedSvg }}
                />
            ),
        };
    }
    if (result?.kind === 'error') {
        return {
            state: 'error',
            content: (
                <div className={styles.error} role="alert">
                    <strong>
                        {t(result.stage === 'load' ? 'preview.mermaid.loadError' : 'preview.mermaid.error')}
                    </strong>
                    <pre className={styles.errorMessage}>{result.message}</pre>
                </div>
            ),
        };
    }
    return {
        state: 'pending',
        content: <output className={styles.loading}>{t('preview.mermaid.loading')}</output>,
    };
}

function MermaidBlock({ source, index, sourceLine }: Readonly<MermaidBlockProps>): React.JSX.Element {
    const namespace = useId();
    const rootRef = useRef<HTMLDivElement>(null);
    const [theme, setTheme] = useState<string>();
    const [displayed, setDisplayed] = useState<DisplayedResult>();
    const limit = diagramLimit(source, index);

    useEffect(() => {
        const element = rootRef.current;
        if (limit !== null || element === null) return;
        const root = document.documentElement;
        const apply = (): void => setTheme(resolveMermaidTheme(element));
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
    const { state, content } = diagramPresentation(limit, current, namespacedSvg);
    return (
        <div
            ref={rootRef}
            className={styles.block}
            data-mermaid-block={index}
            data-mermaid-state={state}
            data-source-line={sourceLine}
        >
            {content}
        </div>
    );
}

export default memo(MermaidBlock);
