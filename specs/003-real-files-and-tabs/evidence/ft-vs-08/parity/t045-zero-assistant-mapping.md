# T045 zero-Assistant reference mapping

Date: 2026-08-09

## Decision

Preserve CL-17 and FR-FT-049. The production Assistant remains zero-width and deferred. The fixed parity
reference boundary is the existing mockup zero-Assistant state, applied by the Feature 003 reference adapter
and named explicitly as `#app.no-assistant .content` for editor-family captures.

The adapter activates the mockup's existing `.app.no-assistant .assistant { width: 0; border-left: 0; }` rule.
The raw mockup source remains immutable and its SHA-256 remains
`af1c8abb0f9e214337c95b08cddb23727bf5eb14f0f246e681597e369880c41b`.

## Direct reference probe

With transitions frozen, the served reference reported the following mapped-region values:

| Viewport | App class | Content left | Content width | Content right | Assistant display | Assistant width |
| ---: | --- | ---: | ---: | ---: | --- | ---: |
| 1280 | `app no-assistant` | 236.203 | 1023.594 | 1259.797 | `flex` | 0px |
| 768 | `app no-assistant` | 227.281 | 528.188 | 755.469 | `none` | 0px |
| 375 | `app no-assistant` | 6.625 | 361.750 | 368.375 | `none` | 0px |

## Verification

- `npm --prefix frontend test -- --runInBand`: 72 suites, 394 tests passed with loopback permission.
- `npm --prefix frontend run typecheck`: passed.
- `just archtest`: passed.
- `just check`: generation, build, formatting, frontend checks, and the production network guard passed; the
  unchanged Go lint command exited 5 with `context loading failed: no go files to analyze` and is recorded as
  `UNRELIABLE`, not as a code finding.
- A fresh unrestricted T035 run was started with server reuse disabled. It captured 393 current metric artifacts
  before being stopped because the serial 1,638-capture run was taking hours. The first editor metric now reports
  reference width `1023.59px`, right edge `1259.797`, and Assistant-bearing geometry is absent. The remaining
  first-case differences are retained production/reference drift (`top`, `height`, `display`, padding, background,
  and pixel differences); T035 and T045 remain open.
