import { expect, test } from '../support/harness';

test('shows the launcher frame, actions, type scale, and recent files', async ({
  app,
}) => {
  const recentFiles = await Promise.all(
    Array.from({ length: 6 }, (_, index) =>
      app.writeDocument(`recent-${index + 1}.md`, `# Recent ${index + 1}`),
    ),
  );
  await app.seedRecents(recentFiles);
  await app.launch();

  const { page } = app;
  const initialTab = page.getByRole('tab', { name: 'Untitled' });
  await expect(initialTab).toBeVisible();
  await initialTab
    .locator('..')
    .getByRole('button', { name: /^Close /u })
    .click();

  const frame = page.locator('.application-frame');
  await expect(frame).toBeVisible();
  const launcher = page.getByTestId('document-launcher');
  await expect(launcher).toBeVisible();
  await expect(launcher.getByRole('heading', { level: 1 })).toHaveCSS(
    'font-size',
    '20px',
  );
  await expect(launcher.locator('p').first()).toHaveCSS('font-size', '12.5px');
  await expect(
    launcher.getByRole('button', { name: 'New File' }),
  ).toBeVisible();
  await expect(
    launcher.getByRole('button', { name: 'Open File' }),
  ).toBeVisible();
  await expect(
    launcher.getByRole('button', { name: 'Open Folder' }),
  ).toBeDisabled();
  await expect(launcher.getByRole('listitem')).toHaveCount(6);
  await expect(launcher.getByRole('listitem').first()).toContainText(
    'recent-1.md',
  );
});
