import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import {
  createEvent,
  fireEvent,
  render as rtlRender,
  screen,
  within,
} from '@testing-library/react';
import { Provider } from 'react-redux';

import * as actionDispatcher from '../../logic/actions/actionDispatcher';
import * as shortcutRegistry from '../../logic/actions/shortcutRegistry';
import { store } from '../../logic/store';
import {
  hydrateProjection,
  resetProjection,
} from '../../logic/store/appModelProjectionActions';
import { hydrateSettings } from '../../logic/store/settingsSlice';
import { DocumentCommandContext } from './editorSession';
import { EditorSessionContext } from './editorSession';
import EditorChrome from './EditorChrome';
import { ModalStateProvider } from './modalState';

jest.mock('../../logic/actions/shortcutRegistry', () => {
  const actual = jest.requireActual('../../logic/actions/shortcutRegistry');
  return {
    __esModule: true,
    ...actual,
    currentPlatform: jest.fn(actual.currentPlatform),
  };
});

const render = (ui: Parameters<typeof rtlRender>[0]) =>
  rtlRender(<Provider store={store}>{ui}</Provider>);

it('T018 renders the complete toolbar groups and a real tab surface', () => {
  render(<EditorChrome arrangement="split" onArrangementChange={jest.fn()} />);

  expect(
    screen.getByRole('tablist', { name: 'Document tabs' }),
  ).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'New tab' })).toBeEnabled();
  expect(screen.getByRole('button', { name: 'Bold' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Heading 1' })).toBeInTheDocument();
  expect(
    screen.getByRole('button', { name: 'Numbered list' }),
  ).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Table' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Format' })).toBeDisabled();
});

/*
 * The binding holds the arrangement segment against the toolbar's trailing edge
 * with an empty `.tsp{flex:1}` between the overflow group and the segment
 * (mockup.html:672–673). Production had no spacer and drew the segment
 * immediately after Format/Compact/Lint, so it sat mid-toolbar.
 *
 * Asserted as order rather than as computed layout, because jsdom does not lay
 * flexbox out: the segment must be the toolbar's last child, and the spacer must
 * sit between the overflow trigger and it.
 */
it('T033 holds the arrangement segment at the toolbar trailing edge', () => {
  const { container } = render(
    <EditorChrome arrangement="split" onArrangementChange={jest.fn()} />,
  );

  const toolbar = screen.getByRole('toolbar', { name: 'Document toolbar' });
  const children = Array.from(toolbar.children);
  const segment = screen.getByRole('radiogroup', { name: 'View arrangement' });
  const overflow = container.querySelector('details');
  const spacer = toolbar.querySelector(':scope > div[aria-hidden="true"]');

  expect(children.at(-1)).toBe(segment);
  expect(spacer).not.toBeNull();
  expect(children.indexOf(spacer as Element)).toBe(children.length - 2);
  expect(children.indexOf(overflow as Element)).toBe(children.length - 3);

  const chromeStyles = readFileSync(
    resolve(process.cwd(), 'src/ui/widgets/EditorChrome.module.css'),
    'utf8',
  );
  expect(chromeStyles).toMatch(/\.spacer\s*\{[^}]*flex:\s*1;/);
});

it('T060 exposes real application-menu controls from the narrow toolbar overflow', () => {
  const originalWidth = window.innerWidth;
  const originalUrl = window.location.href;
  Object.defineProperty(window, 'innerWidth', {
    configurable: true,
    value: 375,
  });
  window.history.replaceState(
    {},
    '',
    '/?parity-case=targeted:settings-overflow:375:minimal-light',
  );

  try {
    render(
      <EditorChrome arrangement="split" onArrangementChange={jest.fn()} />,
    );

    fireEvent.click(screen.getByLabelText('More actions'));

    const overflow = screen.getByRole('menu', { name: 'More actions' });
    expect(
      within(overflow).getByRole('button', { name: 'File' }),
    ).toBeEnabled();
    expect(
      within(overflow).getByRole('button', { name: 'Settings' }),
    ).toBeEnabled();
    expect(
      within(overflow).getByRole('button', { name: 'View' }),
    ).toBeEnabled();
    expect(
      within(overflow).getByRole('button', { name: 'About' }),
    ).toBeEnabled();
  } finally {
    window.history.replaceState({}, '', originalUrl);
    Object.defineProperty(window, 'innerWidth', {
      configurable: true,
      value: originalWidth,
    });
  }
});

