**Owner:** architect
**Audience:** architect, coder
**Last Updated:** 2026-07-25
**Cross-references:** `07_Phases/00_ROADMAP.md`, `04_DESIGN_DECISIONS.md`, `02_Architecture/01_SYSTEM_ARCHITECTURE.md`, `02_Architecture/08_LLM_INTEGRATION.md`

# Forward-compatibility constraints

**This file used to define a three-stage delivery model on top of the phases. That model was removed
on 2026-07-25** because it contradicted the phase dependencies: it placed the folder workspace, file
associations, assets and theming in "Stage 1 — Viewer" while every one of them depends on file I/O,
which it placed in Stage 2. Stage 1 could therefore never be completed. It also described Stage 1 as
"rendered, not editable" long after the editor had shipped.

There is now one ordering: `07_Phases/00_ROADMAP.md`.

What survives is the genuinely useful half of the old document — the constraints that stop an early
phase from building a wall the later ones cannot get through.

## The rule

**Build less if you like, but do not build a wall.** An early phase may leave a capability
unimplemented; it may not make a structural decision that forces a later phase to rework what it has
already shipped.

These are binding. A story that violates one is not done.

## F1 — Three-region layout

The app shell is a horizontal three-region layout: **left** (file tree), **center** (document area),
**right** (assistant). Until the assistant exists the right region is empty and collapsed, but the
layout, its show/hide plumbing and its grid slot **exist and are reserved**. Adding the assistant must
not restructure the shell. (DD-38)

## F2 — Documents have identity and a content accessor

Each open document is a first-class model with an id, a path, and a read accessor for its content and
selection — not a bare string passed around. The accessor's shape is what later features read through.

## F3 — One document-command seam

There is a single interface through which document content is read and mutated. Nothing reaches into
the editor widget directly. The assistant's apply-edit goes through this same seam.

## F4 — The settings registry can grow

Settings are a typed, grouped registry over the KV store. New groups — including AI / Providers and AI
Context — are added without a schema rewrite. Migrations are additive; the `providers` table arrives
later as a new additive migration.

## F5 — Backend seams reserved

The DI root, the `apperr` envelope, logging, the single-flight gate and the file services exist. The
gate is **generic** — it guards "a long operation", so format-all, export and inference all reuse the
same one. No decision may assume a single running instance; several windows are supported (DD-08).

## F6 — The offline invariant is scoped, not absolute

The rule is **no background or unsolicited network**, not "never open a socket" (DD-32). Do not
hard-code an assumption that blocks a user-invoked call to a configured provider later. Keep an
HTTP-client seam possible without building it.

## F7 — The editable buffer exposes selection and apply-edit

Once editing exists, the F3 seam gains get-selection, replace-range and replace-all. These are exactly
what an edit proposal needs, so they are the stable public surface — not private editor callbacks.

## F8 — Format and Lint are callable programmatically

The transforms are pure, callable functions, not only toolbar handlers, so they can be run after an
applied edit or reused elsewhere.

## F9 — Diff rendering is a reusable component

The diff view is standalone. The format preview and the assistant's edit-proposal card are two
consumers of one component.

## F10 — The visual layer is a token system, from the start

_Added 2026-07-25, because the previous plan violated it._

Every visual value is a design token resolved through `data-theme` × `data-mode`. No component ships a
hardcoded colour, and no component assumes a single appearance. There was no such constraint among
F1–F9, theming was consequently scheduled ninth of sixteen, and the result was an application with 62
layout tokens and no colours at all — every surface built before it would have had to be restyled.

A phase that adds a surface adds its tokens at the same time.

## What is built last

The assistant — sidebar, provider abstraction, tool loop, tokenizer, AI settings — is built entirely by
**consuming** F1–F10. It never restructures an earlier contract. If it needs one changed, that is a new
story and, when significant, an ADR. See `02_Architecture/08_LLM_INTEGRATION.md`.
