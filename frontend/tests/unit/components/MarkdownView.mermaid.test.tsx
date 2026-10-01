import { render, screen, waitFor } from '@testing-library/react';

import { mermaidQueue } from '../../../src/logic/markdown/mermaid/queue';
import MarkdownView from '../../../src/ui/components/MarkdownView';

jest.mock('../../../src/logic/markdown/mermaid/queue', () => ({
    mermaidQueue: { render: jest.fn() },
}));
jest.mock('../../../src/logic/markdown/mermaid/theme', () => ({
    resolveMermaidTheme: jest.fn(() => 'theme-one'),
}));

const mockRender = jest.mocked(mermaidQueue.render);

beforeEach(() => {
    mockRender.mockResolvedValue({ kind: 'svg', svg: '<svg xmlns="http://www.w3.org/2000/svg"><g id="node"/></svg>' });
});

it.each(['minimal', 'gfm', 'full'] as const)(
    'replaces a Mermaid fence with a line-anchored diagram at %s',
    async (standard) => {
        const source = 'Before\n\n```mermaid\ngraph TD\n  A-->B\n```\n\n```go\npackage main\n```';
        const { container } = render(<MarkdownView source={source} standard={standard} />);

        await waitFor(() => expect(container.querySelector('[data-mermaid-block] svg')).not.toBeNull());
        expect(container.querySelector('[data-mermaid-block]')).toHaveAttribute('data-source-line', '3');
        expect(container.querySelector('pre [data-mermaid-block]')).toBeNull();
        expect(container.querySelector('pre code.language-mermaid')).toBeNull();
        expect(container.querySelector('pre code.language-go')).toHaveTextContent('package main');
        expect(screen.getByText('Before')).toBeInTheDocument();
        expect(mockRender).toHaveBeenCalledWith(
            expect.objectContaining({ source: 'graph TD\n  A-->B', theme: 'theme-one' }),
        );
    },
);

it('keeps a deliberate trailing newline in the diagram source', async () => {
    render(<MarkdownView source={'```mermaid\ngraph TD\n  A-->B\n\n```'} standard="full" />);
    await waitFor(() => expect(mockRender).toHaveBeenCalled());
    expect(mockRender).toHaveBeenCalledWith(expect.objectContaining({ source: 'graph TD\n  A-->B\n' }));
});

it('keeps the authored trailing newline of raw HTML Mermaid code', async () => {
    render(
        <MarkdownView source={'<pre><code class="language-mermaid">graph TD\nA-->B\n</code></pre>'} standard="full" />,
    );
    await waitFor(() => expect(mockRender).toHaveBeenCalled());
    expect(mockRender).toHaveBeenCalledWith(expect.objectContaining({ source: 'graph TD\nA-->B\n' }));
});

it('renders the first 50 numbered Mermaid blocks and replaces the next one with a placeholder', async () => {
    const source = Array.from({ length: 51 }, (_, index) => `\`\`\`mermaid\ngraph TD\n  A-->B${index}\n\`\`\``).join(
        '\n\n',
    );
    const { container } = render(<MarkdownView source={source} standard="minimal" />);
    await waitFor(() => expect(container.querySelectorAll('[data-mermaid-block] svg')).toHaveLength(50));
    expect(container.querySelector('[data-mermaid-block="51"]')).toHaveTextContent('Too many diagrams to render');
    expect(mockRender).toHaveBeenCalledTimes(50);
});
