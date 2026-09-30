import { render } from '@testing-library/react';
import { createElement } from 'react';

import MarkdownView from '../../../src/ui/components/MarkdownView';
import type { MarkdownStandard } from '../../../src/logic/markdown/pipeline';

function preview(source: string, standard: MarkdownStandard = 'full'): HTMLElement {
    return render(createElement(MarkdownView, { source, standard })).container;
}

it('renders strict inline, display, and fenced formulas while leaving currency literal', () => {
    const rendered = preview('$E=mc^2$ and $5 and $10\n\n$$\nx^2\n$$\n\n```math\ny^2\n```');
    expect(rendered.querySelectorAll('.katex')).toHaveLength(3);
    expect(rendered.querySelectorAll('.katex-display')).toHaveLength(2);
    expect(rendered).toHaveTextContent('$5 and $10');
});

it('keeps invalid formulas local and preserves the surrounding prose and source lines', () => {
    const rendered = preview('Before $\\badcommand{x}$ after.\n\n$$\n\\badcommand{y}\n$$\n\nFollowing paragraph.');
    expect(rendered.querySelectorAll('.katex-error')).toHaveLength(2);
    expect(rendered.querySelectorAll('.katex-error')[0]).toHaveTextContent('\\badcommand{x}');
    expect(rendered.querySelectorAll('.katex-error')[1]).toHaveTextContent('\\badcommand{y}');
    expect(rendered).toHaveTextContent('Before');
    expect(rendered).toHaveTextContent('after.');
    expect(rendered).toHaveTextContent('Following paragraph.');
    expect(rendered.querySelector('[data-source-line="3"]')).not.toBeNull();
});

it('keeps the source of an invalid formula with nested allowed HTML', () => {
    const rendered = preview('Before <code class="language-math"><em>\\badcommand{y}</em></code> after.');
    expect(rendered.querySelector('.katex-error')).toHaveTextContent('\\badcommand{y}');
    expect(rendered).toHaveTextContent('Before');
    expect(rendered).toHaveTextContent('after.');
});

it('keeps a display error local when raw pre contains allowed content before its math code', () => {
    const rendered = preview(
        'Before\n\n<pre><em>prefix</em><code class="language-math">\\badcommand{x}</code></pre>\n\nAfter',
    );
    expect(rendered.querySelector('.katex-error')).toHaveTextContent('prefix\\badcommand{x}');
    expect(rendered.querySelector('pre')).toBeNull();
    expect(rendered).toHaveTextContent('Before');
    expect(rendered).toHaveTextContent('After');
});

it('bounds the entire raw pre scope that KaTeX would render', () => {
    const rendered = preview(`<pre>${'x'.repeat(10001)}<code class="language-math">y</code></pre>`);
    expect(rendered.querySelector('[data-math-limit="too-large"]')).not.toBeNull();
    expect(rendered.querySelector('.katex')).toBeNull();
    expect(rendered.querySelector('pre')).toBeNull();
});

it('renders a raw pre with two math codes once and keeps following prose', () => {
    const rendered = preview(
        '<pre><code class="language-math">x</code><code class="language-math">y</code></pre>\n\nAfter',
    );
    expect(rendered.querySelectorAll('.katex')).toHaveLength(1);
    expect(rendered).toHaveTextContent('After');
    expect(rendered.querySelector('[data-math-limit]')).toBeNull();
});

it('keeps a failed second code in a raw pre local to one source marker', () => {
    const rendered = preview(
        '<pre><code class="language-math">x</code><code class="language-math">\\badcommand{y}</code></pre>\n\nAfter',
    );
    expect(rendered.querySelectorAll('.katex-error')).toHaveLength(1);
    expect(rendered.querySelector('.katex-error')).toHaveTextContent('x\\badcommand{y}');
    expect(rendered.querySelector('.katex')).toBeNull();
    expect(rendered).toHaveTextContent('After');
});

