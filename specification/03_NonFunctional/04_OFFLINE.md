**Status:** Accepted
**Owner:** architect
**Audience:** architect, coder, tester
**Last Updated:** 2026-07-10
**Cross-references:** `00_Foundation/04_DESIGN_DECISIONS.md`, `02_Architecture/03_FRONTEND_REACT.md`, `02_Architecture/04_WAILS_INTEGRATION.md`, `03_NonFunctional/03_SECURITY_AND_PRIVACY.md`

# Offline

"Fully offline" is a first-class, non-negotiable requirement (DD-32). This document states it in full
and defines how it is verified.

## Table of Contents

1. The requirement
2. Bundled assets
3. No CDN at runtime
4. Document-referenced remote assets
5. Verification approach
6. Network policy revision (the LLM assistant)

## 1. The requirement

GoMarkEdit must be **completely functional with no network of any kind** and must **originate zero
background/unsolicited network requests**. Every core feature — editing, rendering (tables, math, code
highlighting, Mermaid), format, lint, PDF export, theming, associations — works air-gapped. This is
both a usability promise (works anywhere) and a privacy/security guarantee (nothing can leak because
nothing is sent unless the user explicitly asks for it) (DD-32, DD-33). Before the assistant exists, originate **zero**
network requests of any kind; the single, scoped, user-invoked exception is the assistant LLM inference
call, defined in §6.

## 2. Bundled assets

All rendering and UI assets are compiled into the binary via `//go:embed all:frontend/dist`
(`02_Architecture/04_WAILS_INTEGRATION.md` `#embed`). The bundle includes, at minimum:

- **KaTeX** stylesheet and **font files** (math rendering).
- **Mermaid** library (diagram rendering) — loaded from the bundle, not a CDN.
- **highlight.js themes** for code highlighting.
- **UI fonts** used by the three themes (no Google Fonts / web-font fetch).
- **Monaco editor** assets and workers.

Nothing in this list is fetched at runtime; the `all:` embed prefix ensures nested/dot files ship too.

## 3. No CDN at runtime

No asset is referenced by an http/https URL that the app would resolve at runtime. There is no
`<link>`/`<script>`/`@import`/`@font-face` pointing at a remote origin in the shipped UI. The
rendering pipeline resolves imports to bundled packages (e.g.
`import 'katex/dist/katex.min.css'`) rather than CDN links. A build/lint check flags any remote URL in
shipped assets.

## 4. Document-referenced remote assets

The single exception is content the **user's own document** references (a remote image/CSS URL). Even
then the app originates nothing on its own initiative: such assets load only under the explicit
remote-content policy (Ask / Always allow / Always block, default Ask) and never affect app chrome
(DD-22; `03_NonFunctional/03_SECURITY_AND_PRIVACY.md` `#3-remote-content-policy`). With the default or
"Always block" policy, an air-gapped machine renders the document with placeholders and issues no
request.

## 5. Verification approach

Offline is verified, not assumed. **Two of the three checks below are cheap and deterministic, so they
are CI gates rather than rituals** (`04_Build_and_Release/03_CI_AND_HOOKS.md` §4). The third is
genuinely manual and belongs in the release-candidate checklist.

**Gates, run on every build:**

- **No remote URL in the build output** — no file under `frontend/dist` contains `jsdelivr`, `unpkg`,
  `cdn.` or `googleapis`. It fails the moment somebody adds a CDN font or a Mermaid fallback, and it is
  the single best guard on DD-32. A reviewed reference application ships a `cdn.jsdelivr.net` Monaco
  loader in its production bundle and its own offline service worker never caches it, so this is a
  demonstrated failure mode rather than a hypothetical one.
- **Every bundled asset is actually present** — KaTeX fonts, the generated highlight stylesheet, the UI
  fonts, the Monaco worker chunk. A build that silently externalises one of them still works on the
  developer's machine and breaks air-gapped.
- **The Monaco presence check runs with the network aborted.** The same Playwright assertion that
  guards against a collapsed editor becomes an offline regression test when the network is disabled for
  that run.

**Manual, per release:**

- **Network-egress check** — during a representative session (open, edit, render a document containing a
  table + KaTeX formula + fenced code + Mermaid diagram, format, lint, export to PDF, switch themes),
  the process must open **no outbound network connections**. This is run manually per release and, where
  practical, wired into CI as a socket-egress guard for offline-touching stories.
- **Air-gapped smoke** — the cross-OS release smoke test is run with networking disabled to confirm full
  functionality, satisfying the vision success criterion of "zero outbound network connections."

## 6. Network policy revision (the LLM assistant)

The assistant phases revise the offline policy from *absolute* to *scoped* (DD-32 as revised;
ADR-0011). The revision is deliberately narrow and does not weaken §§1–5 for any earlier phase:

- **Zero background network in every stage.** No stage ever performs an update check, telemetry ping,
  license call, crash upload, or CDN/asset fetch. All app and rendering assets remain bundled (§§2–3).
- **The only outbound calls are user-invoked LLM inferences.** The single class of network request the
  app ever originates is an LLM inference call, and only to the provider the user **explicitly
  configured**, and only **on user action** (invoking an action or sending a chat message). There is no
  background, on-open, on-save, or timed inference. Before the assistant exists the app makes **no** such calls — the provider
  client does not exist until the assistant phases.
- **Default provider is local.** The default configuration targets a **local** provider (e.g.
  Ollama / LM Studio), so a default install stays fully on-device and originates nothing over the network.
  Remote providers (e.g. OpenAI, Azure) are strictly opt-in and require the user to enter their own
  endpoint and env-var-named credential (DD-45; `03_NonFunctional/03_SECURITY_AND_PRIVACY.md` §§8–9).
- **Verification.** A network-egress trace during a representative assistant session must show outbound
  requests **only** to the configured provider endpoint and **only** immediately following a user action;
  no request appears at idle, on open, or on save. With a local provider configured (or none), the trace
  shows **no** off-machine connections at all — the same air-gapped result as §5. This is part of the
  the assistant phases' exit checks (`07_Phases/PHASE_11_AI_PROVIDER.md`, `PHASE_13_CONVERSATION.md`).