it('T033 keeps toolbar, arrangement, and overflow geometry on binding tokens', () => {
  const chromeStyles = readFileSync(
    resolve(process.cwd(), 'src/ui/widgets/EditorChrome.module.css'),
    'utf8',
  );

  expect(chromeStyles).toContain('gap: var(--toolbar-gap)');
  expect(chromeStyles).toContain('block-size: var(--toolbar-row-height)');
  expect(chromeStyles).toContain('block-size: var(--toolbar-action-height)');
  expect(chromeStyles).toContain(
    'min-inline-size: var(--toolbar-action-min-width)',
  );
  expect(chromeStyles).toContain(
    'padding-inline: var(--toolbar-action-padding-inline)',
  );
  expect(chromeStyles).toContain('border-radius: var(--toolbar-group-radius)');
  expect(chromeStyles).toContain('font-size: 11.5px');
  expect(chromeStyles).toContain('min-inline-size: var(--popup-min-width)');
  /*
   * The tab strip is DocumentTabs' surface, not EditorChrome's — EditorChrome
   * never referenced the tab classes that used to sit in its stylesheet. The
   * assertion follows the component that actually owns the rule.
   */
  expect(
    readFileSync(
      resolve(process.cwd(), 'src/ui/widgets/DocumentTabs.module.css'),
      'utf8',
    ),
  ).toContain('min-inline-size: max-content');
  expect(chromeStyles).toContain(":global(:root[data-theme='glass'])");
  expect(chromeStyles).toContain(":global(:root[data-theme='material'])");
  expect(chromeStyles).toContain(":global(:root[data-theme='minimal'])");
});

it('T045 retains the reference text glyphs for parity deferred actions', () => {
  const chromeStyles = readFileSync(
    resolve(process.cwd(), 'src/ui/widgets/EditorChrome.module.css'),
    'utf8',
  );

  expect(chromeStyles).toMatch(
    /:global\(\.application-frame:has\(\[data-parity-shell='true'\]\)\)[\s\S]*?\[data-action-id='format'\]::before[\s\S]*?content:\s*'⌁ '/s,
  );
  expect(chromeStyles).toMatch(
    /:global\(\.application-frame:has\(\[data-parity-shell='true'\]\)\)[\s\S]*?\[data-action-id='compact'\]::before[\s\S]*?content:\s*'⇥ '/s,
  );
  expect(chromeStyles).toMatch(
    /:global\(\.application-frame:has\(\[data-parity-shell='true'\]\)\)[\s\S]*?\[data-action-id='lint'\]::before[\s\S]*?content:\s*'✓ '/s,
  );
});

it('T045 keeps the parity toolbar overflow trigger available at 1280px', () => {
  const chromeStyles = readFileSync(
    resolve(process.cwd(), 'src/ui/widgets/EditorChrome.module.css'),
    'utf8',
  );

  expect(chromeStyles).toMatch(
    /@media \(min-width: 769px\)[\s\S]*?:global\(\.application-frame:has\(\[data-parity-family='toolbar-overflow'\]\)\)\s+\.toolbar\s+\.overflow\s*\{[^}]*display:\s*block;/s,
  );
});

it('T045 renders the reviewed parity toolbar overflow inventory', () => {
  const chromeSource = readFileSync(
    resolve(process.cwd(), 'src/ui/widgets/EditorChrome.tsx'),
    'utf8',
  );
  const chromeStyles = readFileSync(
    resolve(process.cwd(), 'src/ui/widgets/EditorChrome.module.css'),
    'utf8',
  );

  expect(chromeSource).toContain("'primary:toolbar-overflow:'");
  expect(chromeSource).toContain('parityOverflowItem');
  expect(chromeStyles).toMatch(
    /\.parityOverflowContent\s*\{[^}]*inline-size:\s*212px;[^}]*padding:\s*6px;/s,
  );
  expect(chromeStyles).toMatch(
    /\.parityOverflowItem\s*\{[^}]*min-height:\s*29px;[^}]*padding:\s*7px 10px;/s,
  );
});

