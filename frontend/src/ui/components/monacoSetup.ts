import * as monaco from 'monaco-editor/esm/vs/editor/editor.api';
import 'monaco-editor/esm/vs/editor/browser/coreCommands';
import 'monaco-editor/esm/vs/basic-languages/markdown/markdown.contribution';
import 'monaco-editor/esm/vs/basic-languages/javascript/javascript.contribution';
import 'monaco-editor/esm/vs/basic-languages/typescript/typescript.contribution';
import 'monaco-editor/esm/vs/basic-languages/go/go.contribution';
import 'monaco-editor/esm/vs/basic-languages/python/python.contribution';
import 'monaco-editor/esm/vs/basic-languages/java/java.contribution';
import 'monaco-editor/esm/vs/basic-languages/cpp/cpp.contribution';
import 'monaco-editor/esm/vs/basic-languages/csharp/csharp.contribution';
import 'monaco-editor/esm/vs/basic-languages/rust/rust.contribution';
import 'monaco-editor/esm/vs/basic-languages/ruby/ruby.contribution';
import 'monaco-editor/esm/vs/basic-languages/php/php.contribution';
import 'monaco-editor/esm/vs/basic-languages/kotlin/kotlin.contribution';
import 'monaco-editor/esm/vs/basic-languages/swift/swift.contribution';
import 'monaco-editor/esm/vs/basic-languages/sql/sql.contribution';
import 'monaco-editor/esm/vs/basic-languages/yaml/yaml.contribution';
import 'monaco-editor/esm/vs/basic-languages/xml/xml.contribution';
import 'monaco-editor/esm/vs/basic-languages/html/html.contribution';
import 'monaco-editor/esm/vs/basic-languages/css/css.contribution';
import 'monaco-editor/esm/vs/basic-languages/scss/scss.contribution';
import 'monaco-editor/esm/vs/basic-languages/powershell/powershell.contribution';
import 'monaco-editor/esm/vs/basic-languages/dockerfile/dockerfile.contribution';
import 'monaco-editor/esm/vs/basic-languages/shell/shell.contribution';
import 'monaco-editor/esm/vs/basic-languages/ini/ini.contribution';
import 'monaco-editor/esm/vs/editor/contrib/hover/browser/hoverContribution';
import 'monaco-editor/esm/vs/editor/contrib/links/browser/links';
import EditorWorker from 'monaco-editor/esm/vs/editor/editor.worker?worker';

import type { EditorLink } from '../../logic/markdown/editorLinks';
import { runEditorLinkExtraction } from '../../logic/markdown/runEditorLinkExtraction';
import { observeRootTheme, registerGeneratedThemes } from './monacoThemes';
import { language as jsonLanguage } from './monaco/json';
import { language as diffLanguage } from './monaco/diff';
import { language as makefileLanguage } from './monaco/makefile';
import { language as mermaidLanguage } from './monaco/mermaid';

const grammarAliases: ReadonlyArray<[string, () => Promise<{ language: monaco.languages.IMonarchLanguage }>]> = [
    ['jsx', () => import('monaco-editor/esm/vs/basic-languages/javascript/javascript')],
    ['tsx', () => import('monaco-editor/esm/vs/basic-languages/typescript/typescript')],
    ['bash', () => import('monaco-editor/esm/vs/basic-languages/shell/shell')],
    ['zsh', () => import('monaco-editor/esm/vs/basic-languages/shell/shell')],
    ['console', () => import('monaco-editor/esm/vs/basic-languages/shell/shell')],
    ['md', () => import('monaco-editor/esm/vs/basic-languages/markdown/markdown')],
    ['cs', () => import('monaco-editor/esm/vs/basic-languages/csharp/csharp')],
    ['rs', () => import('monaco-editor/esm/vs/basic-languages/rust/rust')],
    ['kt', () => import('monaco-editor/esm/vs/basic-languages/kotlin/kotlin')],
    ['docker', () => import('monaco-editor/esm/vs/basic-languages/dockerfile/dockerfile')],
    ['toml', () => import('monaco-editor/esm/vs/basic-languages/ini/ini')],
];

for (const [id, load] of grammarAliases) {
    monaco.languages.register({ id });
    monaco.languages.registerTokensProviderFactory(id, { create: async () => (await load()).language });
}

for (const [id, language] of [
    ['json', jsonLanguage],
    ['diff', diffLanguage],
    ['makefile', makefileLanguage],
    ['mermaid', mermaidLanguage],
    ['patch', diffLanguage],
    ['make', makefileLanguage],
    ['mk', makefileLanguage],
] as const) {
    monaco.languages.register({ id });
    monaco.languages.setMonarchTokensProvider(id, language);
}

interface LinkModelEntry {
    id: string;
    model: monaco.editor.ITextModel;
    generation: number;
    parsedVersion: number | null;
    completed: { version: number; links: EditorLink[] } | null;
    pending: AbortController | null;
    targets: string[];
    activate: (href: string) => void;
}

