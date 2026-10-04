import type { MermaidConfig } from 'mermaid';

const secure = [
    'secure',
    'securityLevel',
    'startOnLoad',
    'maxTextSize',
    'suppressErrorRendering',
    'maxEdges',
    'theme',
    'themeVariables',
    'themeCSS',
    'look',
    'layout',
    'fontFamily',
    'altFontFamily',
    'fontSize',
    'htmlLabels',
    'flowchart',
    'sequence',
    'logLevel',
    'deterministicIds',
    'deterministicIDSeed',
    'dompurifyConfig',
    'handDrawnSeed',
    'elk',
    'darkMode',
    'markdownAutoWrap',
    'wrap',
];

interface ThemeSnapshot {
    darkMode: boolean;
    themeVariables: Record<string, string>;
}

/** A queued job uses the palette captured by its caller, never the current root theme. */
export function mermaidConfig(theme: string): MermaidConfig {
    const snapshot = JSON.parse(theme) as ThemeSnapshot;
    return {
        startOnLoad: false,
        securityLevel: 'strict',
        htmlLabels: false,
        suppressErrorRendering: true,
        theme: 'base',
        themeVariables: snapshot.themeVariables,
        darkMode: snapshot.darkMode,
        maxTextSize: 50000,
        maxEdges: 500,
        logLevel: 'fatal',
        fontFamily: 'system-ui, sans-serif',
        secure,
    };
}
