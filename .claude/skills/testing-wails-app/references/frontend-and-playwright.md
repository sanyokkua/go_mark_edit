# Frontend and Playwright tests

Authority: `.claude/rules/ts-testing.md`. The adapter seam these tests mock is described in
`.claude/rules/ts-redux-adapter.md`.

## Jest / RTL — behavior, a11y queries, mock the adapter

Query by **accessible role / label / text** — never class names, test ids, or DOM structure. Mock
`logic/adapter` (the seam the app uses) — **never** `wailsjs/`. Use `findBy*` / `waitFor` for async
(debounced preview, async `MermaidBlock`).

```tsx
// Proves: STORY-031-AC-1
import { render, screen } from '@testing-library/react';
import { MarkdownView } from '@/ui/components/MarkdownView';

jest.mock('@/logic/adapter', () => ({ /* fake singletons — assert on rendered output, not wailsjs */ }));

it('STORY-031-AC-1 renders a GFM table in the preview', async () => {
  render(<MarkdownView standard="gfm" source={'| a | b |\n|---|---|\n| 1 | 2 |'} />);
  const table = await screen.findByRole('table');   // accessible role, not `.className`
  expect(table).toBeInTheDocument();
});
```

## The theme state-transition assertion (P2)

For appearance behavior, assert the DOM attribute the token system reads — not CSS values. When
appearance is `auto` and `matchMedia` reports dark, `document.documentElement` flips its `data-mode`
to `dark`:

```tsx
// Proves: STORY-045-AC-2
it('STORY-045-AC-2 resolves data-mode to dark when auto and system is dark', () => {
  mockMatchMedia({ prefersDark: true });
  applyResolvedTheme('auto');
  expect(document.documentElement.getAttribute('data-mode')).toBe('dark');
});
```

Theming is token-only, keyed on `data-theme` × `data-mode` — tests assert those attributes, never
hard-coded colors.

## Playwright — smoke and responsive

- **`just verify-smoke`** exercises interaction flows: type → debounced preview updates, Format, Lint,
  theme switch. Put the AC id first in the `test(...)` title.
- **`just verify-ui`** is the responsive/visual gate: zero horizontal overflow, zero console errors,
  and adequate contrast across widths × light + dark. It is backed by a screenshot check (P6).

```ts
// Proves: STORY-052-AC-1
test('STORY-052-AC-1 typing updates the debounced preview', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('textbox', { name: 'editor' }).fill('# Hello');
  await expect(page.getByRole('heading', { name: 'Hello' })).toBeVisible();
});
```

## Never

- Never import `wailsjs/` from a component test — mock `logic/adapter`.
- Never assert on class names / test ids / DOM structure — use accessible queries.
- Never use a fixed `setTimeout` for async output — `findBy*` / `waitFor`.
- Never make a real network call — the app is offline.
