import type { Locator } from '@playwright/test';

import { expect } from '@playwright/test';

/** Compare rendered command, radio and switch rows, including disabled choices. */
export async function expectCompactMenuRows(popup: Locator): Promise<void> {
    const rows = await popup
        .locator('[role="menuitem"], [role="menuitemcheckbox"], [role="menuitemradio"], [role="radio"]')
        .evaluateAll((elements) =>
            elements
                .map((element) => {
                    const style = getComputedStyle(element);
                    return {
                        label: element.getAttribute('aria-label') ?? element.textContent,
                        height: element.getBoundingClientRect().height,
                        fontFamily: style.fontFamily,
                        fontSize: style.fontSize,
                        fontWeight: style.fontWeight,
                        lineHeight: style.lineHeight,
                        paddingTop: style.paddingTop,
                        paddingBottom: style.paddingBottom,
                        gap: style.columnGap,
                    };
                })
                .filter((row) => row.height > 0),
        );
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) {
        expect(row.fontSize, row.label ?? 'menu row').toBe('13px');
        expect(row.fontFamily, row.label ?? 'menu row').toBe(rows[0]?.fontFamily);
        expect(row.fontWeight, row.label ?? 'menu row').toBe('400');
        expect(row.lineHeight, row.label ?? 'menu row').toBe('16px');
        expect(row.paddingTop, row.label ?? 'menu row').toBe('4px');
        expect(row.paddingBottom, row.label ?? 'menu row').toBe('4px');
        expect(row.gap, row.label ?? 'menu row').toBe('12px');
        expect(row.height, row.label ?? 'menu row').toBeCloseTo(30, 1);
    }
}
