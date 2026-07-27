---
paths:
  - "**/*"
---

# Offline and privacy

**Authority:** `specification/00_Foundation/04_DESIGN_DECISIONS.md` (DD-22, DD-32 *(revised for the assistant)*, DD-33, DD-34, DD-54), `00_Foundation/06_IMPLEMENTATION_STAGES.md` (F6 — offline invariant is
scoped, not absolute), `01_MODULE_INVENTORY.md` (`internal/assets/`, `internal/llm/`, `logic/markdown/`,
`logic/adapter/`). This is a repo-wide invariant: it holds on every file, not only when a narrower rule is
loaded.

GoMarkEdit is **offline-first with no background network**. The app performs **no background or unsolicited
network activity whatsoever** — no update checks, no telemetry, no CDN/asset fetches — and ships all
rendering assets locally. The **only** outbound requests the app ever makes are **LLM inference calls to the
provider the user explicitly configured** (the assistant phases, DD-32 revised / DD-38+), and **only on user action**
(invoking an action or sending a chat message). The **default provider is local** (e.g. Ollama / LM Studio),
so a default install stays fully on-device. **Before the assistant, the app makes zero network calls of any
kind.** Telemetry and auto-update remain **never**. The invariant is "no *background/unsolicited* network,"
not "never open a socket" (F6).

## DO

- Bundle every rendering asset locally: KaTeX CSS/fonts (`import 'katex/dist/katex.min.css'`), Mermaid
  (dynamic `import('mermaid')`), highlight.js token styles, Monaco, and all app fonts -- imported from
  npm packages / local files, resolved by the bundler.
- Keep logs on the **local filesystem only** (rotating file via `internal/logging`), never transmitted (DD-33).
- Treat remote **document** assets (images/CSS referenced inside a user's Markdown) as the *only* thing
  that may touch the network, and only under the content policy (DD-22): **Ask** (default; in-preview
  banner) / **Always allow** / **Always block**. Route local document images through the guarded
  `internal/assets` handler (relative-to-document + allowlist, traversal rejected).

## DON'T

- No **background/unsolicited** network call from the app: no update check, no analytics/telemetry ping, no
  license/phone-home, no crash-report upload, no font/plugin/theme fetch, no `fetch`/`XMLHttpRequest`/
  `http.Get` for app assets. The single allowed exception is a **user-invoked LLM inference to the
  user-configured provider** (the assistant phases); it is never automatic, never background, and never to any other host.
  Before the assistant the app makes no network call at all.
- No CDN URL referenced at runtime (`https://cdn...`, `unpkg`, `jsdelivr`, Google Fonts `<link>`) for any
  app resource -- bundle it instead.
- No telemetry SDK, no auto-update mechanism, no code-signing/notarization assumption (v1 ships unsigned,
  DD-34). No secret/PII/URL written to a log (see `go-logging.md`).
- Don't let a remote document asset load outside the content policy, and don't bypass the asset
  allowlist.

## Authoring checklist

- [ ] No new *background/unsolicited* outbound network call; the only permitted outbound call is a
      user-invoked LLM inference to the configured provider; no runtime CDN reference.
- [ ] Any added rendering asset is bundled locally, not fetched.
- [ ] Logs stay local; no telemetry/analytics/auto-update introduced.
- [ ] Remote document assets stay gated by the content policy; local assets go through the allowlisted handler.