const models = new Map<monaco.editor.ITextModel, LinkModelEntry>();
const modelsById = new Map<string, LinkModelEntry>();
let nextModelId = 0;
let providerRegistration: monaco.IDisposable | undefined;
let openerRegistration: monaco.IDisposable | undefined;
// Monaco's hover renderer only preserves links with an allowed scheme.
const editorLinkAuthority = 'editor-link.gomarkedit.invalid';

/** Monaco registrations are global; model identity keeps each click with its editor. */
export function registerEditorLinkModel(
    model: monaco.editor.ITextModel,
    activate: (href: string) => void,
): monaco.IDisposable {
    if (providerRegistration === undefined) {
        providerRegistration = monaco.languages.registerLinkProvider(
            { language: 'markdown', exclusive: true },
            {
                async provideLinks(currentModel, token) {
                    const entry = models.get(currentModel);
                    if (entry === undefined || token.isCancellationRequested) return { links: [] };
                    const version = currentModel.getVersionId();
                    entry.pending?.abort();
                    const generation = ++entry.generation;
                    entry.targets = [];
                    entry.parsedVersion = null;
                    let links: EditorLink[];
                    if (entry.completed?.version === version) {
                        links = entry.completed.links;
                    } else {
                        const control = new AbortController();
                        entry.pending = control;
                        const subscription = token.onCancellationRequested(() => control.abort());
                        try {
                            const result = await runEditorLinkExtraction(currentModel.getValue(), control.signal);
                            if (result.kind !== 'links') return { links: [] };
                            links = result.links;
                        } finally {
                            subscription.dispose();
                            if (entry.pending === control) entry.pending = null;
                        }
                    }
                    if (
                        token.isCancellationRequested ||
                        models.get(currentModel) !== entry ||
                        entry.generation !== generation ||
                        currentModel.getVersionId() !== version
                    )
                        return { links: [] };
                    entry.completed = { version, links };
                    entry.parsedVersion = version;
                    entry.targets = links.map((link) => link.href);
                    return {
                        links: links.map((link, index) => ({
                            range: link.range,
                            url: monaco.Uri.from({
                                scheme: 'https',
                                authority: editorLinkAuthority,
                                path: `/${entry.id}/${generation}/${index}`,
                            }),
                        })),
                    };
                },
            },
        );
    }
    // Keep one opener for the app lifetime: a hover action can outlive its model,
    // and an abandoned synthetic HTTPS URL must still be consumed locally.
    if (openerRegistration === undefined) {
        openerRegistration = monaco.editor.registerLinkOpener({
            open(resource) {
                if (resource.scheme === 'https' && resource.authority === editorLinkAuthority) {
                    const match = /^\/([^/]+)\/(\d+)\/(\d+)$/u.exec(resource.path);
                    if (match !== null && resource.query === '' && resource.fragment === '') {
                        const entry = modelsById.get(match[1]);
                        if (
                            entry !== undefined &&
                            entry.generation === Number(match[2]) &&
                            entry.model.getVersionId() === entry.parsedVersion
                        ) {
                            const target = entry.targets[Number(match[3])];
                            if (target !== undefined) entry.activate(target);
                        }
                    }
                    // Unknown or stale editor links must never reach Monaco's browser opener.
                    return true;
                }
                return false;
            },
        });
    }

    const previous = models.get(model);
    if (previous !== undefined) {
        previous.pending?.abort();
        previous.targets = [];
        previous.completed = null;
        previous.parsedVersion = null;
        modelsById.delete(previous.id);
    }
    const entry: LinkModelEntry = {
        id: String(++nextModelId),
        model,
        generation: 0,
        parsedVersion: null,
        completed: null,
        pending: null,
        targets: [],
        activate,
    };
    models.set(model, entry);
    modelsById.set(entry.id, entry);
    return {
        dispose(): void {
            if (models.get(model) !== entry) return;
            entry.pending?.abort();
            models.delete(model);
            modelsById.delete(entry.id);
            entry.targets = [];
            entry.completed = null;
            if (models.size === 0) {
                providerRegistration?.dispose();
                providerRegistration = undefined;
            }
        },
    };
}

self.MonacoEnvironment = {
    getWorker(): Worker {
        return new EditorWorker();
    },
};

export function applyMonacoThemeFromRoot(afterApply?: () => void): () => void {
    registerGeneratedThemes({
        defineTheme(name, definition): void {
            monaco.editor.defineTheme(name, {
                ...definition,
                colors: { ...definition.colors },
                rules: definition.rules.map((rule) => ({ ...rule })),
            });
        },
        setTheme(name): void {
            monaco.editor.setTheme(name);
        },
    });
    return observeRootTheme(document.documentElement, monaco.editor, afterApply);
}

export { monaco };
