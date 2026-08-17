import { fireEvent, render, screen, within } from '@testing-library/react';

import Launcher from './Launcher';

// Proves: FR-FT-042 (partial — every clause but "never restores prior tabs
// automatically", which is proved by App.test.tsx because this file renders the
// launcher rather than driving startup)
it('Launcher first-run and six recent files', () => {
  const onNewDocument = jest.fn();
  const onOpenDocument = jest.fn();
  const onOpenRecentFile = jest.fn();
  const { rerender } = render(
    <Launcher
      onNewDocument={onNewDocument}
      onOpenDocument={onOpenDocument}
      onOpenRecentFile={onOpenRecentFile}
    />,
  );

  expect(
    screen.getByText('Create a new Markdown file or open one from disk.'),
  ).toBeVisible();
  expect(screen.getByRole('button', { name: 'Open Folder' })).toBeDisabled();
  fireEvent.click(screen.getByRole('button', { name: 'New File' }));
  fireEvent.click(screen.getByRole('button', { name: 'Open File' }));
  expect(onNewDocument).toHaveBeenCalledTimes(1);
  expect(onOpenDocument).toHaveBeenCalledTimes(1);

  const recentFiles = Array.from(
    { length: 7 },
    (_, index) => `/tmp/file-${index}.md`,
  );
  rerender(
    <Launcher recentFiles={recentFiles} onOpenRecentFile={onOpenRecentFile} />,
  );
  const recent = within(screen.getByLabelText('Recent files'));
  expect(recent.getAllByRole('button')).toHaveLength(6);
  fireEvent.click(recent.getByRole('button', { name: 'file-0.md' }));
  expect(onOpenRecentFile).toHaveBeenCalledWith('/tmp/file-0.md');
});

/*
 * T154. FR-FT-047 requires every user-visible string to derive from the
 * canonical registry or the translation catalogue. The launcher used to render
 * raw English behind a `?parity-case` ternary — 'GoMarkEdit', "Nothing is open.
 * GoMarkEdit doesn't restore your last session.", 'New file', 'Open file…',
 * 'Open folder…', 'Recent' — plus two fabricated parent paths, `~/Notes/archive`
 * and `~/Notes/projects`, picked by testing whether the recent path contained
 * `/archive/`. None of that came from `en.json`, and the fabricated paths were
 * not data: they were invented for a comparison that no longer exists.
 */
// Proves: FR-FT-047 (partial — only the "derives from the translation
//   catalogue" clause, for the launcher; the roles, focus containment,
//   reduced-motion and token clauses are proven elsewhere)
it('T154 renders catalogue strings on the parity route, not raw English', () => {
  const search = window.location.search;
  window.history.replaceState(
    {},
    '',
    '/?parity-case=primary:empty:1280:minimal-light',
  );
  try {
    render(<Launcher recentFiles={['/tmp/archive/one.md', '/tmp/two.md']} />);

    // Catalogue values from `src/i18n/locales/en.json`.
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(
      'Start a document',
    );
    expect(
      screen.getByText('Continue with a recent file or choose an action.'),
    ).toBeVisible();
    expect(screen.getByRole('button', { name: 'New File' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Open File' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Open Folder' })).toBeDisabled();
    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent(
      'Recent files',
    );

    // The invented parent paths are gone, including for the `/archive/` path
    // that used to select one of the two.
    expect(screen.queryByText('~/Notes/archive')).toBeNull();
    expect(screen.queryByText('~/Notes/projects')).toBeNull();
  } finally {
    window.history.replaceState({}, '', `/${search}`);
  }
});
