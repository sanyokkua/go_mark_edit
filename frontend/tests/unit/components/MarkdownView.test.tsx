import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { fireEvent, render, screen } from '@testing-library/react';
import type { Plugin } from 'unified';

import { createPipeline } from '../../../src/logic/markdown/pipeline';

import MarkdownView, { type CommittedMarkdownPreview } from '../../../src/ui/components/MarkdownView';

jest.mock('../../../src/logic/markdown/mermaid/queue', () => ({
    mermaidQueue: {
        render: jest.fn().mockResolvedValue({
            kind: 'svg',
            svg: '<svg xmlns="http://www.w3.org/2000/svg"><text>Rendered diagram</text></svg>',
        }),
    },
}));
jest.mock('../../../src/logic/markdown/mermaid/theme', () => ({
    resolveMermaidTheme: jest.fn(() => 'test-theme'),
}));

jest.mock('../../../src/logic/markdown/pipeline', () => {
    const actual = jest.requireActual<typeof import('../../../src/logic/markdown/pipeline')>(
        '../../../src/logic/markdown/pipeline',
    );
    return { ...actual, createPipeline: jest.fn(actual.createPipeline) };
});

const actualCreatePipeline = jest.requireActual<typeof import('../../../src/logic/markdown/pipeline')>(
    '../../../src/logic/markdown/pipeline',
).createPipeline;
const mockCreatePipeline = jest.mocked(createPipeline);

afterEach(() => mockCreatePipeline.mockReset().mockImplementation(actualCreatePipeline));

const readSource = (relativePath: string): string => readFileSync(resolve(process.cwd(), relativePath), 'utf8');

it('renders GFM features', () => {
    render(
        <MarkdownView
            standard="gfm"
            source={`| Feature | Status |
| --- | --- |
| table cell | ready |

- [x] Complete task
- [ ] Pending task

~~Struck text~~

<https://example.test/docs>`}
        />,
    );

    expect(screen.getByRole('table')).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'Feature' })).toBeInTheDocument();
    expect(screen.getByRole('cell', { name: 'table cell' })).toBeInTheDocument();

    const taskCheckboxes = screen.getAllByRole('checkbox');
    expect(taskCheckboxes).toHaveLength(2);
    expect(taskCheckboxes[0]).toBeChecked();
    expect(taskCheckboxes[0]).toBeDisabled();
    expect(taskCheckboxes[1]).not.toBeChecked();
    expect(taskCheckboxes[1]).toBeDisabled();

    const struckText = screen.getByText('Struck text');
    expect(struckText.tagName).toBe('DEL');
    expect(screen.getByRole('link', { name: 'https://example.test/docs' })).toHaveAttribute(
        'href',
        'https://example.test/docs',
    );
});

it('keeps higher-tier syntax literal while rendering Mermaid at GFM', async () => {
    render(
        <MarkdownView
            standard="gfm"
            source={`Inline math stays $x^2$ and :note[directive syntax] stays literal.

\`\`\`mermaid
graph TD
  A-->B
\`\`\``}
        />,
    );

    expect(screen.getByText(/\$x\^2\$/)).toBeInTheDocument();
    expect(screen.getByText('Inline math stays $x^2$ and :note[directive syntax] stays literal.')).toBeInTheDocument();
    expect(await screen.findByRole('img', { name: 'Mermaid diagram' })).toHaveTextContent('Rendered diagram');
    expect(screen.queryByText(/graph TD\s+A-->B/)).not.toBeInTheDocument();
});

