import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { Provider } from 'react-redux';

const setUILayout = jest.fn(async (): Promise<void> => undefined);

jest.mock('../../logic/adapter', () => ({
  appModelAdapter: { setUILayout },
}));

jest.mock('./EditorView', () => ({
  __esModule: true,
  default: (): React.JSX.Element => <p>Existing document consumer</p>,
}));

import {
  hydrateProjection,
  resetProjection,
} from '../../logic/store/appModelProjectionActions';
import type {
  DocumentMetadata,
  UILayout,
} from '../../logic/store/appModelTypes';
import { store } from '../../logic/store';
import { notifyError } from '../../logic/store/notificationsSlice';
import { hydrateSettings } from '../../logic/store/settingsSlice';
import AppShell from './AppShell';

const readSource = (relativePath: string): string =>
  readFileSync(resolve(process.cwd(), relativePath), 'utf8');

function pointerEvent(
  type: 'pointerdown' | 'pointermove' | 'pointerup',
  clientX: number,
  pointerId: number,
): Event {
  const event = new Event(type, { bubbles: true });
  Object.defineProperties(event, {
    clientX: { value: clientX },
    pointerId: { value: pointerId },
  });
  return event;
}

function setViewportWidth(width: number): void {
  Object.defineProperty(window, 'innerWidth', {
    configurable: true,
    value: width,
  });
}

function renderShell(layout: UILayout = {}): void {
  store.dispatch(
    hydrateProjection({
      revision: 1,
      documents: {},
      activeDocumentId: '',
      ui: layout,
    }),
  );
  render(
    <Provider store={store}>
      <AppShell />
    </Provider>,
  );
}

beforeEach((): void => {
  store.dispatch(resetProjection());
  setUILayout.mockClear();
});

afterEach((): void => {
  store.dispatch(resetProjection());
});

