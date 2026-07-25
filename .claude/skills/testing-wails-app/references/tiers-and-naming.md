# Tiers and the `Proves:` naming convention

Authority: `docs/stories/README.md` (the story format and the `Proves:` convention) and
`specification/02_Architecture/01_MODULE_INVENTORY.md` (valid module paths and each module's **Test
target**). Governing rules: `.claude/rules/go-testing.md`, `.claude/rules/ts-testing.md`.

## Every test names its AC (first line)

Tag the test with the criterion it proves, so a failure names the requirement rather than the function:

- **Go** — the leading comment above the function, first line exactly `// Proves: STORY-018-AC-2`.
- **TS / Jest** — the AC id opens the `it(...)` title, or a leading `// Proves:` comment.
- **Playwright** — put the AC id first in the `test(...)` title.

Each edge-case id a story covers (`EC-RENDER-*`, `EC-FMT-*`, `EC-THEME-*`, `EC-DOCS-*`, `EC-ASSET-*`,
…) should map to at least one named test too.

## Pick the tier from the story's Test plan

| Tier | Command | Covers | How to name the AC |
|---|---|---|---|
| Go unit | `go test -race ./...` (via `just test`) | Backend logic, `apperr` envelope shape/codes (P3), pure mappers (`fileassoc`), services with faked repos | `// Proves: STORY-NNN-AC-N` first comment line |
| Go integration | same, `integration` target | DB-backed repos (temp SQLite file, WAL), asset handler | same |
| Jest / RTL | `npx jest <path>` (via `just test`) | Frontend logic (markdown pipeline, format/lint, theme resolution) + components; behavior via a11y queries | `it('STORY-NNN-AC-N …', …)` or leading comment |
| Playwright smoke | `just verify-smoke` | Interaction flows (type→debounced preview, Format, Lint, theme switch) | AC id first in the `test(...)` title |
| Playwright responsive | `just verify-ui` | Overflow / console-error / contrast across widths × light+dark | P6 visual, backed by a screenshot check |

## Match the module's Test target

Cross-check the tier against the module's **Test target** column in `specification/02_Architecture/01_MODULE_INVENTORY.md`:

- **`yes` (unit-testable):** e.g. `logic/theme/`, `logic/markdown/`, `logic/store/`,
  `internal/apperr/`, `internal/fileassoc/`, `internal/gate/`.
- **`integration`:** e.g. `internal/db/`, `internal/docs/` — need a temp SQLite file or the asset
  handler.
- **`partial`:** test what is deterministically testable; note in the story what is exercised only via
  a higher tier.

If a module you are testing is not in the inventory, use only inventory paths — or add the module
there in the same story, if it is genuinely new.
