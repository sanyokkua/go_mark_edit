# Story front-matter and body

Authority: `specification/06_Process_and_Traceability/02_STORY_FORMAT.md` (schema, body order),
`05_ACCEPTANCE_CRITERIA_PATTERNS.md` (allowed AC phrasings), `01_MODULE_INVENTORY.md` (valid
`modules:` paths). Governing rule: `.claude/rules/traceability-and-stories.md`.

## What a story is

One Markdown file in `docs/stories/`, named `story-NNN-short-slug.md`: a YAML front-matter block (the
machine-readable contract `just trace` parses) plus a fixed-order Markdown body. **One story = one
coding session.** Ids are **permanent**: `STORY-NNN` (zero-padded 3), `STORY-NNN-AC-N` (1-indexed
within the story), and `EC-AREA-N` (e.g. `EC-ASSET-1`, defined in the owning spec clause) are never
reused, renumbered, or deleted — even when superseded.

## Front-matter (copy exactly; all required unless marked optional)

```yaml
---
id: STORY-014                          # string, pattern STORY-\d{3}, unique across the repo
title: Resolve relative image paths against the current document folder   # imperative, no trailing period
status: draft                          # draft | ready | in-progress | done | superseded
spec_clauses:                          # >=1; each <spec-file>#<anchor> resolves to a real heading
  - 01_Product/09_ASSETS_AND_SECURITY.md#relative-path-resolution
  - 00_Foundation/04_DESIGN_DECISIONS.md#6-rendering--assets
modules:                               # >=1; each a path from 01_MODULE_INVENTORY.md
  - internal/assets/
  - logic/markdown/
acceptance_criteria:                   # >=1; each STORY-014-AC-N, written out in the body
  - STORY-014-AC-1
  - STORY-014-AC-2
edge_cases:                            # optional; EC-[A-Z]+-\d+ cited from a spec clause
  - EC-ASSET-1
depends_on:                            # >=0; real story ids; the graph is acyclic
  - STORY-002
adrs:                                  # optional; only accepted ADR ids
  - ADR-0001
phase: 09                              # two-digit phase (00-10)
owner: coder                           # arch | coder | tester
estimate: M                            # S | M | L
---
```

### Field → rule

| Field | Rule |
|---|---|
| `id` | `STORY-\d{3}`, unique, permanent, matches the filename number. |
| `title` | One imperative sentence, no trailing period. |
| `status` | One of the five lifecycle enum values. |
| `spec_clauses` | ≥1; each `<file>#<anchor>` resolves to a real spec heading. |
| `modules` | ≥1; each path exists in `01_MODULE_INVENTORY.md`. |
| `acceptance_criteria` | ≥1; each `STORY-NNN-AC-N` also written out in the body. |
| `edge_cases` | Optional; each `EC-[A-Z]+-\d+` cited from a spec clause, each proven by a test. |
| `depends_on` | ≥0; each a real story id; the dependency graph is acyclic. |
| `adrs` | Optional; only `accepted` ADR ids. |
| `phase` | Two-digit phase number `00`–`10`. |
| `owner` | `arch` \| `coder` \| `tester`. |
| `estimate` | `S` \| `M` \| `L` (see `references/lifecycle-and-sizing.md`). |

## Body — fixed section order

`# STORY-NNN — <title>` then, in this order:

1. **Goal** — one paragraph, user-visible/behavioural, no implementation detail.
2. **In scope** — what this story creates/changes.
3. **Out of scope** — adjacent work; name the owning story id where one exists.
4. **Spec inputs** — one line per clause: `<clause> — <what to take from it>`.
5. **Design constraints** — the binding rules: Handler→Service→Repository layering, the
   `apperr.*Result` envelope, adapter-only-imports-`wailsjs/`, token-only theming, the offline
   invariant, and the relevant `DD-NN` / `ADR-NNNN`.
6. **Acceptance criteria** — each written out as `### STORY-NNN-AC-N`, phrased with a pattern from
   `05_ACCEPTANCE_CRITERIA_PATTERNS.md`.
7. **Test plan** — per AC: tier + file path + function name; each `EC-` maps to a named test.
8. **Definition of done** — the checklist from `02_STORY_FORMAT.md` / `06_DEFINITION_OF_DONE.md`.

## Worked example body fragment

```markdown
## Acceptance criteria

### STORY-014-AC-1
**Given** a document at `/docs/notes.md` referencing `![](img/logo.png)`, **when** the preview renders,
**then** the asset handler serves `/docs/img/logo.png` and the `<img>` resolves with no console error.

### STORY-014-AC-2
A relative image path that escapes the allowlist (e.g. `../../secret.png` outside the document root) is
rejected by the asset handler with HTTP 403 and is not read from disk. (satisfies EC-ASSET-1)

## Test plan
- STORY-014-AC-1 — integration — `internal/assets/handler_test.go` — `TestResolvesRelativeAssetPath`
- STORY-014-AC-2 — integration — `internal/assets/handler_test.go` — `TestRejectsTraversalOutsideAllowlist` (EC-ASSET-1)
```

Matching proving tests declare the AC id on the **first leading-comment / test-name line**:

```go
// Proves: STORY-014-AC-1
// Resolves a relative image path against the document folder via the asset handler.
func TestResolvesRelativeAssetPath(t *testing.T) { /* ... */ }
```

```ts
// Proves: STORY-031-AC-1
it('STORY-031-AC-1 renders a GFM table in the preview', () => { /* ... */ });
```
