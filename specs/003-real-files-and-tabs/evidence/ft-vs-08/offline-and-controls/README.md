# Offline behaviour, deferred boundaries and actual-control operation

**Requirements**: FR-FT-048 (zero background network), FR-FT-049 (no deferred
surface gains behaviour), and the actual-control half of SC-FT-010.
**Measured**: 2026-08-14.
**Suite**: `frontend/e2e/offline-and-controls.test.ts`.

## FR-FT-048 — five continuous minutes, denied rather than counted

`five-minute-request-denial.json` / `.log`.

|                              |                               |
| ---------------------------- | ----------------------------: |
| observed                     | **303,011 ms (5.05 minutes)** |
| interactions performed       |                        **30** |
| sample interval              |                     10,000 ms |
| **outbound requests denied** |                         **0** |

The distinction that matters: the harness routes **every** request and _aborts_
anything whose origin is not `http://127.0.0.1:4173` (`data:` and `blob:` are
treated as local). Counting requests proves only that someone looked; denying
them means a request that did happen would also change the application's
behaviour and surface as a visible failure. Zero were denied because zero were
made.

Idle observation alone would miss the paths most likely to reach out, so the
five minutes alternate idle with real interaction on a 10-second cadence:
typing, opening the Settings popup, switching theme, opening the View menu, and
creating a tab — 30 interactions in total, each driven through the real
accessible control.

This complements rather than repeats `frontend/scripts/check-production-network.mjs`,
which is a **static** scan of the sources and the built bundle (`production
network guard: ok`, exit 0). Static analysis cannot see a timer, a retry, an
update check or a font fetch that only exists while the application is running.

## FR-FT-049 — the deferred boundary

`deferred-boundary.json`.

Availability is read from the action registry, never inferred from whether a
handler happens to be wired, and the rendered control is then required to agree
with the registry. All eight deferred actions report `kind: "deferred"`:

`open-folder`, `new-window`, `toggle-assistant`, `distraction-free-reading`,
`image`, `format`, `compact`, `lint`.

The toolbar renders `format`, `compact` and `lint` disabled; the View menu
renders `Toggle Assistant` and `Distraction-free reading` disabled.

**The zero-width Assistant is measured, not assumed.** The Assistant is a grid
_track_, not an element — `AppShell.module.css:23` gives the third column
`var(--shell-assistant-collapsed-width)`, which `tokens.css:184` sets to `0` —
so it is read off the resolved `grid-template-columns`. Measured at 1280:

```
216px  1064px  0px
```

The first value is the binding's own workspace width (`mockup.html:254`
`.sidebar{width:216px}`). An earlier draft of this assertion queried for a
`[data-assistant-track]` element, found nothing, and passed vacuously; that is
recorded here because it is the failure mode this kind of assertion invites.

## Actual-control operation at all widths

Covered by suites rather than by this file, and all green:

| Concern                                                                      | Suite                                               |
| ---------------------------------------------------------------------------- | --------------------------------------------------- |
| pointer/keyboard reachability at 1280/768/375, all six palettes              | `editor-stage.test.ts` — 108/108                    |
| narrow-width control reach, drop order, wrapping, prompts, launcher, preview | `narrow-width.test.ts` — 20/20                      |
| shell chrome inventory and availability, focus ring, popup containment       | `window-shell.test.ts` — all behavioural assertions |
| tab roving tabindex, Home/End, arrows, Copy path, Reveal, hostile labels     | `DocumentTabs.test.tsx` — 27/27                     |

## What is not proven here

**Host-renderer evidence.** T037 also requires separately classified
native-host screenshots, so that a host-renderer difference can never be used to
waive a same-browser mismatch. That needs the built binary driven through its
real controls on the current host, which this session could not do — see the
note in `../../ft-ev-09/` and `../phase-18/blocking-decisions.md`. The existing
native walkthrough (`ft-ev-09/current-host-walkthrough.md`, 2026-08-13) predates
this session's four production fixes and is not a substitute.
