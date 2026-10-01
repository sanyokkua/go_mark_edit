import { namespaceMermaidSvg, scrubMermaidSvg } from '../../../../src/logic/markdown/mermaid/scrub';

function svg(value: string): SVGSVGElement {
    const parsed = new DOMParser().parseFromString(value, 'image/svg+xml');
    return parsed.documentElement as unknown as SVGSVGElement;
}

it('removes executable and externally loading SVG content while retaining local styling', () => {
    const hostile = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink">
      <script>alert(1)</script><foreignObject><div>bad</div></foreignObject>
      <img src="https://example.org/a"/><image href="https://example.org/b"/><use href="#shape"/>
      <style>.safe{fill:url(#paint)} .bad{fill:URL(  "https://example.org/red"  )}</style>
      <defs><linearGradient id="paint"><stop stop-color="rgb(1, 2, 3)"/></linearGradient></defs>
      <rect id="shape" class="safe" onclick="evil()" fill="url(#paint)" stroke="url( 'https://example.org/blue' )"/>
      <a href="https://example.org" xlink:href="#shape"><text>external</text></a>
      <a href="#shape"><text>local</text></a>
      <path href="javascript:alert(1)" xlink:href="data:text/html,evil"/>
      <path href="#shape"/>
    </svg>`;
    const clean = scrubMermaidSvg(hostile);
    const diagram = svg(clean);
    expect(diagram.querySelector('script,foreignObject,img,image,use')).toBeNull();
    expect(diagram.querySelectorAll('a')).toHaveLength(2);
    expect(
        [...diagram.querySelectorAll('a')].every(
            (anchor) => !anchor.hasAttribute('href') && !anchor.hasAttribute('xlink:href'),
        ),
    ).toBe(true);
    expect(diagram.querySelector('[onclick]')).toBeNull();
    expect(diagram.querySelector('path[href]')?.getAttribute('href')).toBe('#shape');
    expect(diagram.querySelector('path[xlink\\:href]')).toBeNull();
    expect(clean).not.toMatch(/https:|javascript:|data:text|alert\(1\)/i);
    expect(diagram.querySelector('style')?.textContent).toContain('url(#paint)');
    expect(diagram.querySelector('rect')?.getAttribute('fill')).toBe('url(#paint)');
    expect(diagram.querySelector('stop')?.getAttribute('stop-color')).toBe('rgb(1, 2, 3)');
});

it('rewrites every local ID reference for each diagram instance', () => {
    const source = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink">
      <style>#node { fill: url('#paint'); }</style>
      <defs><linearGradient id="paint"/></defs>
      <g id="node" aria-labelledby="label" clip-path="url(#paint)"><title id="label">Node</title><use href="#node"/></g>
    </svg>`;
    const first = svg(namespaceMermaidSvg(source, 'left'));
    const second = svg(namespaceMermaidSvg(source, 'right'));
    expect(first.querySelector('[id="left-node"]')).not.toBeNull();
    expect(second.querySelector('[id="right-node"]')).not.toBeNull();
    expect(first.querySelector('g')?.getAttribute('aria-labelledby')).toBe('left-label');
    expect(first.querySelector('g')?.getAttribute('clip-path')).toBe('url(#left-paint)');
    expect(first.querySelector('use')?.getAttribute('href')).toBe('#left-node');
    expect(first.querySelector('style')?.textContent).toContain('#left-node');
    expect(first.querySelector('style')?.textContent).toMatch(/url\(['"]?#left-paint['"]?\)/);
    expect(
        new Set([...first.querySelectorAll('[id]'), ...second.querySelectorAll('[id]')].map((element) => element.id))
            .size,
    ).toBe(6);
});

it('keeps hex colours intact when an SVG ID has the same spelling', () => {
    const source = `<svg xmlns="http://www.w3.org/2000/svg">
      <style>#fff { fill:#fff; stroke:url(#fff) }</style>
      <defs><linearGradient id="fff"/></defs>
      <rect fill="url(#fff)"/>
    </svg>`;
    const diagram = svg(namespaceMermaidSvg(source, 'left'));
    const css = diagram.querySelector('style')?.textContent ?? '';
    expect(css).toContain('#left-fff {');
    expect(css).toContain('fill:#fff');
    expect(css).toContain('stroke:url(#left-fff)');
    expect(diagram.querySelector('rect')?.getAttribute('fill')).toBe('url(#left-fff)');
});

it('removes escaped external CSS loads while preserving local fragment styles', () => {
    const source = `<svg xmlns="http://www.w3.org/2000/svg">
      <style>@\\69mport "https://example.org/a.css"; .bad{fill:u\\72l( https://example.org/a.svg )} .safe{fill:u\\72l( '#paint' )}</style>
      <defs><linearGradient id="paint"/></defs>
      <rect style="stroke:u\\72l(https://example.org/b.svg);fill:u\\72l(#paint)"/>
    </svg>`;
    const diagram = svg(scrubMermaidSvg(source));
    const css = diagram.querySelector('style')?.textContent ?? '';
    expect(css).not.toMatch(/example\.org|@import|@\\69mport|u\\72l/i);
    expect(css).toContain('url(#paint)');
    expect(diagram.querySelector('rect')?.getAttribute('style')).toContain('url(#paint)');
    expect(diagram.querySelector('rect')?.getAttribute('style')).not.toMatch(/example\.org|u\\72l/i);
});

it('drops nested and escaped resource functions while keeping safe declarations and fragment paints', () => {
    const source = `<svg xmlns="http://www.w3.org/2000/svg">
      <style>
        @font-face { font-family: danger; src: url(https://example.org/font.woff2) }
        .safe { fill: url(#paint); stroke: rgb(1, 2, 3) }
        .bad { fill: image-set("https://example.org/one.png" 1x, url(#paint) 2x); opacity: .7 }
        .escaped { filter: -webkit-image\\2dset("https://example.org/two.png" 1x); stroke: url(#paint) }
        .nested { filter: cross-fade(50%, image-set("data:image/png;base64,AAAA" 1x), red); opacity: .8 }
      </style>
      <defs><linearGradient id="paint"/></defs>
      <rect style="fill:url(#paint);filter:image-set('https://example.org/three.png' 1x);stroke:rgb(1,2,3)"/>
    </svg>`;
    const diagram = svg(scrubMermaidSvg(source));
    const css = diagram.querySelector('style')?.textContent ?? '';
    expect(css).not.toMatch(/image-set|cross-fade|font-face|example\.org|data:image/iu);
    expect(css).toContain('fill: url(#paint)');
    expect(css).toContain('stroke: rgb(1, 2, 3)');
    expect(css).toContain('opacity: .7');
    expect(css).toContain('opacity: .8');
    const inline = diagram.querySelector('rect')?.getAttribute('style') ?? '';
    expect(inline).not.toMatch(/image-set|example\.org/iu);
    expect(inline).toContain('fill:url(#paint)');
    expect(inline).toContain('stroke:rgb(1,2,3)');
});

it('drops CSS declarations with newlines inside quoted strings before browser CSS parsing', () => {
    const source = `<svg xmlns="http://www.w3.org/2000/svg">
      <style>rect{font-family:"foo\n;mask:url(https://example.org/newline.svg);x:";fill:red}</style>
      <rect width="100" height="100" style="font-family:'foo&#10;;filter:url(https://example.org/inline.svg);x:';fill:blue"/>
    </svg>`;
    const diagram = svg(scrubMermaidSvg(source));
    const css = diagram.querySelector('style')?.textContent ?? '';
    const inline = diagram.querySelector('rect')?.getAttribute('style') ?? '';
    expect(css).not.toMatch(/example\.org|mask:/iu);
    expect(inline).not.toMatch(/example\.org|filter:/iu);
    expect(css).toBe('');
    expect(inline).toBe('');
});
