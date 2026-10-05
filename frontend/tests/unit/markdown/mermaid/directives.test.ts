import { mermaidConfig } from '../../../../src/logic/markdown/mermaid/config';

it('keeps the application palette and safety settings when a diagram supplies an init directive', async () => {
    const mermaid = (await import('mermaid')).default;
    const theme = JSON.stringify({ darkMode: false, themeVariables: { primaryColor: 'rgb(1, 2, 3)' } });
    mermaid.initialize(mermaidConfig(theme));
    await mermaid.parse(
        '%%{init: {"theme":"dark","themeCSS":"@import url(https://example.org/a.css)","htmlLabels":true}}%%\nflowchart TD; A-->B',
    );
    expect(mermaid.mermaidAPI.getConfig()).toMatchObject({
        theme: 'base',
        htmlLabels: false,
        themeVariables: { primaryColor: 'rgb(1, 2, 3)' },
    });
    expect(mermaid.mermaidAPI.getConfig().themeCSS ?? '').not.toContain('example.org');
});