it('T068 uses icon-first toolbar controls while retaining localized accessible names', () => {
  render(<EditorChrome arrangement="split" onArrangementChange={jest.fn()} />);

  const bold = screen.getByRole('button', { name: 'Bold' });
  expect(bold).toHaveAttribute('data-icon', 'bold');
  expect(bold).not.toHaveTextContent('Bold');
  expect(screen.getByRole('button', { name: 'Format' })).toHaveTextContent(
    'Format',
  );
});

it('T072 scopes overflow relocation to the documented 768 and 375 width groups', () => {
  const { container } = render(
    <EditorChrome arrangement="split" onArrangementChange={jest.fn()} />,
  );
  fireEvent.click(
    container.querySelector('summary[aria-label="More actions"]')!,
  );
  expect(
    document.body.querySelector('[class*="overflowAt768"]'),
  ).not.toBeNull();
  expect(
    document.body.querySelector('[class*="overflowAt375"]'),
  ).not.toBeNull();
  expect(screen.getAllByRole('button', { name: 'Link' })).toHaveLength(2);
});

/*
 * T072 above proves the two width buckets *exist*. It never proved which
 * toolbar groups land in each, and that is the hole Bold, Italic,
 * Strikethrough, Inline code and all three headings fell through:
 * `.relocateAt375 { display: none }` (`EditorChrome.module.css:556-559`) took
 * them out of the toolbar row at 375, while the parity-shaped overflow — which
 * carries no text group and no heading group — was what the shipped
 * application drew there. Present at 1280, absent at 375, with no other route
 * to them.
 *
 * Whole sets are compared rather than membership, so removing an action from a
 * bucket fails here instead of silently shrinking the narrow surface. jsdom
 * lays nothing out and applies no media query, so this pins the *assignment*;
 * `e2e/narrow-width.test.ts` pins what is actually reachable at each width.
 */
it('T084 assigns every toolbar group to the overflow bucket its width owns', () => {
  const { container } = render(
    <EditorChrome arrangement="split" onArrangementChange={jest.fn()} />,
  );
  fireEvent.click(
    container.querySelector('summary[aria-label="More actions"]')!,
  );

  const overflow = screen.getByRole('menu', { name: 'More actions' });
  const idsIn = (selector: string): string[] =>
    Array.from(
      overflow.querySelectorAll<HTMLElement>(`${selector} [data-action-id]`),
    ).map((element) => element.getAttribute('data-action-id') ?? '');

  // Relocated first, at 768: the list group then the insert group.
  expect(idsIn('.overflowAt768')).toEqual([
    'bullet-list',
    'numbered-list',
    'task-list',
    'quote',
    'link',
    'image',
    'table',
  ]);
  // Relocated second, at 375: the text group, the heading group, and the
  // arrangement segment, which the inline toolbar no longer shows at that width.
  expect(idsIn('.overflowAt375')).toEqual([
    'bold',
    'italic',
    'strike',
    'inline-code',
    'heading-1',
    'heading-2',
    'heading-3',
    'editor',
    'split',
    'preview',
  ]);

  // And the row's own drop order is the other half of the same contract: each
  // group carries exactly the relocation class for the width that drops it, and
  // the deferred group carries none because it never leaves the row.
  const toolbar = screen.getByRole('toolbar', { name: 'Document toolbar' });
  const rowGroups = Array.from(
    toolbar.querySelectorAll<HTMLElement>(':scope > div[class*="group"]'),
  ).map((group) => ({
    ids: Array.from(group.querySelectorAll('[data-action-id]')).map((element) =>
      element.getAttribute('data-action-id'),
    ),
    relocatesAt: group.className.includes('relocateAt375')
      ? 375
      : group.className.includes('relocateAt768')
        ? 768
        : null,
  }));
  expect(rowGroups).toEqual([
    { ids: ['bold', 'italic', 'strike', 'inline-code'], relocatesAt: 375 },
    { ids: ['heading-1', 'heading-2', 'heading-3'], relocatesAt: 375 },
    {
      ids: ['bullet-list', 'numbered-list', 'task-list', 'quote'],
      relocatesAt: 768,
    },
    { ids: ['link', 'image', 'table'], relocatesAt: 768 },
    { ids: ['format', 'compact', 'lint'], relocatesAt: null },
    { ids: ['editor', 'split', 'preview'], relocatesAt: 375 },
  ]);

  /*
   * Availability is the registry's answer, never a wiring accident:
   * `actionRegistry.ts:349` marks `image` deferred
   * (`image-lifecycle-deferred`), and `:356`, `:367`, `:373` do the same for
   * `format`, `compact` and `lint`. Nothing else in the toolbar is deferred, at
   * either width.
   */
  const disabled = Array.from(
    document.body.querySelectorAll<HTMLButtonElement>('[data-action-id]'),
  )
    .filter((element) => element.disabled)
    .map((element) => element.getAttribute('data-action-id'));
  expect([...new Set(disabled)].sort()).toEqual([
    'compact',
    'format',
    'image',
    'lint',
  ]);
});

