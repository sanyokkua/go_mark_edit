import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { fireEvent, render, screen, within } from '@testing-library/react';

import Launcher from './Launcher';

const readSource = (relativePath: string): string =>
  readFileSync(resolve(process.cwd(), relativePath), 'utf8');

it('T045 keeps the parity launcher inside the reference content bands', () => {
  const styles = readSource('src/ui/widgets/Launcher.module.css');
  const parityRule = styles.match(/\.parityLauncher\s*\{([^}]*)\}/)?.[1];

  expect(parityRule).toBeDefined();
  expect(parityRule).toMatch(/display:\s*flex/);
  expect(parityRule).toMatch(/flex:\s*1\s+1\s+0%/);
  expect(parityRule).toMatch(/height:\s*313px/);
  expect(parityRule).toMatch(/min-height:\s*auto/);
  expect(parityRule).toMatch(/margin:\s*0/);
  expect(parityRule).toMatch(/overflow:\s*visible/);
  expect(styles).toMatch(
    /@media \(max-width: 376px\)[\s\S]*?\.parityLauncher\s*\{[^}]*height:\s*316px;/s,
  );
  expect(styles).toMatch(
    /@media \(min-width: 377px\) and \(max-width: 768px\)[\s\S]*?\.parityLauncher\s*\{[^}]*height:\s*301px;/s,
  );
});

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
