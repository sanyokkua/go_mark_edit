import { render, screen } from '@testing-library/react';

import type {
  DocumentMetadata,
  SaveStatus,
} from '../../logic/store/appModelTypes';
import DocumentIdentity from './DocumentIdentity';

function documentFor(status: SaveStatus): DocumentMetadata {
  return {
    documentId: 'doc-1',
    title: 'notes.md',
    path: '/Users/test/projects/notes.md',
    displayName: 'notes.md',
    parentName: 'projects',
    dirty: status === 'unsaved-changes',
    encoding: 'utf-8',
    lineEnding: 'lf',
    wordCount: 1,
    status,
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
}

it('DocumentIdentity safe path display', () => {
  render(
    <DocumentIdentity
      path={'/private/secret\u0000/project\u2066/notes.md'}
      parentName={'project\u0000'}
      status="saved"
    />,
  );

  const heading = screen.getByRole('heading');
  expect(heading).toHaveTextContent('project / notes.md');
  expect(heading).not.toHaveTextContent('/private/secret');
  expect(heading.textContent).not.toContain('\u0000');
  expect(heading.textContent).not.toContain('\u2066');
  expect(screen.getByText('Saved')).toBeVisible();
});

it('DocumentIdentity renders all five status values', () => {
  const statuses: SaveStatus[] = [
    'not-saved',
    'unsaved-changes',
    'saved',
    'autosaved',
    'read-only',
  ];
  const labels = [
    'Not saved',
    'Unsaved changes',
    'Saved',
    'Autosaved',
    'Read-only',
  ];
  for (const [index, status] of statuses.entries()) {
    const { unmount } = render(
      <DocumentIdentity document={documentFor(status)} />,
    );
    expect(screen.getByText(labels[index])).toBeVisible();
    unmount();
  }
});

it('identity heading keeps at most one parent segment', () => {
  render(
    <DocumentIdentity
      path="/one/two/three/name.md"
      parentName="two/three"
      status="not-saved"
    />,
  );

  const heading = screen.getByRole('heading');
  expect(heading).toHaveTextContent('twothree / name.md');
  expect((heading.textContent?.match(/\//gu) ?? []).length).toBeLessThanOrEqual(
    1,
  );
});

it('identity heading does not add an empty parent to an untitled document', () => {
  render(
    <DocumentIdentity
      document={{
        ...documentFor('not-saved'),
        title: 'Untitled',
        path: '',
        displayName: undefined,
        parentName: undefined,
      }}
    />,
  );

  expect(screen.getByRole('heading')).toHaveTextContent('Untitled');
  expect(screen.getByRole('heading')).not.toHaveTextContent('/');
});

it('T108 keeps the title-bar status to the bare state, without the reason', () => {
  /*
   * Pins a decision rather than a behaviour, because the obvious change here is
   * wrong and was tried. Appending FR-FT-005's reason to this status rendered
   * correctly from the real Go `capability` on the packaged binary and then
   * ellipsised to `Read-only · over t…` at full window width: `.identity` is
   * capped at the binding's own `max-width: 40ch` (`mockup.html:70`), which the
   * filename and parent already compete for, and the cap drops to `16ch` at
   * ≤376px — narrow enough to truncate `Read-only` itself. The reason lives in
   * the status bar's `Document details` region; this surface must keep showing
   * the state whole.
   */
  const document = {
    ...documentFor('read-only'),
    capability: 'large-read-only',
    sizeClass: 'large',
  };
  render(<DocumentIdentity document={document} />);

  const identity = screen.getByRole('banner', { name: 'Document identity' });
  expect(identity).toHaveTextContent('Read-only');
  expect(identity).not.toHaveTextContent('10 MiB');
});