it('T070 closes the toolbar overflow on Escape and outside pointer input', () => {
  const { container } = render(
    <>
      <button type="button">Outside</button>
      <EditorChrome arrangement="split" onArrangementChange={jest.fn()} />
    </>,
  );
  const trigger = container.querySelector(
    'summary[aria-label="More actions"]',
  ) as HTMLElement;

  fireEvent.click(trigger);
  expect(screen.getAllByRole('button', { name: 'Link' })).toHaveLength(2);
  fireEvent.keyDown(document, { key: 'Escape' });
  expect(screen.getAllByRole('button', { name: 'Link' })).toHaveLength(1);
  expect(trigger).toHaveFocus();

  fireEvent.click(trigger);
  fireEvent.pointerDown(screen.getByRole('button', { name: 'Outside' }));
  expect(screen.getAllByRole('button', { name: 'Link' })).toHaveLength(1);
});

it('T094 renders toolbar overflow as a body-owned viewport popup', () => {
  const { container } = render(
    <EditorChrome arrangement="split" onArrangementChange={jest.fn()} />,
  );
  const trigger = container.querySelector(
    'summary[aria-label="More actions"]',
  ) as HTMLElement;

  fireEvent.click(trigger);

  const popup = screen.getByRole('menu', { name: 'More actions' });
  expect(popup.parentElement).toBe(document.body);
  expect(popup).toHaveAttribute('data-viewport-popup', 'editor-overflow');
  expect(popup).toHaveStyle({ position: 'fixed' });
});

it('T095 keeps the Editor-stage semantic action signature independent of palette', () => {
  const palettes = [
    ['glass', 'light'],
    ['glass', 'dark'],
    ['material', 'light'],
    ['material', 'dark'],
    ['minimal', 'light'],
    ['minimal', 'dark'],
  ] as const;
  let signature: string[] | undefined;

  for (const [theme, mode] of palettes) {
    document.documentElement.setAttribute('data-theme', theme);
    document.documentElement.setAttribute('data-mode', mode);
    const rendered = render(
      <EditorChrome arrangement="split" onArrangementChange={jest.fn()} />,
    );
    const current = Array.from(
      rendered.container.querySelectorAll(
        '[role="toolbar"] button, [role="radiogroup"] button',
      ),
    ).map((button) => {
      const control = button as HTMLButtonElement;
      const actionId = button.getAttribute('data-action-id');
      if (actionId === null) {
        throw new Error(
          'Editor-stage controls must expose registry action IDs',
        );
      }
      return [
        actionId,
        button.getAttribute('aria-label') ?? '',
        button.getAttribute('aria-checked') ?? '',
        control.disabled ? 'disabled' : 'enabled',
      ].join('|');
    });
    if (signature === undefined) signature = current;
    expect(current).toEqual(signature);
    rendered.unmount();
  }
});

it('T068 exposes active arrangement state and explicit icon metadata', () => {
  render(<EditorChrome arrangement="split" onArrangementChange={jest.fn()} />);
  expect(screen.getByRole('radio', { name: 'Split' })).toHaveAttribute(
    'aria-checked',
    'true',
  );
  expect(screen.getByRole('button', { name: 'Quote' })).toHaveAttribute(
    'data-icon',
    'quote',
  );
});

