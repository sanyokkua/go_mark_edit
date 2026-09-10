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
import { getAction } from '../../logic/actions/actionRegistry';
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

it('T033 holds the arrangement segment at the toolbar trailing edge', () => {
  render(<EditorChrome arrangement="split" onArrangementChange={jest.fn()} />);

  const toolbar = screen.getByRole('toolbar', { name: 'Document toolbar' });
  const segment = screen.getByRole('radiogroup', { name: 'View arrangement' });
  const trailing = toolbar.querySelector('[data-bar-slot="trailing"]');

  expect(trailing).not.toBeNull();
  expect(trailing).toContainElement(segment);
  expect(
    toolbar.querySelector(
      '[data-bar-slot="main"] [data-island-label="View arrangement"]',
    ),
  ).toBeNull();

  const chromeStyles = readFileSync(
    resolve(process.cwd(), 'src/ui/widgets/EditorChrome.module.css'),
    'utf8',
  );
  expect(chromeStyles).toContain('gap: var(--toolbar-gap)');
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
      within(overflow).getByRole('menuitem', { name: 'File' }),
    ).toBeEnabled();
    expect(
      within(overflow).getByRole('menuitem', { name: 'Settings' }),
    ).toBeEnabled();
    expect(
      within(overflow).getByRole('menuitem', { name: 'View' }),
    ).toBeEnabled();
    expect(
      within(overflow).getByRole('menuitem', { name: 'About' }),
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
  expect(chromeStyles).toContain(
    'min-inline-size: var(--toolbar-action-min-width)',
  );
  expect(
    readFileSync(
      resolve(process.cwd(), 'src/ui/components/Popup/Popup.module.css'),
      'utf8',
    ),
  ).toContain('min-inline-size: var(--popup-min-width)');
  /*
   * The tab strip is DocumentTabs' surface, not EditorChrome's — EditorChrome
   * never referenced the tab classes that used to sit in its stylesheet. The
   * assertion follows the component that actually owns the rule.
   */
  expect(
    readFileSync(
      resolve(process.cwd(), 'src/ui/components/TabBar/TabBar.module.css'),
      'utf8',
    ),
  ).toContain('min-inline-size: max-content');
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
  render(<EditorChrome arrangement="split" onArrangementChange={jest.fn()} />);
  fireEvent.click(screen.getByRole('button', { name: 'More actions' }));
  const toolbar = screen.getByRole('toolbar', { name: 'Document toolbar' });
  expect(toolbar).toHaveAttribute('data-bar-overflow', 'menu');
  expect(screen.getByRole('menu', { name: 'More actions' })).toHaveAttribute(
    'data-viewport-popup',
    'editor-overflow',
  );
  expect(
    toolbar.querySelectorAll('[data-bar-overflow-priority]').length,
  ).toBeGreaterThan(0);
});

