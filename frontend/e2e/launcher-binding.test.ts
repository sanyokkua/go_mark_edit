import { expect, test, type Locator, type Page } from '@playwright/test';

/*
 * The launcher is the first screen of every launch — there is no session
 * restore — but it was never covered by the targeted per-region comparison, and
 * its only unit test asserted CSS source text rather than rendered style. That
 * combination let the shipped panel drift into a different design from the
 * binding, including two `font-size` declarations that referenced tokens which
 * do not exist, so both headings rendered at inherited size.
 *
 * These assertions read computed style off the real control. Binding values are
 * quoted from `docs/delivery/spec/surface/mockup.html` `.launcher` / `.lc`
 * (:102-:114).
 */

async function styleOf(locator: Locator, property: string): Promise<string> {
  return locator.evaluate(
    (element, name) => getComputedStyle(element).getPropertyValue(name),
    property,
  );
}

/*
 * Tokens are authored as hex but computed style reports `rgb(...)`. Resolving
 * the token through a throwaway element makes the browser do the conversion, so
 * the comparison stays exact instead of being loosened to a substring match.
 */
async function tokenColour(page: Page, token: string): Promise<string> {
  return page.evaluate((name) => {
    const probe = document.createElement('span');
    probe.style.color = `var(${name})`;
    document.body.append(probe);
    const resolved = getComputedStyle(probe).color;
    probe.remove();
    return resolved;
  }, token);
}

async function openLauncher(page: Page): Promise<Locator> {
  await page.goto('/?ft-vs-07');
  await page
    .getByRole('tab', { name: 'Untitled' })
    .locator('..')
    .getByRole('button', { name: /^Close /u })
    .click();
  const launcher = page.getByTestId('document-launcher');
  await expect(launcher).toBeVisible();
  return launcher;
}

test('T057 draws the launcher frame and block from the binding', async ({
  page,
}) => {
  const launcher = await openLauncher(page);

  // `.launcher{display:none;flex:1;align-items:center;justify-content:center;padding:24px}` (:102)
  expect(await styleOf(launcher, 'display')).toBe('flex');
  expect(await styleOf(launcher, 'align-items')).toBe('center');
  expect(await styleOf(launcher, 'justify-content')).toBe('center');
  expect(await styleOf(launcher, 'padding-top')).toBe('24px');
  expect(await styleOf(launcher, 'padding-left')).toBe('24px');

  // The binding declares no overflow. A scroll container here would cost ~332
  // deterministic antialiasing pixels and the content is bounded at six rows.
  expect(await styleOf(launcher, 'overflow-x')).toBe('visible');
  expect(await styleOf(launcher, 'overflow-y')).toBe('visible');

  // `.lc{width:min(430px,100%);text-align:center}` (:105) — and no card: the
  // binding gives this block no background, border, radius or padding.
  const panel = launcher.locator('div').first();
  expect(await styleOf(panel, 'width')).toBe('430px');
  expect(await styleOf(panel, 'text-align')).toBe('center');
  expect(await styleOf(panel, 'border-top-width')).toBe('0px');
  expect(await styleOf(panel, 'border-top-left-radius')).toBe('0px');
  expect(await styleOf(panel, 'padding-top')).toBe('0px');
  expect(await styleOf(panel, 'background-color')).toBe('rgba(0, 0, 0, 0)');
});

test('T057 draws the launcher type scale from the binding', async ({
  page,
}) => {
  const launcher = await openLauncher(page);

  // `.lc h2{font-size:20px;margin-bottom:4px}` (:106)
  const heading = launcher.getByRole('heading', { level: 1 });
  expect(await styleOf(heading, 'font-size')).toBe('20px');
  expect(await styleOf(heading, 'margin-bottom')).toBe('4px');

  // `.lc .sub{font-size:12.5px;color:var(--muted);margin-bottom:18px}` (:107)
  const message = launcher.locator('p').first();
  expect(await styleOf(message, 'font-size')).toBe('12.5px');
  expect(await styleOf(message, 'margin-bottom')).toBe('18px');
  expect(await styleOf(message, 'color')).toBe(
    await tokenColour(page, '--muted'),
  );

  /* `.lc .rec .lbl{font-size:10.5px;letter-spacing:.09em;text-transform:uppercase;
     color:var(--faint);margin-bottom:6px}` (:111) */
  const sectionLabel = launcher.getByRole('heading', { level: 2 });
  expect(await styleOf(sectionLabel, 'font-size')).toBe('10.5px');
  expect(await styleOf(sectionLabel, 'text-transform')).toBe('uppercase');
  expect(await styleOf(sectionLabel, 'letter-spacing')).toBe('0.945px');
  expect(await styleOf(sectionLabel, 'margin-bottom')).toBe('6px');
  expect(await styleOf(sectionLabel, 'color')).toBe(
    await tokenColour(page, '--faint'),
  );
});

