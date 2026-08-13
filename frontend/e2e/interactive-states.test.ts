import { expect, test, type Locator, type Page } from '@playwright/test';

/*
 * Parity captures are taken at rest, so no suite in this repository has ever
 * observed a hover, focus or open state. Three defects found by eye in one week
 * lived in exactly that blind spot:
 *
 *   1. the arrangement segment sitting in the wrong place in the toolbar,
 *   2. Settings not lighting up under the pointer,
 *   3. View not lighting up under the pointer.
 *
 * These cases exercise the states a screenshot at rest cannot reach. They assert
 * that a control *changes* under the pointer and under keyboard focus, rather
 * than pinning one palette's exact colour, so a token change stays free while a
 * control that responds to nothing still fails.
 */

const MENUS = ['File', 'Settings', 'View', 'About'] as const;

async function background(locator: Locator): Promise<string> {
  return locator.evaluate(
    (element) => getComputedStyle(element).backgroundColor,
  );
}

function isTransparent(colour: string): boolean {
  return colour === 'rgba(0, 0, 0, 0)' || colour === 'transparent';
}

async function menuTrigger(page: Page, name: string): Promise<Locator> {
  const trigger = page
    .getByRole('navigation', { name: 'Application actions' })
    .getByRole('button', { name, exact: true });
  await expect(trigger).toBeVisible();
  return trigger;
}

for (const name of MENUS) {
  test(`T076 the ${name} menu trigger lights up under the pointer`, async ({
    page,
  }) => {
    await page.goto('/');
    const trigger = await menuTrigger(page, name);

    const resting = await background(trigger);
    await trigger.hover();
    // Wait for the hovered value rather than reading once, so this cannot pass
    // by sampling before the style applies.
    await expect.poll(async () => background(trigger)).not.toBe(resting);

    const hovered = await background(trigger);
    expect(isTransparent(hovered)).toBe(false);

    // Moving the pointer away must return it, so the change is a hover state
    // and not a one-way class that happens to differ.
    await page.mouse.move(0, 0);
    await expect.poll(async () => background(trigger)).toBe(resting);
  });

  test(`T076 the ${name} menu trigger shows a visible focus ring`, async ({
    page,
  }) => {
    await page.goto('/');
    const trigger = await menuTrigger(page, name);

    const resting = await trigger.evaluate((element) => {
      const style = getComputedStyle(element);
      return `${style.outlineStyle}|${style.outlineWidth}|${style.boxShadow}`;
    });

    await trigger.focus();
    await expect(trigger).toBeFocused();
    const focused = await trigger.evaluate((element) => {
      const style = getComputedStyle(element);
      return `${style.outlineStyle}|${style.outlineWidth}|${style.boxShadow}`;
    });

    // Constitution VI requires visible focus. Something must change, and it
    // must not be `outline: none` with nothing in its place.
    expect(focused).not.toBe(resting);
    expect(focused).not.toMatch(/^none\|0px\|none$/u);
  });
}

test('T076 an open menu trigger is drawn as open', async ({ page }) => {
  await page.goto('/');

  for (const name of ['File', 'Settings', 'View', 'About'] as const) {
    const trigger = await menuTrigger(page, name);
    const resting = await background(trigger);

    await trigger.click();
    // `aria-expanded` rather than Radix's `data-state`: Settings is a custom
    // portal and exposes only the ARIA attribute, and that is the one
    // assistive technology actually reads.
    await expect(trigger).toHaveAttribute('aria-expanded', 'true');
    const open = await background(trigger);
    expect(open).not.toBe(resting);
    expect(isTransparent(open)).toBe(false);

    await page.keyboard.press('Escape');
    await expect(trigger).toHaveAttribute('aria-expanded', 'false');
  }
});

test('T076 holds the arrangement segment at the toolbar trailing edge', async ({
  page,
}) => {
  await page.goto('/');

  const toolbar = page.getByRole('toolbar', { name: 'Document toolbar' });
  await expect(toolbar).toBeVisible();
  const segment = toolbar.getByRole('radiogroup', {
    name: 'View arrangement',
  });
  await expect(segment).toBeVisible();

  const [toolbarBox, segmentBox, paddingRight] = await Promise.all([
    toolbar.boundingBox(),
    segment.boundingBox(),
    toolbar.evaluate(
      (element) => parseFloat(getComputedStyle(element).paddingRight) || 0,
    ),
  ]);
  expect(toolbarBox).not.toBeNull();
  expect(segmentBox).not.toBeNull();
  if (toolbarBox === null || segmentBox === null) return;

  // The segment ends at the toolbar's content edge. The defect this catches put
  // it mid-row, with the remaining space trailing after it.
  const contentRight = toolbarBox.x + toolbarBox.width - paddingRight;
  expect(segmentBox.x + segmentBox.width).toBeCloseTo(contentRight, 0);

  // And it is genuinely last: nothing in the toolbar starts after it does.
  const startsAfterSegment = await toolbar.evaluate((element) => {
    const group = element.querySelector<HTMLElement>('[role="radiogroup"]');
    if (group === null) return -1;
    const groupLeft = group.getBoundingClientRect().left;
    return Array.from(element.querySelectorAll<HTMLElement>(':scope > *'))
      .filter((child) => !child.contains(group))
      .filter((child) => child.getBoundingClientRect().left > groupLeft).length;
  });
  expect(startsAfterSegment).toBe(0);
});

test('T076 keeps every arrangement option reachable and exactly one checked', async ({
  page,
}) => {
  await page.goto('/');

  const segment = page
    .getByRole('toolbar', { name: 'Document toolbar' })
    .getByRole('radiogroup', { name: 'View arrangement' });
  const options = segment.getByRole('radio');
  await expect(options).toHaveCount(3);

  const checked = await options.evaluateAll(
    (elements) =>
      elements.filter(
        (element) => element.getAttribute('aria-checked') === 'true',
      ).length,
  );
  expect(checked).toBe(1);

  /*
   * The binding gives `.seg button` `background:none` and declares no `:hover`
   * rule at all (mockup.html:291-292) — selection, not hover, is what this
   * control signals. So the contract asserted here is the binding's: the
   * checked option carries a surface, the unchecked ones carry none, and every
   * option advertises itself as clickable.
   */
  for (const index of [0, 1, 2]) {
    const option = options.nth(index);
    const isChecked = (await option.getAttribute('aria-checked')) === 'true';
    expect(isTransparent(await background(option))).toBe(!isChecked);
    await expect(option).toHaveCSS('cursor', 'pointer');
  }

  // Selection follows the click, and moves — a segment stuck on one option is
  // the failure this guards.
  await options.nth(2).click();
  await expect(options.nth(2)).toHaveAttribute('aria-checked', 'true');
  expect(isTransparent(await background(options.nth(2)))).toBe(false);
  expect(isTransparent(await background(options.nth(0)))).toBe(true);
});
