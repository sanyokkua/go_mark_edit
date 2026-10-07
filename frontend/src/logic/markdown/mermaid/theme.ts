const tokens = {
    primaryColor: '--elevated',
    primaryTextColor: '--text',
    primaryBorderColor: '--accent',
    secondaryColor: '--surface-raised',
    secondaryTextColor: '--text',
    secondaryBorderColor: '--border',
    tertiaryColor: '--elevated',
    tertiaryTextColor: '--text',
    tertiaryBorderColor: '--border',
    lineColor: '--muted',
    textColor: '--text',
    mainBkg: '--elevated',
    nodeBorder: '--accent',
    clusterBkg: '--surface-raised',
    clusterBorder: '--muted',
    titleColor: '--text',
    actorBkg: '--elevated',
    actorBorder: '--accent',
    actorTextColor: '--text',
    signalColor: '--text',
    signalTextColor: '--text',
    noteBkgColor: '--surface-raised',
    noteTextColor: '--text',
    noteBorderColor: '--border',
} as const;

function rgbColor(value: string): string {
    if (/^rgb\(\s*\d+[\s,]+\d+[\s,]+\d+\s*\)$/i.test(value)) return value;
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 1;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Unable to resolve the Mermaid theme colours');
    context.fillStyle = value;
    context.fillRect(0, 0, 1, 1);
    const [red, green, blue] = context.getImageData(0, 0, 1, 1).data;
    return `rgb(${red}, ${green}, ${blue})`;
}

/**
 * Read and resolve tokens synchronously so later theme changes cannot recolour queued jobs.
 * The probe sits inside `element`, so a Clean print copy supplies its own light tokens.
 */
export function resolveMermaidTheme(element: Element): string {
    const probe = document.createElement('span');
    probe.style.position = 'absolute';
    probe.style.visibility = 'hidden';
    element.appendChild(probe);
    try {
        const themeVariables: Record<string, string> = {};
        for (const [variable, token] of Object.entries(tokens)) {
            probe.style.color = `var(${token})`;
            themeVariables[variable] = rgbColor(window.getComputedStyle(probe).color);
        }
        const clean = element.closest("[data-print-appearance='clean']") !== null;
        return JSON.stringify({
            darkMode: !clean && element.closest('[data-mode]')?.getAttribute('data-mode') === 'dark',
            themeVariables,
        });
    } finally {
        probe.remove();
    }
}