it('FR-WS-007 keeps workspace and document regions while the reserved Assistant track has no surface', () => {
  renderShell({ sidebarVisible: true, sidebarWidth: 288 });

  expect(
    screen.getByRole('complementary', { name: 'Workspace' }),
  ).toBeInTheDocument();
  expect(screen.getByRole('main', { name: 'Document area' })).toHaveTextContent(
    'Existing document consumer',
  );
  expect(screen.queryByLabelText(/assistant/i)).not.toBeInTheDocument();
  expect(screen.queryByText(/assistant/i)).not.toBeInTheDocument();
  expect(screen.getByTestId('application-shell')).toHaveAttribute(
    'data-document-state',
    'empty',
  );

  const shellStyles = readSource('src/ui/widgets/AppShell.module.css');
  const tokens = readSource('src/ui/styles/tokens.css');
  expect(shellStyles).toMatch(
    /grid-template-areas:\s*['"]workspace document assistant['"]/,
  );
  expect(tokens).toContain('--shell-assistant-collapsed-width: 0;');
  expect(tokens).not.toContain('--shell-assistant-visible-width');
});

it('T033 keeps the shell as a contained, tokenized surface across palettes', () => {
  const shellStyles = readSource('src/ui/widgets/AppShell.module.css');
  const baseStyles = readSource('src/ui/styles/base.css');

  expect(shellStyles).toContain('overflow: hidden');
  expect(shellStyles).toContain('overscroll-behavior: contain');
  expect(shellStyles).not.toMatch(/#[\da-f]{3,8}\b|rgba?\(|hsla?\(/i);
  expect(baseStyles).toContain('overflow-x: hidden');
  expect(baseStyles).toContain('prefers-reduced-motion: reduce');
});

it('T062 renders the Minimal workspace boundary inside the workspace track', () => {
  const shellStyles = readSource('src/ui/widgets/AppShell.module.css');

  expect(shellStyles).toMatch(
    /:global\(:root\[data-theme='minimal'\]\) \.workspace\s*\{[^}]*border-inline-end:\s*var\(--control-border-width\) solid var\(--border\);/s,
  );
  expect(shellStyles).toMatch(
    /:global\(:root\[data-theme='minimal'\]\) \.divider::after\s*\{[^}]*background:\s*transparent;/s,
  );
});

it('FR-WS-007 preserves the zero-width Assistant track at the 375px breakpoint', () => {
  const shellStyles = readSource('src/ui/widgets/AppShell.module.css');
  const narrowShellRule = shellStyles.match(
    /@media \(max-width:\s*376px\)\s*\{\s*\.shell\s*\{([^}]*)\}/,
  )?.[1];

  expect(narrowShellRule).toBeDefined();
  expect(narrowShellRule).toMatch(/display:\s*grid/);
  expect(narrowShellRule).toMatch(
    /grid-template-areas:\s*['"]workspace document assistant['"]/,
  );
  /*
   * The narrow presentation collapses the workspace by setting the shared
   * column variable to zero; the Assistant track keeps its token because the
   * base grid declaration is the only one, and it is inherited here.
   */
  expect(narrowShellRule).toMatch(/--shell-workspace-column:\s*0px/);
  expect(shellStyles).toMatch(
    /grid-template-columns:\s*var\(--shell-workspace-column\)\s+minmax\(var\(--shell-center-min-width\),\s*1fr\)\s+var\(--shell-assistant-collapsed-width\)/,
  );
});

it('T040 keeps the empty workspace as a binding surface frame without enumeration', () => {
  const shellStyles = readSource('src/ui/widgets/AppShell.module.css');
  const workspaceRule = shellStyles.match(/\.workspace\s*\{([^}]*)\}/)?.[1];

  expect(workspaceRule).toBeDefined();
  expect(workspaceRule).toMatch(/background:\s*var\(--surface-2\)/);
});

it('T045 keeps the parity shell route bounded to the binding window geometry', () => {
  const shellSource = readSource('src/ui/widgets/AppShell.tsx');
  const baseStyles = readSource('src/ui/styles/base.css');
  const shellStyles = readSource('src/ui/widgets/AppShell.module.css');

  expect(shellSource).toContain(
    "data-parity-shell={parityRoute ? 'true' : undefined}",
  );
  expect(shellSource).toContain('data-parity-family={parityFamily}');
  expect(baseStyles).toMatch(
    /\.application-frame:has\(\[data-parity-shell='true'\]\)/,
  );
  expect(baseStyles).toContain('width: 97vw;');
  expect(baseStyles).toContain('height: min(792px, 86vh);');
  expect(baseStyles).toContain('margin: 130px auto 0;');
  expect(baseStyles).toContain('flex: 0 0 min(792px, 86vh);');
  expect(baseStyles).toMatch(
    /\.application-frame:has\(\[data-parity-shell='true'\]\)\s*\{[^}]*border:\s*1px solid var\(--stroke\);/s,
  );
  expect(baseStyles).toMatch(
    /\.application-content:has\(\[data-parity-shell='true'\]\)\s*\{[^}]*overflow:\s*visible;/s,
  );

  const parityShellRule = shellStyles.match(
    /\.shell\[data-parity-shell='true'\]\s*\{([^}]*)\}/,
  )?.[1];
  expect(parityShellRule).toBeDefined();
  expect(parityShellRule).toMatch(/min-height:\s*2px/);
  expect(shellStyles).toMatch(
    /\.shell\[data-parity-shell='true'\]\s*\{[^}]*overflow:\s*visible;/s,
  );
  expect(shellStyles).toMatch(
    /\.shell\[data-parity-shell='true'\] \.document\s*\{[^}]*overflow:\s*visible;/s,
  );
});

it('FR-WS-008 renders an immediate non-durable divider width while sending the durable intent to Go', () => {
  renderShell({ sidebarVisible: true, sidebarWidth: 288 });

  const shell = screen.getByTestId('application-shell');
  expect(shell).toHaveAttribute('data-workspace-visible', 'true');
  expect(shell).toHaveStyle({ '--shell-left-width': '288px' });

  const divider = screen.getByRole('separator', {
    name: 'Resize workspace',
  });
  fireEvent(divider, pointerEvent('pointerdown', 288, 7));
  fireEvent(window, pointerEvent('pointermove', 320, 7));
  fireEvent(window, pointerEvent('pointerup', 320, 7));

  expect(setUILayout).toHaveBeenCalledWith({ sidebarWidth: 320 });
  expect(shell).toHaveStyle({ '--shell-left-width': '320px' });
});

it('FR-WS-012 restores the last acknowledged divider width after its delayed layout write fails', async () => {
  renderShell({ sidebarVisible: true, sidebarWidth: 288 });

  const shell = screen.getByTestId('application-shell');
  const divider = screen.getByRole('separator', {
    name: 'Resize workspace',
  });
  fireEvent(divider, pointerEvent('pointerdown', 288, 7));
  fireEvent(window, pointerEvent('pointermove', 320, 7));
  fireEvent(window, pointerEvent('pointerup', 320, 7));
  expect(shell).toHaveStyle({ '--shell-left-width': '320px' });

  act(() => {
    store.dispatch(
      notifyError({
        code: 'io',
        title: 'File operation failed',
        message: 'The file operation could not be completed.',
        details: { operation: 'update layout' },
        retryable: true,
      }),
    );
  });

  await waitFor(() => {
    expect(shell).toHaveStyle({ '--shell-left-width': '288px' });
  });
});

it('FR-WS-017 keeps the workspace divider keyboard reachable and requests fixed width steps', () => {
  renderShell({ sidebarVisible: true, sidebarWidth: 288 });

  const divider = screen.getByRole('separator', {
    name: 'Resize workspace',
  });
  divider.focus();
  expect(divider).toHaveFocus();

  fireEvent.keyDown(divider, { key: 'ArrowRight' });
  expect(setUILayout).toHaveBeenLastCalledWith({ sidebarWidth: 304 });

  fireEvent.keyDown(divider, { key: 'ArrowLeft' });
  expect(setUILayout).toHaveBeenLastCalledWith({ sidebarWidth: 288 });
});

/*
 * The native minimum window is 375x480 (`main.go:104-105`), and frame rounding
 * can expose 376 CSS pixels at that size, so both widths are the minimum
 * window.
 */
for (const width of [375, 376]) {
  it(`T077 renders no workspace panel and no divider at ${width}px`, () => {
    setViewportWidth(width);
    try {
      renderShell({ sidebarVisible: true, sidebarWidth: 288 });

      expect(
        screen.queryByRole('complementary', { name: 'Workspace' }),
      ).not.toBeInTheDocument();
      expect(
        screen.queryByRole('separator', { name: 'Resize workspace' }),
      ).not.toBeInTheDocument();
      /*
       * The stored preference is the single source of truth and it is
       * untouched: App.tsx hands the same value to the View menu's toggle, so
       * if the collapse owned a second "is it open" state this would read
       * `false` and the toggle would stop agreeing with the panel. Nothing is
       * written either — the preference still governs the wide layout.
       */
      expect(screen.getByTestId('application-shell')).toHaveAttribute(
        'data-workspace-visible',
        'true',
      );
      expect(setUILayout).not.toHaveBeenCalled();
    } finally {
      setViewportWidth(1024);
    }
  });
}

it('T077 keeps the workspace panel and divider one pixel above the minimum window', () => {
  setViewportWidth(377);
  try {
    renderShell({ sidebarVisible: true, sidebarWidth: 288 });

    expect(
      screen.getByRole('complementary', { name: 'Workspace' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('separator', { name: 'Resize workspace' }),
    ).toBeInTheDocument();
  } finally {
    setViewportWidth(1024);
  }
});

it('T077 still reports a stored hidden workspace at the minimum window', () => {
  setViewportWidth(375);
  try {
    renderShell({ sidebarVisible: false, sidebarWidth: 288 });

    expect(
      screen.queryByRole('complementary', { name: 'Workspace' }),
    ).not.toBeInTheDocument();
    expect(screen.getByTestId('application-shell')).toHaveAttribute(
      'data-workspace-visible',
      'false',
    );
  } finally {
    setViewportWidth(1024);
  }
});

it('T040 overlays the resizable divider without adding a layout column at every parity width', () => {
  const shellStyles = readSource('src/ui/widgets/AppShell.module.css');

  /*
   * The grid track and the divider read the same variable, so the handle cannot
   * come adrift from the edge it drags — which is what this test is protecting
   * when it says the divider overlays rather than occupying a column.
   */
  expect(shellStyles).toMatch(
    /grid-template-columns:\s*var\(--shell-workspace-column\)\s+minmax\(var\(--shell-center-min-width\),\s*1fr\)\s+var\(--shell-assistant-collapsed-width\)/,
  );
  expect(shellStyles).toMatch(
    /\.divider\s*\{[\s\S]*inset-inline-start:\s*calc\(\s*var\(--shell-workspace-column\)/,
  );
  expect(shellStyles).not.toMatch(
    /grid-template-columns:[^;]*var\(--shell-divider-width\)/,
  );
  expect(shellStyles).toMatch(
    /\.divider\s*\{[\s\S]*inset-block:\s*0;[\s\S]*position:\s*absolute;[\s\S]*z-index:\s*var\(--z-resize\)/,
  );
  expect(shellStyles).toMatch(
    /@media \(max-width:\s*768px\)[\s\S]*--shell-workspace-column:\s*46px[\s\S]*\.divider\s*\{[\s\S]*display:\s*block/,
  );
  /*
   * The 376px block used to declare `.divider { display: block }` as well. The
   * minimum window renders neither the workspace nor the divider, so the block
   * now keeps only the collapsed column — the grid still declares a
   * `workspace` area at that width, and it must stay at zero.
   */
  const minimumWindowBlock = shellStyles.slice(
    shellStyles.lastIndexOf('@media (max-width: 376px)'),
  );
  expect(minimumWindowBlock).toMatch(/--shell-workspace-column:\s*0px/);
  expect(minimumWindowBlock).not.toMatch(/\.divider/);
});

it('T042 places the 28px status surface below editor content in the shell region', () => {
  const document: DocumentMetadata = {
    documentId: 'document-1',
    title: 'notes.md',
    path: '/Users/test/projects/notes.md',
    displayName: 'notes.md',
    parentName: 'projects',
    dirty: false,
    encoding: 'utf-8',
    lineEnding: 'lf',
    wordCount: 3,
    status: 'saved',
    view: {
      arrangement: 'editor',
      editorVisible: true,
      previewVisible: false,
      cursor: { line: 4, column: 2 },
      selection: {
        start: { line: 1, column: 1 },
        end: { line: 1, column: 1 },
      },
      scroll: { editor: 0, preview: 0 },
    },
  };
  store.dispatch(
    hydrateProjection({
      revision: 1,
      documents: { [document.documentId]: document },
      activeDocumentId: document.documentId,
      ui: {},
    }),
  );
  render(
    <Provider store={store}>
      <AppShell />
    </Provider>,
  );

  const documentArea = screen.getByRole('main', { name: 'Document area' });
  const status = within(documentArea).getByRole('status', {
    name: 'Document status',
  });
  // The row no longer prints the save status — the title bar owns it — so the
  // backend projection is asserted on the authoritative attribute instead.
  expect(status).toHaveAttribute('data-status-state', 'saved');
  /*
   * The row sits one level down since T113: its own `overflow: hidden` clipped
   * the `Document details` disclosure to nothing, so the panel moved out of the
   * row and into a dock that wraps it. The T042 contract this test exists for is
   * unchanged — the status surface is inside the document area, not full width
   * beneath the sidebar — so it is asserted through the dock rather than
   * loosened to a `contains` check.
   */
  const dock = status.parentElement;
  expect(dock).toHaveAttribute('data-status-dock', 'true');
  expect(dock?.parentElement).toBe(documentArea);
});

it('T047 projects an acknowledged autosave-on setting into status details', () => {
  const document: DocumentMetadata = {
    documentId: 'document-autosave-off',
    title: 'notes.md',
    path: '/Users/test/projects/notes.md',
    displayName: 'notes.md',
    parentName: 'projects',
    dirty: false,
    encoding: 'utf-8',
    lineEnding: 'lf',
    wordCount: 3,
    status: 'saved',
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
  };
  store.dispatch(
    hydrateProjection({
      revision: 1,
      documents: { [document.documentId]: document },
      activeDocumentId: document.documentId,
      ui: {},
    }),
  );
  store.dispatch(
    hydrateSettings({
      appearance: {
        theme: 'glass',
        mode: 'light',
        defaultOpenMode: 'split',
      },
      markdown: {
        standard: 'gfm',
        formatOnSave: false,
        lintOnSave: false,
        bulletMarker: '-',
        emphasisMarker: '*',
        headingStyle: 'atx',
      },
      contentPrivacy: { remotePolicy: 'local-only' },
      file: { autosave: true },
    }),
  );

  render(
    <Provider store={store}>
      <AppShell />
    </Provider>,
  );

  const status = screen.getByRole('status', { name: 'Document status' });
  fireEvent.click(
    within(status).getByRole('button', { name: 'Document details' }),
  );
  // Docked beside the row rather than inside it, so the row's clip cannot hide
  // it — T113.
  expect(
    screen.getByRole('region', { name: 'Document details' }),
  ).toHaveTextContent('Autosave on');

  act(() => {
    store.dispatch(
      hydrateSettings({
        appearance: {
          theme: 'glass',
          mode: 'light',
          defaultOpenMode: 'split',
        },
        markdown: {
          standard: 'gfm',
          formatOnSave: false,
          lintOnSave: false,
          bulletMarker: '-',
          emphasisMarker: '*',
          headingStyle: 'atx',
        },
        contentPrivacy: { remotePolicy: 'local-only' },
        file: { autosave: false },
      }),
    );
  });
  expect(
    screen.getByRole('region', { name: 'Document details' }),
  ).toHaveTextContent('Autosave off');
});

it('FR-WS-008 uses exact responsive presentations without durable responsive write-back', () => {
  renderShell({ sidebarVisible: true, sidebarWidth: 288 });

  Object.defineProperty(window, 'innerWidth', {
    configurable: true,
    value: 768,
  });
  fireEvent(window, new Event('resize'));
  Object.defineProperty(window, 'innerWidth', {
    configurable: true,
    value: 375,
  });
  fireEvent(window, new Event('resize'));

  expect(setUILayout).not.toHaveBeenCalled();

  const shellStyles = readSource('src/ui/widgets/AppShell.module.css');
  const editorStyles = readSource('src/ui/widgets/EditorView.module.css');
  const baseStyles = readSource('src/ui/styles/base.css');
  expect(shellStyles).toMatch(
    /@media \(max-width:\s*768px\)[\s\S]*--shell-workspace-column:\s*46px/,
  );
  /*
   * This used to require the 376px block present the workspace as a 230px
   * absolutely-positioned overlay. The minimum window drops the workspace
   * instead of overlaying it, so the presentation the block owns is the
   * collapsed column, and no `width: 230px` overlay survives anywhere.
   */
  expect(shellStyles).toMatch(
    /@media \(max-width:\s*376px\)[\s\S]*--shell-workspace-column:\s*0px/,
  );
  expect(shellStyles).not.toMatch(/width:\s*230px/);
  expect(editorStyles).toMatch(
    /@media \(max-width:\s*376px\)[\s\S]*flex-direction:\s*column/,
  );
  expect(editorStyles).toMatch(/\.toolbar\s*\{[^}]*flex-wrap:\s*nowrap/s);
  expect(baseStyles).toMatch(/overflow-x:\s*hidden/);
});

it('FR-WS-017 and FR-WS-020 keep shell styles tokenized and production surfaces honest', () => {
  const shellSource = readSource('src/ui/widgets/AppShell.tsx');
  const shellStyles = readSource('src/ui/widgets/AppShell.module.css');
  const appSource = readSource('src/App.tsx');
  const actionSource = readSource('src/logic/actions/shellActions.ts');

  expect(shellSource).toContain("t('shell.workspace')");
  expect(shellSource).toContain("t('shell.document')");
  expect(shellStyles).not.toMatch(/#[\da-f]{3,8}\b|rgba?\(|hsla?\(/i);
  for (const source of [shellSource, appSource, actionSource]) {
    expect(source).not.toMatch(
      /\b(?:fetch|XMLHttpRequest|WebSocket|EventSource|sendBeacon)\b/,
    );
    expect(source).not.toMatch(/https?:\/\//);
  }
  expect(actionSource).not.toMatch(/['"](?:file|new|open|recent|assistant)/i);
  expect(shellSource).not.toMatch(/aria-label=['"]Assistant['"]/i);
  expect(shellSource).not.toMatch(/(?:tablist|tabpanel|role=['"]tab['"])/i);
});

/*
 * T173. Two `T045 …` cases were removed with the empty-state chrome they
 * described.
 *
 * On `?parity-case` with no document open, AppShell mounted a `DocumentTabs`
 * strip and a fabricated `StatusBar` — `cursor 1:1`, `utf-8`, `lf`,
 * `not-saved`, `wordCount 0` — around the launcher. Production renders neither:
 * the real status bar is guarded on `hasActiveDocument`, and with no document
 * there is no tab strip. So the harness photographed a shell arrangement the
 * application never shows, which is what FR-FT-054 forbids.
 *
 * The scroll-lock effect that kept that fabricated layout pinned to the top at
 * ≤376px went with it.
 *
 * Still here, and deliberately: `data-parity-shell` and `data-parity-family` on
 * the frame. They are not markup — they are hooks that 66 CSS rules across six
 * stylesheets key off, and removing the attributes without a plan for those
 * rules would silently disable all of them and leave the CSS behind. They are
 * allowlisted in archtest and owed their own pass.
 */