it('T084 assigns every toolbar group to the overflow bucket its width owns', () => {
  render(<EditorChrome arrangement="split" onArrangementChange={jest.fn()} />);
  const toolbar = screen.getByRole('toolbar', { name: 'Document toolbar' });
  const rowGroups = Array.from(
    toolbar.querySelectorAll<HTMLElement>(
      '[data-bar-slot="main"] > [data-bar-item]',
    ),
  ).map((group) => ({
    ids: Array.from(group.querySelectorAll('[data-action-id]')).map((element) =>
      element.getAttribute('data-action-id'),
    ),
    priority: group.getAttribute('data-bar-overflow-priority'),
    never: group.getAttribute('data-bar-overflow') === 'never',
  }));
  expect(rowGroups).toEqual([
    {
      ids: ['bold', 'italic', 'strike', 'inline-code'],
      priority: '200',
      never: false,
    },
    {
      ids: ['heading-1', 'heading-2', 'heading-3'],
      priority: '200',
      never: false,
    },
    {
      ids: ['bullet-list', 'numbered-list', 'task-list', 'quote'],
      priority: '400',
      never: false,
    },
    { ids: ['link', 'image', 'table'], priority: '400', never: false },
    { ids: ['format', 'compact', 'lint'], priority: '0', never: true },
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
  render(
    <>
      <button type="button">Outside</button>
      <EditorChrome arrangement="split" onArrangementChange={jest.fn()} />
    </>,
  );
  const trigger = screen.getByRole('button', { name: 'More actions' });

  fireEvent.click(trigger);
  expect(
    within(screen.getByRole('menu', { name: 'More actions' })).getByRole(
      'menuitem',
      { name: 'Link' },
    ),
  ).toBeInTheDocument();
  fireEvent.keyDown(document, { key: 'Escape' });
  expect(screen.getByRole('button', { name: 'Link' })).toBeInTheDocument();
  expect(screen.queryByRole('menu', { name: 'More actions' })).toBeNull();
  expect(trigger).toHaveFocus();

  fireEvent.click(trigger);
  fireEvent.pointerDown(screen.getByRole('button', { name: 'Outside' }));
  expect(screen.getByRole('button', { name: 'Link' })).toBeInTheDocument();
  expect(screen.queryByRole('menu', { name: 'More actions' })).toBeNull();
});

it('T094 renders toolbar overflow as a body-owned Popup viewport surface', () => {
  render(<EditorChrome arrangement="split" onArrangementChange={jest.fn()} />);
  const trigger = screen.getByRole('button', { name: 'More actions' });

  fireEvent.click(trigger);

  const popup = screen.getByRole('menu', { name: 'More actions' });
  expect(popup.parentElement).toBe(document.body);
  expect(popup).toHaveAttribute('data-viewport-popup', 'editor-overflow');
  expect(popup).toHaveAttribute('data-popup-size', 'menu');
  expect(
    readFileSync(
      resolve(process.cwd(), 'src/ui/components/Popup/Popup.module.css'),
      'utf8',
    ),
  ).toMatch(/\.surface\s*\{[^}]*position:\s*absolute;/s);
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
        '[role="toolbar"] button[data-action-id], [role="radiogroup"] button[data-action-id]',
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

// Proves: FR-FT-047 — every shortcut the parity toolbar overflow advertises is
// the registry binding rendered for the running platform. It proves nothing
// about the arrangement row beneath them, which carries no accelerator.
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

/*
 * T190, the toolbar half of the same decision. The overflow drew accelerators
 * from the registry but only on `?parity-case`, and `formatShortcut` had no
 * other caller in this file — so the shipped toolbar advertised nothing.
 *
 * These controls are icon-first with a localized accessible name, so there is no
 * text row to put an accelerator beside; the tooltip is where a user asks "what
 * is this, and how do I do it from the keyboard". Asserted against the registry
 * rather than a fixed list so it cannot drift, and the unbound case is asserted
 * too — a control with no binding must keep its plain label rather than gain an
 * empty bracket.
 */
// Proves: FR-FT-047 — the toolbar advertises its registry bindings on the
// shipped surface, formatted for the running platform.
it('T190 advertises toolbar accelerators from the registry in the tooltip', () => {
  render(<EditorChrome arrangement="split" onArrangementChange={jest.fn()} />);

  for (const actionId of ['bold', 'italic', 'link'] as const) {
    const control = document.querySelector(`[data-action-id="${actionId}"]`);
    const binding = getAction(actionId).shortcut;
    const title = control?.getAttribute('title') ?? '';
    if (binding === undefined) {
      expect(title).not.toContain('(');
    } else {
      expect(title).toContain(
        shortcutRegistry.formatShortcut(
          binding,
          shortcutRegistry.currentPlatform(),
        ),
      );
    }
  }
});

/*
 * T173. The parity overflow inventory case and the two `T143 …` accelerator
 * cases were removed with the substituted overflow they described.
 *
 * `toolbarOverflowParity` replaced the whole overflow popup with a flat item
 * list carrying no text actions, no heading actions and no real arrangement
 * radiogroup. It is gone: the overflow interior is now a named reviewed
 * exclusion, because the shipped overflow is icon-first and the binding's is a
 * flat text list — a design divergence, measured at `bounds.left 140.375 vs
 * 102.375` at 375px, that no FR-FT-056 variant can express through the mockup's
 * own primitives.
 *
 * The accelerators those cases asserted are not lost: T190 restored them to the
 * shipped toolbar, in the tooltip, and `T190 advertises toolbar accelerators
 * from the registry in the tooltip` asserts them against production.
 */