it('(EC-RENDER-5) disables raw HTML and dangerous URLs', () => {
    const { container } = render(
        <MarkdownView
            standard="gfm"
            source={`<button onclick="window.__rawHtmlExecuted = true">Raw control</button>

[Dangerous command](javascript:alert('unsafe'))`}
        />,
    );

    const previewRoot = container.querySelector('.gme-preview');
    const stylesSource = readSource('src/ui/components/MarkdownView.module.css');
    const previewSource = readSource('src/ui/components/MarkdownView.tsx');

    expect(previewRoot).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Raw control' })).not.toBeInTheDocument();
    expect(window).not.toHaveProperty('__rawHtmlExecuted');
    expect(screen.getByText('Dangerous command')).not.toHaveAttribute('href');
    expect(stylesSource).toContain('var(--preview-font-family)');
    expect(stylesSource).not.toMatch(/#[\da-f]{3,8}\b|rgba?\(|hsla?\(/i);
    expect(previewSource).not.toContain('style=');
});

it('(EC-RENDER-7) blocks document-supplied resource requests', () => {
    const imageSourceDescriptor = Object.getOwnPropertyDescriptor(HTMLImageElement.prototype, 'src');
    const assignedSources: string[] = [];

    Object.defineProperty(HTMLImageElement.prototype, 'src', {
        configurable: true,
        get: imageSourceDescriptor?.get,
        set(value: string): void {
            assignedSources.push(value);
            imageSourceDescriptor?.set?.call(this, value);
        },
    });

    try {
        render(
            <MarkdownView
                standard="gfm"
                source={`![Remote image](https://example.test/preview.png)

![Local image](../preview.png)`}
            />,
        );
    } finally {
        if (imageSourceDescriptor === undefined) {
            delete (HTMLImageElement.prototype as { src?: string }).src;
        } else {
            Object.defineProperty(HTMLImageElement.prototype, 'src', imageSourceDescriptor);
        }
    }

    const fallbacks = screen.getAllByRole('img');
    expect(fallbacks).toHaveLength(2);
    expect(fallbacks[0]).toHaveAccessibleName('Remote image');
    expect(fallbacks[0]).not.toHaveAttribute('src');
    expect(fallbacks[1]).toHaveAccessibleName('Local image');
    expect(fallbacks[1]).not.toHaveAttribute('src');
    expect(assignedSources).toEqual([]);
});

it('routes only the resolver-approved local image and keeps web images as placeholders', () => {
    const resolveImage = jest.fn((source: string): string | undefined =>
        source === './local.png' ? '/preview-image?doc=doc-1&src=.%2Flocal.png' : undefined,
    );

    render(
        <MarkdownView
            standard="gfm"
            imageSourceResolver={resolveImage}
            source={`![Local image](./local.png)

![Remote image](https://example.test/preview.png)`}
        />,
    );

    const localImage = screen.getByRole('img', { name: 'Local image' });
    expect(localImage.tagName).toBe('IMG');
    expect(localImage).toHaveAttribute('src', '/preview-image?doc=doc-1&src=.%2Flocal.png');

    const remoteImage = screen.getByRole('img', { name: 'Remote image' });
    expect(remoteImage.tagName).toBe('SPAN');
    expect(remoteImage).not.toHaveAttribute('src');
    expect(resolveImage).toHaveBeenCalledWith('./local.png');
    expect(resolveImage).toHaveBeenCalledWith('https://example.test/preview.png');
});

it('keeps the preview visible when a local image resolver throws', () => {
    render(
        <MarkdownView
            standard="gfm"
            imageSourceResolver={(): string => {
                throw new Error('local route unavailable');
            }}
            source={'# Still visible\n\n![Missing](./image.png)'}
        />,
    );

    expect(screen.getByRole('heading', { name: 'Still visible' })).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Missing' }).tagName).toBe('SPAN');
});

it('keeps an unchanged heading element when the document text changes after it', () => {
    const { rerender } = render(<MarkdownView standard="gfm" source={'# Title\n\nFirst paragraph.\n'} />);
    const heading = screen.getByRole('heading', { level: 1 });

    rerender(<MarkdownView standard="gfm" source={'# Title\n\nFirst paragraph.\n\nSecond paragraph.\n'} />);

    expect(screen.getByRole('heading', { level: 1 })).toBe(heading);
});

it('renders GFM syntax at GFM and Full, but shows it literally at Minimal', () => {
    const source = '| Name |\n| --- |\n| Ada |\n\n~~removed~~';
    const { rerender } = render(<MarkdownView documentId="one" source={source} standard="gfm" />);
    expect(screen.getByRole('table')).toBeInTheDocument();
    expect(screen.getByText('removed').tagName).toBe('DEL');

    rerender(<MarkdownView documentId="one" source={source} standard="full" />);
    expect(screen.getByRole('table')).toBeInTheDocument();

    rerender(<MarkdownView documentId="one" source={source} standard="minimal" />);
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
    expect(screen.getByText(/\| Ada \|/)).toBeInTheDocument();
    expect(screen.getByText(/~~removed~~/)).toBeInTheDocument();
});

it.each(['minimal', 'gfm'] as const)('colours a Go fence at %s', (standard) => {
    const { container } = render(<MarkdownView source={'```go\nfunc main() {}\n```'} standard={standard} />);
    expect(container.querySelector('pre code')).toHaveTextContent('func main() {}');
    expect(container.querySelector('pre code .hljs-keyword')).toHaveTextContent('func');
});

it('keeps committed output above a source-specific render failure and clears the error on recovery', () => {
    const throwForBadSource: Plugin = () => (_tree, file) => {
        if (String(file.value).includes('broken source')) throw new Error('parse failed');
    };
    mockCreatePipeline.mockImplementation((standard) => {
        const pipeline = actualCreatePipeline(standard);
        return { ...pipeline, remarkPlugins: [...pipeline.remarkPlugins, throwForBadSource] };
    });
    const { rerender } = render(<MarkdownView documentId="one" source="**safe output**" standard="gfm" />);
    expect(screen.getByText('safe output').tagName).toBe('STRONG');

    rerender(<MarkdownView documentId="one" source="broken source" standard="gfm" />);
    expect(screen.getByRole('alert')).toHaveTextContent('Preview could not be rendered');
    expect(screen.getByText('safe output').tagName).toBe('STRONG');
    expect(screen.queryByText('broken source')).toBeNull();

    rerender(<MarkdownView documentId="one" source="**recovered output**" standard="gfm" />);
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.getByText('recovered output').tagName).toBe('STRONG');
    expect(screen.queryByText('safe output')).toBeNull();
});

