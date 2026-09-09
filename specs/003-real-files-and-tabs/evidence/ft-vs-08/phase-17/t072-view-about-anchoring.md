# T072 — View and About popups at the binding coordinates

**Requirement**: FR-FT-045, FR-FT-053, FR-FT-055, SC-FT-009.
**Status**: **partial.** Positioning is converged; the View popup's action
inventory still differs from the binding and is not yet reconciled.

## Change

Both popups previously used Radix's collision-aware Popper placement, which put
them wherever the viewport allowed. They now follow the File-popup conversion:
portalled into `.application-frame` and anchored at the binding coordinates,
with the popper wrapper neutralised so it contributes no placement of its own.

| Popup | Binding source                                 | Token                                         |
| ----- | ---------------------------------------------- | --------------------------------------------- |
| View  | `#m-view{left:196px}` + `.dropdown{top:42px}`  | `--view-menu-popup-left`, `--menu-popup-top`  |
| About | `#m-about{left:240px}` + `.dropdown{top:42px}` | `--about-menu-popup-left`, `--menu-popup-top` |

The narrow (375px) View anchor keeps its row-relative placement: the binding
anchoring applies only when no explicit anchor style is supplied.

The token is named `--menu-popup-top`, not `--shell-popup-top`, because the
Feature 001 shell-token contract test enumerates the exact `--shell-*` set.

## Result

T061 moved from `bounds.left: 216.203 != 222` to `bounds.bottom: 455 != 457`:
the popup's left and top now match the binding exactly, and only a 2px height
difference remains.

Real-application check at 1280x720, Minimal Light, through the real menubar
controls:

```json
View  {"relLeft":196,"relTop":42,"items":9}
About {"relLeft":240,"relTop":42,"items":4}
```

`Escape` closed the View popup and returned focus to its trigger
(`{"viewClosed":true,"focusAfterEscape":"View"}`).

## What remains

The View popup's inventory does not match the binding and is the reason for the
residual height difference:

| Reference `#m-view`            | Production                                               |
| ------------------------------ | -------------------------------------------------------- |
| Toggle Sidebar `Ctrl \`        | Editor / Split / Preview arrangement radios (90px group) |
| Toggle Assistant `Ctrl J`      | Toggle Sidebar                                           |
| Show Editor ✓                  | Toggle Assistant                                         |
| Show Preview ✓                 | Line numbers                                             |
| _separator_                    | Word wrap                                                |
| Line numbers (33px switch row) | Distraction-free reading                                 |
| Word wrap (33px switch row)    | Full screen                                              |
| _separator_                    | _(no separators)_                                        |
| Distraction-free reading       |                                                          |
| Full screen `F11`              |                                                          |

Reconciling this touches Feature 002-owned View behaviour (the arrangement
radios have no binding counterpart, and the binding's Show Editor / Show Preview
checkboxes are the switches Feature 002 owns). It needs its own task slice
rather than an opportunistic edit, and it is the remaining T072 work together
with the Glass menubar drift (T058 glass-light, 6,187 unexplained pixels).

## Gates

`npm --prefix frontend test -- --runInBand` 74 suites / 466 tests, `just typecheck`,
`just fmt-check`, `just lint` (0 errors), `just archtest` — all green.
