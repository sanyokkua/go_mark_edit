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