test('T057 draws the launcher actions from the binding', async ({ page }) => {
  const launcher = await openLauncher(page);

  // `.lc .acts{display:flex;gap:8px;justify-content:center;margin-bottom:22px;flex-wrap:wrap}` (:108)
  const actions = launcher
    .getByRole('button', { name: 'New File' })
    .locator('..');
  expect(await styleOf(actions, 'display')).toBe('flex');
  expect(await styleOf(actions, 'column-gap')).toBe('8px');
  expect(await styleOf(actions, 'justify-content')).toBe('center');
  expect(await styleOf(actions, 'margin-bottom')).toBe('22px');
  expect(await styleOf(actions, 'flex-wrap')).toBe('wrap');

  /* `.lc .acts button{padding:8px 14px;border-radius:9px;
     border:1px solid var(--stroke);background:var(--surface);font-size:12.5px}` (:109).
     The mockup has no global button reset, so each of these is load-bearing —
     production shipped the user-agent button appearance instead. */
  const secondary = launcher.getByRole('button', { name: 'Open File' });
  expect(await styleOf(secondary, 'padding-top')).toBe('8px');
  expect(await styleOf(secondary, 'padding-left')).toBe('14px');
  expect(await styleOf(secondary, 'border-top-left-radius')).toBe('9px');
  expect(await styleOf(secondary, 'border-top-width')).toBe('1px');
  expect(await styleOf(secondary, 'border-top-style')).toBe('solid');
  expect(await styleOf(secondary, 'font-size')).toBe('12.5px');
  expect(await styleOf(secondary, 'border-top-color')).toBe(
    await tokenColour(page, '--stroke'),
  );
  expect(await styleOf(secondary, 'background-color')).toBe(
    await tokenColour(page, '--surface'),
  );

  // `.lc .acts button.primary{background:var(--accent);color:var(--accent-contrast);
  //  border-color:transparent;font-weight:600}` (:110)
  const primary = launcher.getByRole('button', { name: 'New File' });
  expect(await styleOf(primary, 'font-weight')).toBe('600');
  expect(await styleOf(primary, 'background-color')).toBe(
    await tokenColour(page, '--accent'),
  );
  expect(await styleOf(primary, 'color')).toBe(
    await tokenColour(page, '--accent-contrast'),
  );
});

test('T057 draws the launcher recents list from the binding', async ({
  page,
}) => {
  const launcher = await openLauncher(page);

  // `.lc .rec{text-align:left;border-top:1px solid var(--stroke-soft);padding-top:12px}` (:111)
  const recent = launcher.getByRole('list').locator('..');
  expect(await styleOf(recent, 'border-top-width')).toBe('1px');
  expect(await styleOf(recent, 'padding-top')).toBe('12px');
  expect(await styleOf(recent, 'text-align')).toBe('start');
  expect(await styleOf(recent, 'border-top-color')).toBe(
    await tokenColour(page, '--stroke-soft'),
  );

  // `.lc .rec .r{display:flex;gap:9px;align-items:center;padding:6px 8px;
  //  border-radius:8px;font-size:12.5px}` (:112)
  const row = launcher.getByRole('listitem').first().getByRole('button');
  expect(await styleOf(row, 'display')).toBe('flex');
  expect(await styleOf(row, 'column-gap')).toBe('9px');
  expect(await styleOf(row, 'align-items')).toBe('center');
  expect(await styleOf(row, 'padding-top')).toBe('6px');
  expect(await styleOf(row, 'padding-left')).toBe('8px');
  expect(await styleOf(row, 'border-top-left-radius')).toBe('8px');
  expect(await styleOf(row, 'font-size')).toBe('12.5px');
  expect(await styleOf(row, 'border-top-width')).toBe('0px');

  // `.lc .rec .r:hover{background:var(--hover)}` (:113)
  await row.hover();
  await expect(row).toHaveCSS(
    'background-color',
    await tokenColour(page, '--hover'),
  );
});
