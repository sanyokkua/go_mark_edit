const tokens = {
    primaryColor: '--surface',
    primaryTextColor: '--text',
    primaryBorderColor: '--accent',
    secondaryColor: '--surface-raised',
    secondaryTextColor: '--text',
    secondaryBorderColor: '--border',
    tertiaryColor: '--surface',
    tertiaryTextColor: '--text',
    tertiaryBorderColor: '--border',
    lineColor: '--border',
    textColor: '--text',
    mainBkg: '--surface',
    nodeBorder: '--accent',
    clusterBkg: '--surface-raised',
    clusterBorder: '--border',
    titleColor: '--text',
    actorBkg: '--surface',
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

/** Read and resolve tokens synchronously so later theme changes cannot recolour queued jobs. */
export function resolveMermaidTheme(): string {
    const probe = document.createElement('span');
    probe.style.position = 'absolute';
    probe.style.visibility = 'hidden';
    document.body.appendChild(probe);
    try {
        const themeVariables: Record<string, string> = {};
        for (const [variable, token] of Object.entries(tokens)) {
            probe.style.color = `var(${token})`;
            themeVariables[variable] = rgbColor(window.getComputedStyle(probe).color);
        }
        return JSON.stringify({
            darkMode: document.documentElement.getAttribute('data-mode') === 'dark',
            themeVariables,
        });
    } finally {
        probe.remove();
    }
}
