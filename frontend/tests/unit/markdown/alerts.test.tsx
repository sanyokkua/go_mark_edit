import { render, screen } from '@testing-library/react';

import { extractHeadings } from '../../../src/logic/markdown/headings';
import MarkdownView from '../../../src/ui/components/MarkdownView';

function preview(source: string, standard: 'minimal' | 'gfm' | 'full' = 'full'): HTMLElement {
    return render(<MarkdownView source={source} standard={standard} />).container;
}

const kinds = ['note', 'tip', 'important', 'warning', 'caution'] as const;

it.each(kinds)('renders the %s container with its localized title and icon', (kind) => {
    const container = preview(`:::${kind}\nBody\n:::`);
    const alert = screen.getByRole('note');
    expect(alert).toHaveTextContent(new RegExp(kind, 'i'));
    expect(alert).toHaveTextContent('Body');
    expect(alert.querySelector('svg[data-icon-name]')).not.toBeNull();
    expect(alert).toHaveAttribute('data-source-line', '1');
    expect(container.querySelector('blockquote')).toBeNull();
});

it('renders GitHub and container warnings with the same body structure', () => {
    const github = preview('> [!WARNING]\n> Check **this**.\n>\n> - First\n> - Second');
    const directive = preview(':::warning\nCheck **this**.\n\n- First\n- Second\n:::');
    const alerts = [github, directive].map((root) => root.querySelector('[role="note"]'));
    expect(alerts[0]).not.toBeNull();
    expect(alerts[1]).not.toBeNull();
    for (const alert of alerts) {
        expect(alert).toHaveAttribute('role', 'note');
        expect(alert?.querySelector('strong')).toHaveTextContent('this');
        expect(alert?.querySelectorAll('li')).toHaveLength(2);
        expect(alert?.querySelectorAll('p')).toHaveLength(2);
    }
    expect(alerts[0]?.className).toBe(alerts[1]?.className);
    expect(alerts[0]?.textContent?.replace(/\s+/gu, ' ').trim()).toBe(
        alerts[1]?.textContent?.replace(/\s+/gu, ' ').trim(),
    );
});

it('recognizes case-insensitive markers only when alone on the first line', () => {
    const container = preview(
        '> [!wArNiNg]\n> Body\n\n> [!NOTE] extra\n> Body\n\n> [!NOTE]**extra**\n\n> Intro\n> [!TIP]',
    );
    expect(container.querySelectorAll('[role="note"]')).toHaveLength(1);
    expect(screen.getByRole('note')).toHaveTextContent('Body');
    expect(container.querySelectorAll('blockquote')).toHaveLength(3);
    expect(container.querySelector('blockquote')).toHaveTextContent('[!NOTE] extra');
});

it('retains body blocks and source lines when the marker has no same-line body', () => {
    const container = preview('Intro\n\n> [!NOTE]\n> First *line*\n>\n> ## Inner\n>\n> Last');
    const alert = screen.getByRole('note');
    expect(alert).toHaveAttribute('data-source-line', '3');
    expect(alert.querySelector('em')).toHaveTextContent('line');
    expect(alert.querySelector('h2')).toHaveTextContent('Inner');
    expect(alert.querySelector('h2')).toHaveAttribute('data-source-line', '6');
    expect(alert).toHaveTextContent('Last');
    expect(container).not.toHaveTextContent('[!NOTE]');
});

it('keeps unknown containers literal and excludes their headings from extraction', () => {
    const source = '# Repeat\n\n:::foo\n# Repeat\n::: \n\n# Repeat';
    const container = preview(source);
    expect(container).toHaveTextContent(':::foo');
    expect(container).toHaveTextContent('# Repeat');
    expect(container.querySelectorAll('h1')).toHaveLength(2);
    expect(extractHeadings(source)).toEqual([
        { depth: 1, text: 'Repeat', slug: 'repeat', line: 1 },
        { depth: 1, text: 'Repeat', slug: 'repeat-1', line: 7 },
    ]);
});

it('keeps text and leaf directive lookalikes as prose', () => {
    const container = preview('12:30 foo:bar ::x Note:this');
    expect(container).toHaveTextContent('12:30 foo:bar ::x Note:this');
});

it('treats an unclosed known container as extending to document end', () => {
    const container = preview(':::note\nFirst\n\n## Inside');
    const alert = screen.getByRole('note');
    expect(alert).toHaveTextContent('First');
    expect(alert.querySelector('h2')).toHaveTextContent('Inside');
    expect(container.querySelectorAll('h2')).toHaveLength(1);
});

it('renders a known container nested in another known container', () => {
    const container = preview('::::note\nOuter\n\n:::warning\nInner\n:::\n::::');
    const alerts = container.querySelectorAll('[role="note"]');
    expect(alerts).toHaveLength(2);
    expect(alerts[0]).toHaveTextContent('Outer');
    expect(alerts[1]).toHaveTextContent('Warning');
    expect(alerts[1]).toHaveTextContent('Inner');
    expect(alerts[1]).toHaveAttribute('data-source-line', '4');
});

it('keeps a nested unknown container literal without counting its heading', () => {
    const source = '# Repeat\n\n::::note\nOuter\n\n:::foo\n# Repeat\n:::\n\n## Visible\n::::\n\n# Repeat';
    const container = preview(source);
    const alert = container.querySelector('[role="note"]');
    expect(alert).toHaveTextContent(':::foo');
    expect(alert).toHaveTextContent('# Repeat');
    expect(alert?.querySelectorAll('h1')).toHaveLength(0);
    expect(alert?.querySelector('h2')).toHaveTextContent('Visible');
    expect(extractHeadings(source)).toEqual([
        { depth: 1, text: 'Repeat', slug: 'repeat', line: 1 },
        { depth: 2, text: 'Visible', slug: 'visible', line: 10 },
        { depth: 1, text: 'Repeat', slug: 'repeat-1', line: 13 },
    ]);
});

it.each(['minimal', 'gfm'] as const)('keeps alerts and containers literal under %s', (standard) => {
    const container = preview('> [!WARNING]\n> Body\n\n:::note\nBody\n:::', standard);
    expect(container.querySelector('[role="note"]')).toBeNull();
    expect(container).toHaveTextContent('[!WARNING]');
    expect(container).toHaveTextContent(':::note');
});

it('does not promote author-supplied classes into alerts', () => {
    const container = preview('<div class="md-alert md-alert-warning">Unsafe</div>');
    expect(container.querySelector('[role="note"]')).toBeNull();
    expect(container).not.toHaveTextContent('Warning');
});
