# T108 — a visible reason for the read-only state

Date: 2026-08-15. Branch `feature/v1-implementation--003-t108-readonly-reason`, based on `cc63ea98`.
Host: darwin 25.5.0.

## Headline

The derivation, the copy and the two fidelity fixes are done and green. **The clause is not closed**,
because the host walk found that the surface the reason lives in — the status bar's
`Document details` disclosure — **does not open on the packaged binary at all**. Filed as T113.

Two placements were tried. Both failed on the real binary, for different and independently
interesting reasons. Neither failure is visible to any existing test layer.

## 1. Stale-instance guard

| Walk                   | Binary mtime        | Process start                                                                                |
| ---------------------- | ------------------- | -------------------------------------------------------------------------------------------- |
| title-bar attempt      | 2026-08-15 15:18:39 | 15:18:45                                                                                     |
| details-region attempt | 2026-08-15 15:25:26 | **15:25:48** (relaunched: the first launch shared the binary's second, which is not a guard) |

Autosave off. Fixtures: `boundary-10mib-plus-one.md` (10,485,761 bytes) and
`boundary-50mib-exact.md` (52,428,800 bytes) — both inside FR-FT-005's read-only band.

## 2. What the backend already provided, and nothing read

`sizeClass` is projected all the way into the store (`documentsSlice.ts:43`) and has **zero display
consumers** — the only other hits in `frontend/src` are its type declaration and the bridge mock.
`capability` is read for availability only. The status cannot carry the reason: `save_status.go:28-31`
collapses every non-writable capability onto the single `read-only` status, so by the time a status
exists the discriminator is gone.

`readOnlyReason` (`frontend/src/ui/components/readOnlyReason.ts`) maps `capability` — the finer
signal — onto two reasons:

| Go capability      | Set by                                         | Reason                                    |
| ------------------ | ---------------------------------------------- | ----------------------------------------- |
| `large-read-only`  | `document_reader.go:276-278`, size > 10 MiB    | _over the 10 MiB editing limit_           |
| `unsafe-read-only` | `:266-275`, invalid UTF-8 / NUL byte / lone CR | _its contents cannot be rewritten safely_ |

The three unsafe sub-reasons are **not** distinguishable in the frontend: Go records them in
`ClassifiedRead.Warning`, and `apperr.DocumentMetadata` has no `Warning` field, so the distinction
dies at the bridge. The copy is honest about the class rather than guessing which of the three.

## 3. Two fidelity defects fixed alongside

**The mock emitted a value Go never produces.** `AppModelHandler.ts` seeded
`capability: 'read-only'` for `status-read-only` and `tab-detached`. Go emits exactly `writable`,
`unsafe-read-only`, `large-read-only` or `refused` (`document_reader.go:25-28`) — `read-only` is a
save _status_. No browser case could reach the capability branch even in principle. Worse,
`appModel.test.ts:88` **asserted** the impossible value, so the fixture was pinned in place by a
test. Both corrected; the assertion carries a comment naming the Go line.

**Two frontend comparisons were dead.** `App.tsx`'s `capability === 'read-only'` in `beginWrite` and
in the menu's `writable` computation never matched Go. They were harmless — `status === 'read-only'`
sits beside each and already catches every case — but they read as capability checks that were not
one. Both now mirror Go's own predicate (`capability !== undefined && capability !== 'writable'`).

## 4. Placement attempt 1 — the title bar. Reverted, and why.

The suffix worked: on the real binary the title bar rendered
`gomarkedit-walkthrough / … Read-only · over t…` — which **confirms the whole path end to end**,
`capability: 'large-read-only'` crossing the bridge and driving the mapping on the packaged binary.

It then ellipsised, at **full window width**. `.identity` is capped at `max-width: 40ch` — the
binding's own value, `mockup.html:70` — and the filename plus its parent already compete for it.
The cap drops to `16ch` at ≤376px (`DocumentIdentity.module.css`), narrow enough to truncate the
word `Read-only` itself. A surface that can lose the _state_ is a worse home for the _reason_ than
one that does not, so this half was reverted and
`T108 keeps the title-bar status to the bare state, without the reason` now pins the decision so it
is not retried.

Widening the cap was rejected without trying it: `40ch` is a binding-derived value, and rebalancing
the flex children would change computed `min-width`, which **is** in `METRIC_PROPERTIES`.

## 5. Placement attempt 2 — `Document details`. Blocked, and the blocker is new.

The reason now renders beside `status.readOnlyWarning` in the disclosure region, with two red-first
tests. On the packaged binary the disclosure **opens nothing** — verified on the 50 MiB fixture and
on a fresh `⌘N` document, at full window width, with repeated single clicks on the button's measured
centre, zooming the whole band above the status row each time.

**Root cause, pure CSS.** `.statusBar` is `position: relative` with **`overflow: hidden`** and
`max-height: var(--status-bar-min-height)` (28px). `.details` is `position: absolute` translated by
`translateY(calc(-100% - var(--status-bar-min-height)))` — entirely outside its clipping ancestor.
It is rendered, it is in the accessibility tree, and it paints nothing. Not host-specific: it is
equally invisible in Chromium.

**Why three layers all pass.** `targeted-parity.test.ts:1653-1656` clicks the trigger and asserts
`toContainText('Read-only')`; Playwright's text assertion does **not** require visibility, so it
passes on a clipped element where `toBeVisible` would fail. `StatusBar.test.tsx` runs in jsdom,
which has no layout. The Go tests stop at the model boundary. Every instrument that "verified" this
disclosure is structurally blind to clipping.

Filed as **T113**, with the three fix options and their costs, because choosing between them is a
parity-contract decision rather than a one-line change — `overflow` is itself a compared property.

## 6. Gates

| Gate            | Result                                                                                                                       |
| --------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `just check`    | **exit 0** — 551 frontend tests / 77 suites, every Go package `ok`. Diffed against the `258d1d32` baseline: no new findings. |
| `just e2e-test` | **259 passed, exit 0** — the baseline, no `T026` flake. Parity accounting 150/150 attempted, 150 passed, 0 unaccounted.      |

The six `T063` palette cases pass unchanged, confirming the status row's own contract is untouched:
the reason lives inside the disclosure, which the row does not render at rest.

No edit to `frontend/e2e/parity/reference-adapter.ts`; `REFERENCE_ADAPTER_HASH` untouched.

## 7. What is not done

FR-FT-005's "visible reason" is **not** satisfied yet. The derivation is correct and tested, but on
the real binary there is currently no surface on which it is visible — the title bar truncates it and
the disclosure does not open. T108 therefore stays open and T113 gates it. Ticking it now would be a
ticked box with no passing check behind it.
