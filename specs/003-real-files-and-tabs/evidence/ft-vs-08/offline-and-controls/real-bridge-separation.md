# Real-bridge separation — 2026-08-15

T037 requires proof that the **real** Wails bridge and the **mock** bridge are separated: that the
mock cannot reach production, that production never loads it, and that a green browser suite is
therefore never mistaken for evidence about the shipped binary.

This note is the item `offline-and-controls/README.md` listed under "What is not proven here".

## The separation is a build-mode switch, and it is one line

`frontend/vite.config.ts:33-39`:

```ts
export default defineConfig(({ mode }) => {
  const isMockMode = mode !== 'wails' && mode !== 'production';
  return {
    base: './',
    plugins: [react(), ...(isMockMode ? [bridgeMockPlugin()] : [])],
```

`bridgeMockPlugin` (`vite.config.ts:8-31`) is a `resolveId` hook that rewrites every
`wailsjs/go/<pkg>/<handler>` import to `src/dev/bridge-mock/go/<pkg>/<handler>.ts`. It is **not
registered at all** in `wails` or `production` mode, so in a release build the rewrite does not
exist and the real generated bindings resolve normally.

Consequences, both directions:

- **Production never loads the mock.** The plugin is absent from the plugin array, so no import
  path can reach `src/dev/bridge-mock/`. The mock is not tree-shaken out of a bundle that referenced
  it — it is never referenced.
- **The browser suite never reaches Go.** Playwright's web server runs plain `vite`
  (`playwright.config.ts` webServer: `npm run dev`), whose mode is `development`, so `isMockMode` is
  true for every browser run. The real bindings would resolve to `window.go`
  (`frontend/wailsjs/go/appmodel/AppModelHandler.js:5-7`), which the Wails runtime injects only
  inside the native webview and which is `undefined` under Playwright.

There is no third mode and no runtime toggle. Nothing can select the mock at run time in a shipped
binary, and nothing can select the real bridge in a browser.

## Why this matters more than it sounds

The separation is clean, but it means **a green Playwright suite is evidence about the mock's
behaviour, not Go's**. That is not a hypothetical.

T107 found the mock had **no 40-document capacity check at all** — `NewDocument` and `OpenDocument`
appended unconditionally — while Go had enforced `maxOpenDocuments = 40` the whole time. Every
browser suite was green throughout, because no browser test could construct a refusal to observe.
The defect that hid behind it (the frontend discarding every classified refusal) survived until the
mock was taught to refuse.

So the separation guarantee cuts both ways, and both halves belong in the record:

| Guarantee | Consequence |
| --- | --- |
| The mock cannot leak into production | A shipped binary always talks to Go |
| Production bindings cannot load in a browser | A browser test can never prove a Go contract |

The second is why `AGENTS.md` says a live check against `dev-ui` never substitutes for walking the
real `just build` binary, and why `capacity-refusals-2026-08-15.md` states its scope limit before
its result.

## Where each contract is actually proved

| Contract | Browser | Go | Real binary |
| --- | --- | --- | --- |
| 40-document cap exists | ✗ cannot | `TestOpenRefusesFortyFirstWithoutMutation` | `host-walkthrough-2026-08-15.md` |
| The interface honours a refusal | `FT-VS-09` ×2 | ✗ n/a | `host-screenshots/02`, `03` |
| Over-50-MiB refusal names the limit | `FT-VS-09` | `document_reader_test.go:154` | `host-screenshots/03` |
| No outbound request | `offline-and-controls.test.ts:73`, five continuous minutes | — | — |
| Deferred surfaces unavailable | `offline-and-controls.test.ts:194` | — | — |

The two offline rows are browser-only by nature — they assert the absence of network activity in
the page, which is where the production bundle's network guard also runs
(`frontend/scripts/check-production-network.mjs`, executed in `just check` as a postbuild step over
`src`, `public`, `wailsjs/go` and the built `dist`). That guard reads the **production** bundle, so
the offline claim is not mock-scoped even though the runtime assertion is.

## Fixture divergence, recorded as a known issue

The mock is not a faithful stand-in in every respect, and one divergence is already recorded in
`docs/delivery/plan/KNOWN_ISSUES.md`: `just dev-ui` sends arrays where Go marshals a nil slice to
`null`. A nil slice reaching a non-nullable TypeScript type throws a `TypeError` that the browser
suite cannot see because the mock never produces it.

When the mock was taught the capacity refusal for T107, the refusal was therefore shaped from the
Go source rather than invented — same category (`capacity-limit`), same message strings, same
`Cancel` remediation, and the guard placed on the distinct-insertion branch only so that focusing an
already-open identity stays valid at capacity per FR-FT-004. A test double is only worth what its
fidelity to the original is worth.
