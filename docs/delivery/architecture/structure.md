# Structure

## What exists today

Nine Go packages and eleven frontend folders are on disk. Everything else in the tables below is
planned, and its row says so. A row marked *planned* is where that thing goes when it is built — it is
not a claim that it is there.

### Go packages under `internal/`

| Package | Contains | May import | State |
|---|---|---|---|
| `internal/apperr` | `ErrorCode`, `AppError`, `WireError`, `ToWire`, and every `*Result` envelope and cross-bridge DTO | *nothing under `internal/`* | exists |
| `internal/bootstrap` | The console logger used before the file logger exists, and `IsDevBuild()` behind a build tag | zerolog | exists |
| `internal/logging` | zerolog configured over a lumberjack file sink; satisfies the Wails logger interface | zerolog, lumberjack | exists |
| `internal/file` | Resolves the config, logs and database paths per OS, with a `-Dev` suffix under `wails dev` | `os` | exists |
| `internal/db` | Opens SQLite and runs goose migrations from `migrations/`. Three subfolders: `migrations/` (numbered, append-only), `queries/` (`settings.sql` — the sqlc input, hand-written) and `store/` (the sqlc output, never hand-edited; `just sqlc-check` diffs it) | `modernc.org/sqlite`, goose | exists |
| `internal/settings` | The typed settings groups over a generic key/value table | `internal/db`, `internal/apperr` | exists |
| `internal/appmodel` | The live application model: documents and their text, tabs, workspace reference, layout | `internal/apperr`, Wails runtime | exists |
| `internal/gate` | A single-flight guard: one long operation at a time, `apperr.Busy()` when held | *nothing* | exists, **no production caller yet** |
| `internal/application` | The composition root — builds the whole graph, holds the Wails context, opens the database in `Init` | every service and handler | exists |
| `internal/docs` | Reading and writing document files, native open and save dialogs, encoding and line-ending preservation | `internal/apperr`, `internal/file` | planned — Phase 05 |
| `internal/recent` | The recent files and folders list | `internal/db`, `internal/apperr` | planned — Phase 05 |
| `internal/workspace` | A folder opened as a tree of Markdown files | `internal/apperr`, `internal/file` | planned — Phase 07 |
| `internal/assets` | The guarded asset handler that serves a document's local images to the webview | `net/http`, `os` | planned — Phase 06 |
| `internal/export` | Export orchestration | `internal/apperr`, Wails runtime | planned — Phase 10 |
| `internal/fileassoc` | Turns a macOS open event, a command-line argument or a dropped path into one open request | `internal/apperr`, `os` | planned — Phase 08 |
| `internal/llm/…` | The assistant: providers, verification, tokenizer, context budget, tools, the agent loop, the action catalog | `net/http`, the packages above | planned — Phases 11–13 |

`main.go` is the composition root's outer half: it embeds `frontend/dist`, builds the
`ApplicationContextHolder`, and calls `wails.Run` with the `Bind` and `EnumBind` lists.

**Dependency direction.** Imports point down that table and never up. `internal/apperr` imports nothing
under `internal/`, which is what lets every other package depend on it. `internal/application` imports
everything, which is what lets nothing else need to. A service depends on an interface declared in the
package that owns the type it needs — `SettingsRepositoryAPI` lives in `internal/settings`, not in a
shared interfaces file.

### Frontend folders under `frontend/src/`

| Folder | Contains | State |
|---|---|---|
| `logic/adapter/` | The wrappers around the generated `wailsjs/` bindings, `unwrap()`, `guardArity()`, and the adapter singletons | exists |
| `logic/store/` | Redux Toolkit slices projecting the Go model — `documentsSlice`, `uiSlice`, `notificationsSlice` — plus the non-slice files they depend on: `appModelProjection.ts` (the hydrate-then-patch reducer), `appModelProjectionActions.ts`, `appModelTypes.ts`, `docViewCommands.ts` and `index.ts` | exists |
| `logic/hooks/` | `useSyncedBuffer`, `useDocumentCommands`, `useLivePreview` | exists |
| `logic/markdown/` | `renderer.ts` — the remark/rehype plugin set and the component overrides | exists |
| `logic/utils/` | `parseError` and small helpers | exists |
| `ui/styles/` | `tokens.css` and `base.css` | exists — 108 tokens across 8 palette blocks, 71 colour literals; the ten in `../plan/KNOWN_ISSUES.md` item 6 are still missing |
| `ui/primitives/` | `Segmented`, `Toast`, `ViewMenu` — Radix wrappers | exists |
| `ui/components/` | `CodeEditor`, `MarkdownView`, `StatusBar`, `ViewModeToggle` — presentational, no store imports | exists |
| `ui/widgets/` | `AppShell`, `EditorView`, `PreviewView`, `StartupFailure`, and from STORY-058 `SettingsMenu`, `AppearanceDialog` and `AppearanceControls`; plus `editorSession.ts`, the document-bound editor command seam — these read the store and dispatch commands | exists |
| `i18n/` | `catalog.ts`, `index.ts`, `locales/en.json` | exists |
| `dev/bridge-mock/` | A fake Wails bridge so `just dev-ui` runs with no Go process | exists |
| `ui/fonts/` | `Roboto-Latin.woff2` and `Inter-Latin.woff2` — the bundled subsets, referenced by `@font-face` in `tokens.css`. Nothing is fetched at runtime | exists |
| `test/` | Jest scaffolding, not tests: `setup.ts`, `i18nShim.ts`, `styleMock.ts` | exists |
| `logic/theme/` | `theme.ts` — normalisation, resolution and the root-attribute applier | exists — STORY-058. `watchSystemTheme` is STORY-060 |
| `logic/format/`, `logic/lint/` | Format, Compact and lint as plain functions | planned — Phase 04 and Phase 09 |
| `logic/llm/` | Scope resolution, token-meter formatting, edit-proposal to diff mapping | planned — Phases 11–13 |
| `ui/widgets/assistant/` | The right-hand assistant sidebar | planned — Phases 11–13 |