it('T018 keeps the Assistant deferred while exposing real tab controls', () => {
  const invoke = jest.fn();
  render(
    <DocumentCommandContext.Provider value={null}>
      <EditorChrome arrangement="editor" onArrangementChange={jest.fn()} />
    </DocumentCommandContext.Provider>,
  );

  expect(screen.getByRole('button', { name: 'New tab' })).toBeEnabled();
  expect(invoke).not.toHaveBeenCalled();
  expect(
    screen.queryByRole('region', { name: 'Assistant' }),
  ).not.toBeInTheDocument();
});

it('T091 renders the text-labelled arrangement island in the toolbar', () => {
  render(<EditorChrome arrangement="editor" onArrangementChange={jest.fn()} />);

  expect(screen.getByRole('radio', { name: 'Editor' })).toHaveTextContent(
    'Editor',
  );
  expect(screen.getByRole('radio', { name: 'Split' })).toHaveTextContent(
    'Split',
  );
});

it('T050 keeps the tab-strip New affordance available', () => {
  render(<EditorChrome arrangement="editor" onArrangementChange={jest.fn()} />);

  expect(screen.getByRole('button', { name: 'New tab' })).toBeEnabled();
});

it('preserves the editor selection when a toolbar format button is pressed', () => {
  const commands = {
    getContent: jest.fn(() => ({
      status: 'available' as const,
      value: 'hello',
    })),
    getSelection: jest.fn(() => ({
      status: 'available' as const,
      value: {
        start: { lineNumber: 1, column: 1 },
        end: { lineNumber: 1, column: 6 },
      },
    })),
    replaceRange: jest.fn(() => ({
      status: 'available' as const,
      value: undefined,
    })),
    replaceAll: jest.fn(() => ({
      status: 'available' as const,
      value: undefined,
    })),
  };

  render(
    <DocumentCommandContext.Provider value={commands}>
      <EditorChrome arrangement="editor" onArrangementChange={jest.fn()} />
    </DocumentCommandContext.Provider>,
  );

  const bold = screen.getByRole('button', { name: 'Bold' });
  const pointerDown = createEvent.mouseDown(bold);
  fireEvent(bold, pointerDown);

  expect(pointerDown.defaultPrevented).toBe(true);
});

it('T044 passes acknowledged marker preferences into toolbar formatting', async () => {
  const replaceRange = jest.fn(() => ({
    status: 'available' as const,
    value: undefined,
  }));
  const commands = {
    getContent: jest.fn(() => ({
      status: 'available' as const,
      value: 'word',
    })),
    getSelection: jest.fn(() => ({
      status: 'available' as const,
      value: {
        start: { lineNumber: 1, column: 1 },
        end: { lineNumber: 1, column: 5 },
      },
    })),
    replaceRange,
    replaceAll: jest.fn(),
  };

  store.dispatch(
    hydrateSettings({
      appearance: {
        theme: 'material',
        mode: 'auto',
        defaultOpenMode: 'editor',
      },
      markdown: {
        standard: 'gfm',
        formatOnSave: false,
        lintOnSave: false,
        bulletMarker: '*',
        emphasisMarker: '_',
        headingStyle: 'atx',
      },
      contentPrivacy: { remotePolicy: 'ask' },
      editor: { lineNumbers: true, wordWrap: false, fontSize: 14 },
    }),
  );
  render(
    <Provider store={store}>
      <EditorSessionContext.Provider
        value={{ documentId: 'doc-1', content: 'word' }}
      >
        <DocumentCommandContext.Provider value={commands}>
          <EditorChrome arrangement="editor" onArrangementChange={jest.fn()} />
        </DocumentCommandContext.Provider>
      </EditorSessionContext.Provider>
    </Provider>,
  );

  fireEvent.click(screen.getByRole('button', { name: 'Italic' }));

  await expect(replaceRange).toHaveBeenCalledWith(
    expect.anything(),
    '_word_',
    expect.anything(),
  );
});