it('counts a raw pre with two math codes as one formula at the 1000 boundary', () => {
    const rendered = preview(
        `${'$x$ '.repeat(999)}\n\n<pre><code class="language-math">y</code><code class="language-math">z</code></pre>\n\n$last$`,
    );
    expect(rendered.querySelectorAll('.katex')).toHaveLength(1000);
    expect(rendered.querySelectorAll('[data-math-limit="too-many"]')).toHaveLength(1);
    expect(rendered).toHaveTextContent('Too many formulas to render');
});

it('counts rendered line breaks inside raw inline math toward its source limit', () => {
    const rendered = preview(`<code class="language-math">x${'<br>'.repeat(10001)}</code>`);
    expect(rendered.querySelector('[data-math-limit="too-large"]')).not.toBeNull();
    expect(rendered.querySelector('.katex')).toBeNull();
});

it('renders untrusted href commands as inert text and stops macro expansion bombs locally', () => {
    const rendered = preview('$\\href{javascript:alert(1)}{x}$ and $\\def\\x{\\x}\\x$ then safe text.');
    expect(rendered.querySelector('a[href]')).toBeNull();
    expect(rendered).toHaveTextContent('then safe text.');
    expect(rendered).toHaveTextContent('\\href');
    expect(rendered.querySelectorAll('.katex-error')).toHaveLength(1);
});

it('renders the first 1000 formulas and replaces later formulas in document order', () => {
    const rendered = preview(`${'$x$ '.repeat(1000)}$y$`);
    expect(rendered.querySelectorAll('.katex')).toHaveLength(1000);
    expect(rendered.querySelectorAll('[data-math-limit="too-many"]')).toHaveLength(1);
    expect(rendered).toHaveTextContent('Too many formulas to render');
});

it('counts nested inline and display formulas once in source order at the 1000 boundary', () => {
    const rendered = preview(`${'$x$ '.repeat(999)}\n\n> $nested$\n\n$$\nlate\n$$`);
    expect(rendered.querySelector('blockquote .katex')).not.toBeNull();
    expect(rendered.querySelector('blockquote [data-math-limit]')).toBeNull();
    expect(rendered.querySelectorAll('.katex')).toHaveLength(1000);
    expect(rendered.querySelectorAll('[data-math-limit="too-many"]')).toHaveLength(1);
    expect(rendered.querySelector('.katex-display')).toBeNull();

    const withDisplay = preview(`${'$x$ '.repeat(998)}\n\n$$\ny\n$$\n\n$final$`);
    expect(withDisplay.querySelectorAll('.katex')).toHaveLength(1000);
    expect(withDisplay.querySelector('[data-math-limit]')).toBeNull();
});

it('accepts exactly 10000 source characters and replaces 10001 before KaTeX', () => {
    const valid = preview(`$$\n${'x'.repeat(10000)}\n$$`);
    expect(valid.querySelector('.katex')).not.toBeNull();
    const oversized = preview(`$$\n${'x'.repeat(10001)}\n$$`);
    expect(oversized.querySelector('.katex')).toBeNull();
    expect(oversized.querySelector('[data-math-limit="too-large"]')).not.toBeNull();
    expect(oversized.querySelector('pre')).toBeNull();
    expect(oversized).toHaveTextContent('too large to render');
    const fence = preview(`\`\`\`math\n${'x'.repeat(10000)}\n\`\`\``);
    expect(fence.querySelector('.katex')).not.toBeNull();
    expect(fence.querySelector('[data-math-limit]')).toBeNull();
});

it('keeps math syntax literal under GFM and Minimal', () => {
    for (const standard of ['gfm', 'minimal'] as const) {
        const rendered = preview('$x^2$\n\n$$\ny^2\n$$', standard);
        expect(rendered.querySelector('.katex')).toBeNull();
        expect(rendered).toHaveTextContent('$x^2$');
        expect(rendered).toHaveTextContent('$$');
        const fenced = preview(`\`\`\`math\n${'x'.repeat(10001)}\n\`\`\``, standard);
        expect(fenced.querySelector('[data-math-limit]')).toBeNull();
        expect(fenced.querySelector('pre code')).not.toBeNull();
    }
});
