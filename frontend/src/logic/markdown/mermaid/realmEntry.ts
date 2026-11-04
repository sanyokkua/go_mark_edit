import type { MermaidRealm } from './realm';

declare global {
    interface Window {
        __gmeMermaidRealmReady?: Promise<MermaidRealm>;
    }
}

(globalThis as typeof globalThis & Window).__gmeMermaidRealmReady = import('mermaid').then(
    ({ default: mermaid }): MermaidRealm => ({
        initialize: (config) => mermaid.initialize(config),
        parse: (source) => mermaid.parse(source),
        render: (id, source) => mermaid.render(id, source),
        cleanup: (id) => {
            document.getElementById(id)?.remove();
            document.getElementById(`d${id}`)?.remove();
        },
    }),
);