it('retains a committed render when every later pipeline attempt throws, including after a standard change', () => {
    let failAll = false;
    const throwWhileUnavailable: Plugin = () => () => {
        if (failAll) throw new Error('pipeline unavailable');
    };
    mockCreatePipeline.mockImplementation((standard) => {
        const pipeline = actualCreatePipeline(standard);
        return { ...pipeline, remarkPlugins: [...pipeline.remarkPlugins, throwWhileUnavailable] };
    });
    const { rerender } = render(<MarkdownView documentId="one" source="**committed**" standard="gfm" />);
    failAll = true;

    rerender(<MarkdownView documentId="one" source="candidate one" standard="minimal" />);
    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(screen.getByText('committed').tagName).toBe('STRONG');

    rerender(<MarkdownView documentId="one" source="candidate two" standard="full" />);
    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(screen.getByText('committed').tagName).toBe('STRONG');

    failAll = false;
    rerender(<MarkdownView documentId="one" source="**available again**" standard="full" />);
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.getByText('available again')).toBeInTheDocument();
});

it('shows only the error without a prior successful render and never carries another document output across identities', () => {
    const throwForBadSource: Plugin = () => (_tree, file) => {
        if (String(file.value).includes('broken')) throw new Error('parse failed');
    };
    mockCreatePipeline.mockImplementation((standard) => {
        const pipeline = actualCreatePipeline(standard);
        return { ...pipeline, remarkPlugins: [...pipeline.remarkPlugins, throwForBadSource] };
    });
    const { rerender } = render(<MarkdownView documentId="one" source="broken" standard="gfm" />);
    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(screen.queryByRole('article')).toBeNull();

    rerender(<MarkdownView documentId="one" source="**one only**" standard="gfm" />);
    expect(screen.getByText('one only')).toBeInTheDocument();
    rerender(<MarkdownView documentId="two" source="broken" standard="gfm" />);
    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(screen.queryByText('one only')).toBeNull();
});

