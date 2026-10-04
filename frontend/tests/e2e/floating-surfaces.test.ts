import type { Locator, Page } from '@playwright/test';

import { expect, test } from '../support/harness';

const palettes = [
    ['Liquid Glass', 'Light', 'glass', 'light'],
    ['Liquid Glass', 'Dark', 'glass', 'dark'],
    ['Material', 'Light', 'material', 'light'],
    ['Material', 'Dark', 'material', 'dark'],
    ['Minimal', 'Light', 'minimal', 'light'],
    ['Minimal', 'Dark', 'minimal', 'dark'],
] as const;

async function selectPalette(page: Page, themeLabel: string, modeLabel: string, theme: string, mode: string) {
    await page.getByRole('button', { name: 'Settings', exact: true }).click();
    const menu = page.getByRole('menu', { name: 'Settings menu' });
    await menu.getByRole('radio', { name: themeLabel, exact: true }).click();
    await menu.getByRole('radio', { name: modeLabel, exact: true }).click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
    await expect(page.locator('html')).toHaveAttribute('data-mode', mode);
    await page.keyboard.press('Escape');
}

async function expectFloatingSurface(target: Locator, glass: boolean): Promise<void> {
    await expect(target).toBeVisible();
    const appearance = await target.evaluate((element) => {
        const style = getComputedStyle(element);
        return {
            backdrop: style.backdropFilter,
            background: style.backgroundColor,
        };
    });
    if (glass) {
        expect(appearance.backdrop).toContain('blur(48px)');
        expect(appearance.background).toMatch(/^rgba\(/u);
    } else {
        expect(appearance.backdrop).toBe('none');
        expect(appearance.background).toMatch(/^rgb\(/u);
    }
}

async function expectHighContrastUnderlayObscured(page: Page, target: Locator): Promise<void> {
    await target.evaluate((element) => {
        const frame = document.querySelector<HTMLElement>('.application-frame');
        if (frame === null) throw new Error('application frame is missing');
        const bounds = element.getBoundingClientRect();
        const frameBounds = frame.getBoundingClientRect();
        const probe = document.createElement('div');
        probe.dataset.frostProbe = '';
        Object.assign(probe.style, {
            backgroundImage: 'repeating-linear-gradient(90deg, #000 0 16px, #fff 16px 32px)',
            height: `${bounds.height}px`,
            left: `${bounds.left - frameBounds.left}px`,
            pointerEvents: 'none',
            position: 'absolute',
            top: `${bounds.top - frameBounds.top}px`,
            width: `${bounds.width}px`,
            zIndex: '1',
        });
        frame.append(probe);
    });
    try {
        const first = (await target.screenshot()).toString('base64');
        await page.locator('[data-frost-probe]').evaluate((probe) => {
            (probe as HTMLElement).style.backgroundImage =
                'repeating-linear-gradient(90deg, #fff 0 16px, #000 16px 32px)';
        });
        const second = (await target.screenshot()).toString('base64');
        const meanDifference = await page.evaluate(
            async ([firstImage, secondImage]) => {
                const load = async (base64: string): Promise<ImageData> => {
                    const image = new Image();
                    image.src = `data:image/png;base64,${base64}`;
                    await image.decode();
                    const canvas = document.createElement('canvas');
                    canvas.width = image.naturalWidth;
                    canvas.height = image.naturalHeight;
                    const context = canvas.getContext('2d');
                    if (context === null) throw new Error('screenshot canvas unavailable');
                    context.drawImage(image, 0, 0);
                    return context.getImageData(0, 0, canvas.width, canvas.height);
                };
                const before = await load(firstImage);
                const after = await load(secondImage);
                if (before.width !== after.width || before.height !== after.height) {
                    throw new Error('floating surface changed size between screenshots');
                }
                let difference = 0;
                let channels = 0;
                for (let y = Math.floor(before.height * 0.25); y < Math.ceil(before.height * 0.75); y += 1) {
                    for (let x = Math.floor(before.width * 0.25); x < Math.ceil(before.width * 0.75); x += 1) {
                        const pixel = (y * before.width + x) * 4;
                        for (let channel = 0; channel < 3; channel += 1) {
                            difference += Math.abs(before.data[pixel + channel] - after.data[pixel + channel]);
                            channels += 1;
                        }
                    }
                }
                return difference / channels;
            },
            [first, second] as const,
        );
        expect(meanDifference).toBeLessThan(12);
    } finally {
        await page.locator('[data-frost-probe]').evaluate((probe) => probe.remove());
    }
}

test('floating menus and dialogs obscure high-contrast content in Glass and remain solid in other themes', async ({
    app,
}) => {
    await app.launch();
    const { page } = app;

    for (const [themeLabel, modeLabel, theme, mode] of palettes) {
        await selectPalette(page, themeLabel, modeLabel, theme, mode);
        await page.getByRole('button', { name: 'About', exact: true }).click();
        const popup = page.locator('[data-viewport-popup="about-menu"]');
        await expectFloatingSurface(popup, theme === 'glass');
        expect(await popup.evaluate((element) => element.parentElement === document.body)).toBe(true);
        if (theme === 'glass') await expectHighContrastUnderlayObscured(page, popup);

        await popup.getByRole('menuitem', { name: 'About GoMarkEdit' }).click();
        const dialog = page.getByRole('dialog', { name: 'About GoMarkEdit' });
        await expectFloatingSurface(dialog, theme === 'glass');
        if (theme === 'glass') await expectHighContrastUnderlayObscured(page, dialog);
        await dialog.getByRole('button', { name: 'Close' }).click();
        await expect(dialog).toHaveCount(0);
    }
});