**Dependency direction.** `ui/widgets` may import `ui/components`, `ui/primitives`, `logic/store` and
`logic/adapter`. `ui/components` and `ui/primitives` may import neither the store nor the adapter — they
take props. Nothing outside `logic/adapter/` imports `wailsjs/`.

### Frontend folders outside `frontend/src/`

| Folder | Contains | State |
|---|---|---|
| `frontend/e2e/` | The Playwright journeys — `core-editor.test.ts` and its snapshots — run by `just e2e-test`. Against the mock bridge, which is `../plan/KNOWN_ISSUES.md` item 3 | exists |
| `frontend/scripts/` | `archtest.mjs`, the frontend half of `just archtest`; `archtest-allowlist.json`, which is never added to; `ensure-dist-placeholder.mjs` | exists |
| `frontend/wailsjs/` | Generated by `just gen`. Never hand-edited; `just gen-check` fails on drift | exists, generated |
| `frontend/dist/` | The built bundle, embedded into the binary by `main.go`. Gitignored, and produced by `just frontend-build` — which is why `just check` and `scripts/baseline.sh` run it before the tests | generated |

## Where a new thing goes

| Adding… | Goes in | Named |
|---|---|---|
| a backend capability the frontend calls | a new package `internal/<name>/` with `handler.go`, `service.go`, and `repository*.go` if it persists | `<Name>Handler`, `<Name>Service` |
| a method Wails binds | a method on an existing `*Handler`, returning an `apperr.*Result` | a verb: `OpenDocument`, `SetActiveTab` |
| a new envelope or cross-bridge struct | `internal/apperr/results.go` | `<Name>Result` for envelopes; a plain struct otherwise |
| a new error kind | a new `ErrorCode` constant in `internal/apperr/apperr.go`, a constructor beside the others, and a row in `AllErrorCodes` | `Code<Name>` |
| a table or column | a new numbered file in `internal/db/migrations/`, then `sqlc generate` | `000N_<what>.sql` |
| a small preference | a key in the existing `settings` key/value table and a typed getter — **not** a new table | |
| wiring | `internal/application/application_context_holder.go` — nowhere else | |
| a screen or a feature view | `frontend/src/ui/widgets/<Name>.tsx` + `<Name>.module.css` | `<Name>View` or `<Name>Dialog` |
| a reusable presentational control | `frontend/src/ui/components/` if it is ours, `frontend/src/ui/primitives/` if it wraps Radix | |
| a visual value | a custom property in `frontend/src/ui/styles/tokens.css` | `--<area>-<property>` |
| a call to the backend | a method on an adapter singleton in `frontend/src/logic/adapter/`, wrapped in `guardArity` | |
| a slice of projected state | `frontend/src/logic/store/<name>Slice.ts`, registered in `store/index.ts` | |
| a user-visible string | a key in `frontend/src/i18n/locales/en.json`, read through `t()` | |
| a shared helper with one caller | nowhere — inline it until there is a second caller | |

## Naming and file layout

- A Go test sits beside the code it tests, named `<file>_test.go`. Architecture tests are named
  `architecture_test.go` and their test functions start with `TestArchitecture`, because
  `just archtest` selects them with `-run TestArchitecture`.
- A React component is one file plus, if it has styling, one `<Name>.module.css` beside it. Its test is
  `<Name>.test.tsx` beside both.
- Go package names are lower-case single words with no underscores. Handler methods are verbs.
- Every test that proves a specification rule carries `Proves: <feature>#<anchor>` on its first comment
  line — for example `// Proves: themes-and-appearance#auto-follows-the-system`.