it('does not parse or fabricate a successful snapshot while suspended', () => {
    mockCreatePipeline.mockImplementation(() => {
        throw new Error('renderer unavailable');
    });
    const { rerender } = render(<MarkdownView documentId="one" source="pending" standard="gfm" suspended />);
    expect(mockCreatePipeline).not.toHaveBeenCalled();
    expect(screen.queryByRole('article')).toBeNull();

    rerender(<MarkdownView documentId="one" source="pending" standard="gfm" />);
    expect(screen.getByRole('alert')).toHaveTextContent('Preview could not be rendered');
    expect(screen.getByRole('alert')).not.toHaveTextContent('Showing the last successful version');
    expect(screen.queryByRole('article')).toBeNull();
});

it('uses the current link owner and document path for retained output after a failed remount', () => {
    const firstOwner = jest.fn();
    const secondOwner = jest.fn();
    const thirdOwner = jest.fn();
    const committed = jest.fn<void, [CommittedMarkdownPreview]>();
    const first = render(
        <MarkdownView
            documentId="one"
            documentPath="/old/note.md"
            source="[Sibling](./sibling.md)"
            standard="gfm"
            onActivateLink={firstOwner}
            onPreviewCommitted={committed}
        />,
    );
    const preview = committed.mock.calls[0][0];
    first.unmount();
    mockCreatePipeline.mockImplementation(() => {
        throw new Error('pipeline unavailable');
    });
    const { rerender } = render(
        <MarkdownView
            documentId="one"
            documentPath="/new/note.md"
            source="broken"
            standard="gfm"
            committedPreview={preview}
            onActivateLink={secondOwner}
        />,
    );
    expect(screen.getByRole('alert')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('link', { name: 'Sibling' }));
    expect(secondOwner).toHaveBeenCalledWith('one', {
        kind: 'localDocument',
        href: './sibling.md',
        path: '/new/sibling.md',
    });
    expect(firstOwner).not.toHaveBeenCalled();
    const attempts = mockCreatePipeline.mock.calls.length;

    rerender(
        <MarkdownView
            documentId="one"
            documentPath="/latest/note.md"
            source="broken"
            standard="gfm"
            committedPreview={preview}
            onActivateLink={thirdOwner}
        />,
    );
    fireEvent.click(screen.getByRole('link', { name: 'Sibling' }));
    expect(thirdOwner).toHaveBeenCalledWith('one', {
        kind: 'localDocument',
        href: './sibling.md',
        path: '/latest/sibling.md',
    });
    expect(secondOwner).toHaveBeenCalledTimes(1);
    expect(mockCreatePipeline).toHaveBeenCalledTimes(attempts);
});

it('uses the current image resolver and local failure handling for retained output without reparsing', () => {
    const committed = jest.fn<void, [CommittedMarkdownPreview]>();
    const first = render(
        <MarkdownView
            documentId="one"
            source="![Local](./local.png)"
            standard="gfm"
            imageSourceResolver={() => '/preview-image?owner=old'}
            onPreviewCommitted={committed}
        />,
    );
    const preview = committed.mock.calls[0][0];
    first.unmount();
    mockCreatePipeline.mockImplementation(() => {
        throw new Error('pipeline unavailable');
    });
    const { rerender } = render(
        <MarkdownView
            documentId="one"
            source="broken"
            standard="gfm"
            committedPreview={preview}
            imageSourceResolver={() => '/preview-image?owner=current'}
        />,
    );
    expect(screen.getByRole('img', { name: 'Local' })).toHaveAttribute('src', '/preview-image?owner=current');
    const attempts = mockCreatePipeline.mock.calls.length;

    rerender(
        <MarkdownView
            documentId="one"
            source="broken"
            standard="gfm"
            committedPreview={preview}
            imageSourceResolver={() => {
                throw new Error('local route unavailable');
            }}
        />,
    );
    expect(screen.getByRole('img', { name: 'Local' }).tagName).toBe('SPAN');

    rerender(
        <MarkdownView
            documentId="one"
            source="broken"
            standard="gfm"
            committedPreview={preview}
            imageSourceResolver={() => '/preview-image?owner=latest'}
        />,
    );
    const image = screen.getByRole('img', { name: 'Local' });
    expect(image).toHaveAttribute('src', '/preview-image?owner=latest');
    fireEvent.error(image);
    expect(screen.getByRole('img', { name: 'Local' }).tagName).toBe('SPAN');
    expect(mockCreatePipeline).toHaveBeenCalledTimes(attempts);
});
