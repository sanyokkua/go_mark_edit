import { act, render, screen, waitFor } from '@testing-library/react';

import { mermaidQueue, type MermaidResult } from '../../../src/logic/markdown/mermaid/queue';
import { resolveMermaidTheme } from '../../../src/logic/markdown/mermaid/theme';
import MermaidBlock from '../../../src/ui/components/MermaidBlock';

jest.mock('../../../src/logic/markdown/mermaid/queue', () => ({
    mermaidQueue: { render: jest.fn() },
}));
jest.mock('../../../src/logic/markdown/mermaid/theme', () => ({
    resolveMermaidTheme: jest.fn(),
}));

const mockRender = jest.mocked(mermaidQueue.render);
const mockTheme = jest.mocked(resolveMermaidTheme);
const svg = (label: string): MermaidResult => ({
    kind: 'svg',
    svg: `<svg xmlns="http://www.w3.org/2000/svg"><g id="node"><title>${label}</title></g></svg>`,
});

function deferred(): { promise: Promise<MermaidResult>; resolve: (result: MermaidResult) => void } {
    let resolve!: (result: MermaidResult) => void;
    const promise = new Promise<MermaidResult>((done) => {
        resolve = done;
    });
    return { promise, resolve };
}

beforeEach(() => {
    mockRender.mockReset().mockResolvedValue(svg('ready'));
    mockTheme.mockReset().mockImplementation(() => document.documentElement.getAttribute('data-theme') ?? 'first');
});

afterEach(() => document.documentElement.removeAttribute('data-theme'));

it('shows a source-length placeholder at 50,001 characters without scheduling a diagram', () => {
    render(<MermaidBlock index={1} source={'x'.repeat(50_001)} sourceLine={7} />);
    expect(screen.getByText('Diagram too large to render')).toBeInTheDocument();
    expect(screen.getByText('Diagram too large to render').closest('[data-source-line]')).toHaveAttribute(
        'data-source-line',
        '7',
    );
    expect(mockRender).not.toHaveBeenCalled();
});

it('renders the 50th diagram and replaces the 51st with a count placeholder', async () => {
    const { container } = render(
        <>
            <MermaidBlock index={50} source="graph TD; A-->B" />
            <MermaidBlock index={51} source="graph TD; B-->C" />
        </>,
    );
    await waitFor(() => expect(container.querySelector('[data-mermaid-block="50"] svg')).not.toBeNull());
    expect(screen.getByText('Too many diagrams to render')).toBeInTheDocument();
    expect(mockRender).toHaveBeenCalledTimes(1);
});

it('accepts exactly 50,000 source characters for rendering', async () => {
    render(<MermaidBlock index={1} source={'x'.repeat(50_000)} />);
    await screen.findByRole('img', { name: 'Mermaid diagram' });
    expect(mockRender).toHaveBeenCalledTimes(1);
});

it('discards an old completion after the source changes and aborts both requests on unmount', async () => {
    const old = deferred();
    const latest = deferred();
    mockRender.mockReturnValueOnce(old.promise).mockReturnValueOnce(latest.promise);
    const { container, rerender, unmount } = render(<MermaidBlock index={1} source="old" />);
    const oldSignal = mockRender.mock.calls[0][0].signal;
    rerender(<MermaidBlock index={1} source="new" />);
    expect(oldSignal.aborted).toBe(true);
    await act(async () => latest.resolve(svg('new diagram')));
    await act(async () => old.resolve(svg('old diagram')));
    expect(container.querySelector('[data-mermaid-block]')).toHaveTextContent('new diagram');
    expect(container.querySelector('[data-mermaid-block]')).not.toHaveTextContent('old diagram');
    const newSignal = mockRender.mock.calls[1][0].signal;
    unmount();
    expect(newSignal.aborted).toBe(true);
});

it('redraws after a root theme change while keeping the earlier SVG visible until replacement', async () => {
    const second = deferred();
    mockRender.mockResolvedValueOnce(svg('first diagram')).mockReturnValueOnce(second.promise);
    const { container } = render(<MermaidBlock index={1} source="graph TD; A-->B" />);
    await screen.findByText('first diagram');
    act(() => document.documentElement.setAttribute('data-theme', 'second'));
    await waitFor(() => expect(mockRender).toHaveBeenCalledTimes(2));
    expect(mockRender.mock.calls[1][0].theme).toBe('second');
    expect(container.querySelector('[data-mermaid-block]')).toHaveTextContent('first diagram');
    await act(async () => second.resolve(svg('second diagram')));
    expect(container.querySelector('[data-mermaid-block]')).toHaveTextContent('second diagram');
});

it('shows the full parser message locally while a sibling diagram succeeds', async () => {
    const message = 'Parse error on line 2:\nExpecting NODE_STRING at column 7';
    mockRender.mockResolvedValueOnce({ kind: 'error', message }).mockResolvedValueOnce(svg('sibling'));
    render(
        <>
            <MermaidBlock index={1} source="invalid" />
            <MermaidBlock index={2} source="valid" />
        </>,
    );
    const alert = await screen.findByRole('alert');
    expect(alert.querySelector('pre')?.textContent).toBe(message);
    expect(screen.getByRole('alert')).toHaveTextContent('Mermaid diagram error');
    expect(await screen.findByText('sibling')).toBeInTheDocument();
});

it('distinguishes a failed module load from a render error and preserves the engine message', async () => {
    mockRender.mockResolvedValue({ kind: 'error', stage: 'load', message: 'local module unavailable' });
    render(<MermaidBlock index={1} source="graph TD; A-->B" />);
    expect(await screen.findByRole('alert')).toHaveTextContent('Mermaid could not be loaded');
    expect(screen.getByRole('alert')).toHaveTextContent('local module unavailable');
});

it('shows a non-Error rejection as its string value', async () => {
    mockRender.mockRejectedValue('layout stopped');
    render(<MermaidBlock index={1} source="graph TD; A-->B" />);
    expect(await screen.findByRole('alert')).toHaveTextContent('layout stopped');
});

it('gives duplicate SVG ids unique namespaces for each mounted diagram', async () => {
    const { container } = render(
        <>
            <MermaidBlock index={1} source="one" />
            <MermaidBlock index={2} source="two" />
        </>,
    );
    await waitFor(() => expect(container.querySelectorAll('[data-mermaid-block] svg')).toHaveLength(2));
    const ids = [...container.querySelectorAll('[data-mermaid-block] svg g')].map((node) => node.id);
    expect(ids[0]).not.toBe(ids[1]);
});
