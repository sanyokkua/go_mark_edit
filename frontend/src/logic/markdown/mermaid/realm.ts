import type { MermaidConfig } from 'mermaid';

import entryUrl from './realmEntry.ts?worker&url';

export interface MermaidRealm {
    initialize(config: MermaidConfig): void;
    parse(source: string): Promise<unknown>;
    render(id: string, source: string): Promise<{ svg: string }>;
    cleanup(id: string): void;
}

declare global {
    interface Window {
        __gmeMermaidRealmReady?: Promise<MermaidRealm>;
    }
}

const frameCsp =
    "default-src 'none'; script-src 'self' wails://wails; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'";
let pending: Promise<MermaidRealm> | undefined;

function escapeAttribute(value: string): string {
    return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
}

function createRealm(): Promise<MermaidRealm> {
    const frame = document.createElement('iframe');
    frame.setAttribute('aria-hidden', 'true');
    frame.tabIndex = -1;
    frame.sandbox.add('allow-scripts', 'allow-same-origin');
    frame.style.cssText =
        'position:fixed;left:-100000px;top:0;width:1200px;height:800px;visibility:hidden;pointer-events:none;border:0';
    const scriptUrl = new URL(entryUrl, document.baseURI).href;
    frame.srcdoc = `<meta http-equiv="Content-Security-Policy" content="${escapeAttribute(frameCsp)}"><script type="module" src="${escapeAttribute(scriptUrl)}"></script>`;

    return new Promise<MermaidRealm>((resolve, reject) => {
        const timeout = window.setTimeout(() => fail(new Error('Mermaid rendering module did not load')), 10_000);
        const fail = (error: unknown): void => {
            window.clearTimeout(timeout);
            frame.remove();
            reject(error);
        };
        frame.addEventListener(
            'load',
            () => {
                const ready = frame.contentWindow?.__gmeMermaidRealmReady;
                if (!ready) {
                    fail(new Error('Mermaid rendering module did not load'));
                    return;
                }
                void ready.then(
                    (realm) => {
                        window.clearTimeout(timeout);
                        resolve(realm);
                    },
                    (error: unknown) => fail(error),
                );
            },
            { once: true },
        );
        frame.addEventListener('error', () => fail(new Error('Mermaid rendering module did not load')), {
            once: true,
        });
        document.body.appendChild(frame);
    });
}

/** A persistent layout-capable document applies its CSP before Mermaid code can execute. */
export function loadMermaidRealm(): Promise<MermaidRealm> {
    pending ??= createRealm().catch((error: unknown) => {
        pending = undefined;
        throw error;
    });
    return pending;
}