it('T043 routes deferred editor shortcuts through the typed dispatcher', () => {
  const dispatch = jest
    .spyOn(actionDispatcher, 'dispatchAction')
    .mockResolvedValue({
      status: 'unavailable',
      actionId: 'format',
      reason: 'deferred',
    });
  const commands = {
    getContent: jest.fn(() => ({
      status: 'available' as const,
      value: 'word',
    })),
    getSelection: jest.fn(() => ({
      status: 'available' as const,
      value: {
        start: { lineNumber: 1, column: 1 },
        end: { lineNumber: 1, column: 5 },
      },
    })),
    replaceRange: jest.fn(),
    replaceAll: jest.fn(),
  };

  const { container } = render(
    <EditorSessionContext.Provider
      value={{ documentId: 'doc-1', content: 'word' }}
    >
      <DocumentCommandContext.Provider value={commands}>
        <div data-editor-surface="true" tabIndex={0}>
          <EditorChrome arrangement="editor" onArrangementChange={jest.fn()} />
        </div>
      </DocumentCommandContext.Provider>
    </EditorSessionContext.Provider>,
  );

  const editorSurface = container.querySelector(
    '[data-editor-surface]',
  ) as HTMLElement | null;
  if (editorSurface === null) throw new Error('editor surface not rendered');
  editorSurface.focus();
  fireEvent.keyDown(editorSurface, {
    altKey: true,
    key: 'f',
    shiftKey: true,
  });

  expect(dispatch).toHaveBeenCalledWith(
    'format',
    expect.objectContaining({ editorFocused: true }),
  );
  dispatch.mockRestore();
});

it('T058 suppresses editor shortcuts while the Shortcuts dialog modal state is active', () => {
  const commands = {
    getContent: jest.fn(() => ({
      status: 'available' as const,
      value: 'word',
    })),
    getSelection: jest.fn(() => ({
      status: 'available' as const,
      value: {
        start: { lineNumber: 1, column: 1 },
        end: { lineNumber: 1, column: 5 },
      },
    })),
    replaceRange: jest.fn(),
    replaceAll: jest.fn(),
  };

  const { container } = render(
    <ModalStateProvider modalOpen>
      <EditorSessionContext.Provider
        value={{ documentId: 'doc-1', content: 'word' }}
      >
        <DocumentCommandContext.Provider value={commands}>
          <div data-editor-surface tabIndex={0}>
            <EditorChrome
              arrangement="editor"
              onArrangementChange={jest.fn()}
            />
          </div>
        </DocumentCommandContext.Provider>
      </EditorSessionContext.Provider>
    </ModalStateProvider>,
  );

  const editorSurface = container.querySelector(
    '[data-editor-surface]',
  ) as HTMLElement | null;
  if (editorSurface === null) throw new Error('editor surface not rendered');
  editorSurface.focus();
  fireEvent.keyDown(editorSurface, {
    code: 'KeyB',
    key: 'b',
    ctrlKey: true,
  });

  expect(commands.getContent).not.toHaveBeenCalled();
  expect(commands.replaceRange).not.toHaveBeenCalled();
});

/*
 * T143: `parityOverflowShortcuts` hardcoded a per-action string table, so the
 * parity overflow advertised `Ctrl ⇧ 8` for an action the registry binds to
 * `Mod+Shift+8`. Controlling the platform read is what separates a derivation
 * from a literal that happens to agree on one host.
 */
const platformMock = shortcutRegistry.currentPlatform as jest.MockedFunction<
  typeof shortcutRegistry.currentPlatform
>;

function overflowShortcuts(): Record<string, string> {
  const entries: Record<string, string> = {};
  for (const item of document.querySelectorAll('[data-parity-overflow-item]')) {
    const id = item.getAttribute('data-action-id');
    const shortcut = item.querySelector('span')?.textContent;
    if (id !== null && shortcut != null) entries[id] = shortcut;
  }
  return entries;
}

// Proves: FR-FT-047 — every shortcut the parity toolbar overflow advertises is
// the registry binding rendered for the running platform. It proves nothing
// about the arrangement row beneath them, which carries no accelerator.
it.each([
  [
    'darwin',
    {
      'bullet-list': '⌘⇧8',
      'numbered-list': '⌘⇧7',
      'task-list': '⌘⇧9',
      quote: '⌘⇧.',
      link: '⌘K',
      image: '⌘⇧I',
      table: '⌘⇧T',
      compact: '⌥⇧C',
    },
  ],
  [
    'win32',
    {
      'bullet-list': 'Ctrl+Shift+8',
      'numbered-list': 'Ctrl+Shift+7',
      'task-list': 'Ctrl+Shift+9',
      quote: 'Ctrl+Shift+.',
      link: 'Ctrl+K',
      image: 'Ctrl+Shift+I',
      table: 'Ctrl+Shift+T',
      compact: 'Alt+Shift+C',
    },
  ],
] as const)(
  'T143 draws every parity overflow shortcut from the registry binding on %s',
  (platform, expected) => {
    const originalUrl = window.location.href;
    platformMock.mockReturnValue(platform);
    window.history.replaceState(
      {},
      '',
      '/?parity-case=primary:toolbar-overflow:1280:minimal-light',
    );

    try {
      render(
        <EditorChrome arrangement="split" onArrangementChange={jest.fn()} />,
      );
      fireEvent.click(screen.getByLabelText('More actions'));

      expect(overflowShortcuts()).toEqual(expected);
    } finally {
      window.history.replaceState({}, '', originalUrl);
      platformMock.mockReset();
    }
  },
);

