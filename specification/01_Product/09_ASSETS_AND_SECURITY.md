**Status:** Accepted
**Owner:** architect
**Audience:** architect, coder, tester
**Last Updated:** 2026-07-10
**Cross-references:** `00_Foundation/04_DESIGN_DECISIONS.md`, `01_Product/01_FUNCTIONAL_REQUIREMENTS.md`, `01_Product/05_RENDERING_AND_EXTENSIONS.md`, `01_Product/11_SETTINGS.md`, `02_Architecture/04_WAILS_INTEGRATION.md`, `03_NonFunctional/03_SECURITY_AND_PRIVACY.md`, `mockups/gomarkedit-mockup.html`

# Assets & Security

How GoMarkEdit resolves local assets safely and governs remote content, keeping asset handling fully
offline (DD-21, DD-22, DD-32). Refines `01_FUNCTIONAL_REQUIREMENTS.md#fr-assets`. Served through the
guarded `internal/assets` `AssetServer.Handler`.

## Table of Contents

1. [Relative path resolution](#relative-path-resolution)
2. [Allowlist](#allowlist)
3. [Path traversal](#path-traversal)
4. [Remote content policy](#remote-content-policy)
5. [Banner](#banner)
6. [CSP](#csp)
7. [Edge cases](#edge-cases)

## Relative path resolution

Local image (and other local asset) paths in a document resolve **relative to the current document's
folder**, matching GitHub/GitLab semantics (DD-21). For example, `![diagram](./assets/flow.png)` in
`~/Notes/projects/project-notes.md` resolves to `~/Notes/projects/assets/flow.png` (see the mockup's
`./assets/flow.png — resolved relative to this file`). Absolute local paths are resolved as-is but are
still subject to the allowlist. A referenced file that does not exist renders as alt text / placeholder
(EC-ASSET-2, EC-RENDER-7). An asset referenced from an **unsaved buffer** has no document folder, so
only the workspace root and configured roots apply (EC-ASSET-6).

## Allowlist

The asset handler serves a local file only if its resolved, canonical path lies within the
**allowlist**: the **current document's folder**, the **workspace root** (if a folder is open), and any
**user-configured roots** (DD-21). Anything outside is refused. The allowlist is computed from
canonicalised (symlink-resolved) paths so that resolution cannot be tricked into escaping it.

## Path traversal

Paths that attempt to escape the allowlist via traversal (`../../etc/passwd`, absolute paths outside
the roots, symlinks pointing out) are **rejected** before any file read (EC-ASSET-1, EC-ASSET-5). The
handler canonicalises the requested path and verifies it is a descendant of an allowlisted root;
otherwise it returns a not-served response and the preview shows a placeholder. This guard is a
security invariant, not a convenience, and must have its own tests.

## Remote content policy

Remote content referenced by documents (remote `<img>`/CSS/URLs) is governed by a **policy setting**
with three values (DD-22): **Ask** (default), **Always allow**, **Always block**. **GoMarkEdit never
fetches these remote assets on its own** (DD-32); this policy governs only document-referenced remote
assets, which the webview loads solely when the policy permits — it is unrelated to the Stage-3
assistant's separate, user-invoked LLM traffic (DD-32 as revised):

- **Ask** — remote content is blocked and the external-content banner is shown; the user chooses.
- **Always allow** — remote content loads without prompting.
- **Always block** — remote content is never requested and no banner appears (EC-ASSET-4).

The setting lives in the Settings dialog Content & privacy group (`11_SETTINGS.md#content-privacy-group`).

## Banner

Under the **Ask** policy, when a document references external images/CSS, an in-preview **banner** is
shown (the `#banner` element in `mockups/gomarkedit-mockup.html`): "This document references
external images / CSS. Load remote content?" with actions **Load once**, **Always allow**, **Keep
blocked** (EC-ASSET-3). "Load once" loads for the current view only; "Always allow" / "Keep blocked"
update the policy setting. Until a choice is made, remote content stays blocked and the rest of the
document renders normally.

## CSP

The webview enforces a **Content-Security-Policy** consistent with the offline posture: app assets are
loaded from the embedded bundle only; scripts/styles from documents are sanitized
(`05_RENDERING_AND_EXTENSIONS.md#sanitization`); and remote resource loading is constrained to what the
remote-content policy permits. The CSP, sanitization, and allowlist together ensure a malicious
document cannot execute code or exfiltrate data. Detail of the exact directives is in
`03_NonFunctional/03_SECURITY_AND_PRIVACY.md`.

## Edge cases

- **EC-ASSET-1** — Relative traversal (`../../…`) → rejected, placeholder shown.
- **EC-ASSET-2** — Missing local file → alt/placeholder, no error spam.
- **EC-ASSET-3** — Remote content with **Ask** → banner, blocked until choice.
- **EC-ASSET-4** — Remote content with **Always block** → never requested, no banner.
- **EC-ASSET-5** — Absolute local path outside allowlist → rejected.
- **EC-ASSET-6** — Asset from unsaved buffer → only workspace root + configured roots apply.
