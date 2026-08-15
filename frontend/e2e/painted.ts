import { expect, type Locator } from '@playwright/test';

/**
 * Assert that an element is actually painted where it says it is laid out.
 *
 * This exists because neither of the two assertions the suite reached for can
 * see a clip. Playwright's `toBeVisible()` is defined as *a non-empty bounding
 * box and no `visibility: hidden`* — an element clipped to nothing by an
 * ancestor's `overflow: hidden` still has a bounding box, so it passes.
 * `toContainText()` reads the accessibility/text tree and never consults layout
 * at all. T113 is the defect that proves it: the status bar's `Document
 * details` disclosure was clipped to nothing on every engine, and
 * `real-files-and-tabs.test.ts` asserted `toBeVisible()` on that exact region
 * while it painted nothing, inside a fully green suite.
 *
 * `document.elementFromPoint` is the check that does see it. It performs a real
 * hit test against the painted output, so an element clipped away by an
 * ancestor, or covered by a higher layer, returns something that is not the
 * element or one of its descendants.
 *
 * Use this for anything whose whole purpose is to be *seen* — popups,
 * disclosures, overlays. It is deliberately narrow: it proves the element's
 * centre is the topmost paint at that point, not that every pixel of it is.
 */
export async function expectPainted(
  locator: Locator,
  label: string,
): Promise<void> {
  const probe = await locator.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    const x = rect.left + rect.width / 2;
    const y = rect.top + rect.height / 2;
    const hit = document.elementFromPoint(x, y);
    return {
      width: Number(rect.width.toFixed(3)),
      height: Number(rect.height.toFixed(3)),
      x: Number(x.toFixed(3)),
      y: Number(y.toFixed(3)),
      painted: hit !== null && element.contains(hit),
      hit: hit === null ? null : describe(hit),
    };

    function describe(node: Element): string {
      const id = node.id === '' ? '' : `#${node.id}`;
      const role = node.getAttribute('role');
      return `${node.tagName.toLowerCase()}${id}${role === null ? '' : `[role="${role}"]`}`;
    }
  });

  expect(
    probe.width * probe.height,
    `${label} must occupy a non-empty box before it can be painted`,
  ).toBeGreaterThan(0);
  expect(
    probe.painted,
    `${label} is laid out at (${probe.x}, ${probe.y}) but the topmost paint there is ${probe.hit ?? 'nothing'}. ` +
      'It is clipped away or covered, and neither toBeVisible() nor toContainText() can see that (T113).',
  ).toBe(true);
}