/*
 * T178 — the formatting toolbar on a document the backend will refuse to write.
 *
 * `ActionButton` computed `disabled` from `entry.availability.kind ===
 * 'deferred'` — the *static* registry entry — and `EditorChrome` passed no
 * projection to `dispatchAction`, so neither the button's enabled state nor the
 * command it runs could see the document's capability. Making Monaco read-only
 * and gating the registry both leave this path open: the user cannot type, but
 * every formatting button still works.
 *
 * This is the same defect class AGENTS.md records against `SettingsMenu` —
 * a surface deciding availability for itself instead of asking the registry —
 * so the fix asks `getActionAvailability` rather than re-deriving the rule here.
 */
// Proves: FR-FT-006 (the "Editing MUST be unavailable" clause, at the toolbar)
it('T178 disables the formatting toolbar for a non-writable document', () => {
  store.dispatch(resetProjection());
  store.dispatch(
    hydrateProjection({
      revision: 1,
      documents: {
        'doc-1': {
          documentId: 'doc-1',
          title: 'broken',
          path: '/documents/broken.md',
          dirty: false,
          encoding: 'utf-8',
          lineEnding: 'lf',
          wordCount: 0,
          capability: 'unsafe-read-only',
          view: {
            arrangement: 'editor',
            editorVisible: true,
            previewVisible: false,
            cursor: { line: 1, column: 1 },
            selection: {
              start: { line: 1, column: 1 },
              end: { line: 1, column: 1 },
            },
            scroll: { editor: 0, preview: 0 },
          },
        },
      },
      activeDocumentId: 'doc-1',
      ui: {},
    }),
  );

  render(
    <EditorSessionContext.Provider
      value={{ documentId: 'doc-1', content: 'word' }}
    >
      <EditorChrome arrangement="editor" onArrangementChange={jest.fn()} />
    </EditorSessionContext.Provider>,
  );

  for (const name of ['Bold', 'Italic', 'Heading 1', 'Table']) {
    expect(screen.getByRole('button', { name })).toBeDisabled();
  }
});

/*
 * The control for the case above: the same toolbar on a writable document must
 * stay live, so the assertion is the capability and not a toolbar that has been
 * disabled outright.
 */
// Proves: FR-FT-006 (the negative half at the toolbar)
it('T178 leaves the formatting toolbar live for a writable document', () => {
  store.dispatch(resetProjection());
  store.dispatch(
    hydrateProjection({
      revision: 1,
      documents: {
        'doc-1': {
          documentId: 'doc-1',
          title: 'fine',
          path: '/documents/fine.md',
          dirty: false,
          encoding: 'utf-8',
          lineEnding: 'lf',
          wordCount: 0,
          capability: 'writable',
          view: {
            arrangement: 'editor',
            editorVisible: true,
            previewVisible: false,
            cursor: { line: 1, column: 1 },
            selection: {
              start: { line: 1, column: 1 },
              end: { line: 1, column: 1 },
            },
            scroll: { editor: 0, preview: 0 },
          },
        },
      },
      activeDocumentId: 'doc-1',
      ui: {},
    }),
  );

  render(
    <EditorSessionContext.Provider
      value={{ documentId: 'doc-1', content: 'word' }}
    >
      <EditorChrome arrangement="editor" onArrangementChange={jest.fn()} />
    </EditorSessionContext.Provider>,
  );

  for (const name of ['Bold', 'Italic', 'Heading 1', 'Table']) {
    expect(screen.getByRole('button', { name })).toBeEnabled();
  }
});
