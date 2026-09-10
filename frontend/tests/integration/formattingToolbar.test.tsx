import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { Provider } from 'react-redux';

import { store } from '../../src/logic/store';
import {
  DocumentCommandContext,
  EditorSessionContext,
} from '../../src/ui/widgets/editorSession';
import FormattingToolbar from '../../src/ui/widgets/FormattingToolbar/FormattingToolbar';

const renderToolbar = (
  ui: React.ReactNode = (
    <FormattingToolbar arrangement="split" onArrangementChange={jest.fn()} />
  ),
) => render(<Provider store={store}>{ui}</Provider>);

function rect(width: number, height = 30): DOMRect {
  return {
    bottom: height,
    height,
    left: 0,
    right: width,
    top: 0,
    width,
    x: 0,
    y: 0,
    toJSON: () => ({}),
  } as DOMRect;
}

// Proves: FR-036, FR-037, FR-038 — the formatting toolbar is composed from the shared Bar, Island and ToolButton contracts.
it('T023 renders grouped formatting controls with a trailing arrangement island', () => {
  renderToolbar();

  const toolbar = screen.getByRole('toolbar', { name: 'Document toolbar' });
  const main = toolbar.querySelector('[data-bar-slot="main"]');
  const groups = main?.querySelectorAll(':scope > [data-bar-item]');

  expect(toolbar).toHaveAttribute('data-bar-overflow', 'menu');
  expect(groups).toHaveLength(5);
  expect(
    toolbar.querySelector('[data-bar-slot="trailing"] [role="radiogroup"]'),
  ).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Bold' })).toHaveAttribute(
    'data-tool-button-variant',
    'icon',
  );
  expect(screen.getByRole('button', { name: 'Format' })).toHaveAttribute(
    'data-tool-button-variant',
    'text',
  );
});

// Proves: FR-037 — Bar measures groups and relocates only the groups that do not fit below its breakpoint.
it('T023 moves measured groups into the shared overflow Popup below 768px', async () => {
  const originalWidth = window.innerWidth;
  const originalRect = HTMLElement.prototype.getBoundingClientRect;
  Object.defineProperty(window, 'innerWidth', {
    configurable: true,
    value: 700,
  });
  HTMLElement.prototype.getBoundingClientRect = function getRect(): DOMRect {
    if (this.dataset.barItem !== undefined) {
      const widths: Record<string, number> = {
        '200': 120,
        '400': 160,
        '0': 100,
      };
      return rect(widths[this.dataset.barOverflowPriority ?? '0'] ?? 100);
    }
    if (this.getAttribute('role') === 'toolbar') return rect(480, 38);
    return originalRect.call(this);
  };

  try {
    renderToolbar();
    const toolbar = screen.getByRole('toolbar', { name: 'Document toolbar' });
    await waitFor(() =>
      expect(toolbar).toHaveAttribute('data-bar-overflowing', 'true'),
    );

    fireEvent.click(screen.getByRole('button', { name: 'More actions' }));
    const popup = await screen.findByRole('menu', { name: 'More actions' });
    expect(popup).toHaveAttribute('data-viewport-popup', 'editor-overflow');
    expect(within(popup).getByRole('menuitem', { name: 'Link' })).toBeVisible();
    expect(
      toolbar
        .querySelector('[data-bar-slot="main"] [data-action-id="link"]')
        ?.closest('[data-bar-item]'),
    ).toHaveAttribute('hidden');
  } finally {
    HTMLElement.prototype.getBoundingClientRect = originalRect;
    Object.defineProperty(window, 'innerWidth', {
      configurable: true,
      value: originalWidth,
    });
  }
});

// Proves: FR-038 — formatting controls preserve the editor command boundary instead of mutating UI state directly.
it('T023 routes a formatting activation through the editor command context', async () => {
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

  renderToolbar(
    <EditorSessionContext.Provider
      value={{ documentId: 'doc-1', content: 'word' }}
    >
      <DocumentCommandContext.Provider value={commands}>
        <FormattingToolbar
          arrangement="editor"
          onArrangementChange={jest.fn()}
        />
      </DocumentCommandContext.Provider>
    </EditorSessionContext.Provider>,
  );

  fireEvent.click(screen.getByRole('button', { name: 'Italic' }));

  await waitFor(() =>
    expect(replaceRange).toHaveBeenCalledWith(
      expect.anything(),
      '*word*',
      expect.anything(),
    ),
  );
});

// Proves: FR-038 — action identity and availability stay stable across the six token palettes.
it('T023 keeps action identity stable across every theme and mode', () => {
  const palettes = [
    ['glass', 'light'],
    ['glass', 'dark'],
    ['material', 'light'],
    ['material', 'dark'],
    ['minimal', 'light'],
    ['minimal', 'dark'],
  ] as const;
  const root = document.documentElement;
  const signature: string[][] = [];

  for (const [theme, mode] of palettes) {
    root.setAttribute('data-theme', theme);
    root.setAttribute('data-mode', mode);
    const rendered = renderToolbar();
    signature.push(
      Array.from(
        rendered.container.querySelectorAll<HTMLButtonElement>(
          '[role="toolbar"] button[data-action-id], [role="radiogroup"] button[data-action-id]',
        ),
      ).map((button) =>
        [
          button.dataset.actionId ?? '',
          button.getAttribute('aria-label') ?? '',
          button.disabled ? 'disabled' : 'enabled',
        ].join('|'),
      ),
    );
    rendered.unmount();
  }

  expect(new Set(signature.map((items) => items.join('\n'))).size).toBe(1);
});
