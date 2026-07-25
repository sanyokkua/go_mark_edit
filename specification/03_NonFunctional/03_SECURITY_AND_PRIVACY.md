**Status:** Accepted
**Owner:** architect
**Audience:** architect, coder, tester
**Last Updated:** 2026-07-10
**Cross-references:** `00_Foundation/04_DESIGN_DECISIONS.md`, `02_Architecture/04_WAILS_INTEGRATION.md`, `02_Architecture/06_ERROR_HANDLING.md`, `01_Product/09_ASSETS_AND_SECURITY.md`, `03_NonFunctional/04_OFFLINE.md`

# Security and Privacy

GoMarkEdit's trust boundary is the local machine. It makes no background or unsolicited network calls,
stores no secrets, and emits no telemetry; the only outbound requests it ever originates are the scoped,
user-invoked assistant LLM inferences defined in §§1 and 9. The only untrusted input is document content
(and, in Stage 3, model output), which is handled defensively.

## Table of Contents

1. Offline invariant
2. Asset allowlist and traversal
3. Remote-content policy
4. Webview CSP
5. No telemetry
6. Local logs only
7. Parameterized queries
8. No secrets
9. LLM data flow and privacy

## 1. Offline invariant

The application makes **no background or unsolicited network calls of any kind** (DD-32). There is no
update check, no license check, no font/CDN fetch, and no crash upload. All rendering assets are bundled
and embedded (`03_NonFunctional/04_OFFLINE.md`). Before the assistant exists this is absolute: **zero** network calls.
The single scoped exception is Stage 3, where the **only** outbound requests the app ever originates are
**LLM inference calls to the provider the user explicitly configured**, and only **on user action**
(invoking an action or sending a chat message); the default provider is local, so a default install still
originates nothing (see §9). Otherwise the only bytes that move off the machine are those the OS moves
when the user themselves acts (e.g. saving to a network drive). This invariant is a whole-app property,
verified by a network-egress check (§`04_OFFLINE.md`).

## 2. Asset allowlist and traversal

Local images referenced by a document are served through the guarded `AssetServer.Handler`, never by
direct file:// access (DD-21; `02_Architecture/04_WAILS_INTEGRATION.md` `#assetserver-handler`). The
handler enforces a directory **allowlist** = the document's folder + the workspace root + any
user-configured roots, and **rejects path traversal**:

- Request paths are cleaned and resolved to a real absolute path.
- A resolved path that escapes every allowlisted root (via `..`, an absolute path, or a symlink) → 403.
- A path on an allowlisted root that does not exist → 404.
- The handler serves only from disk; it never proxies an http/https URL.

The pure allowlist/traversal logic is unit-tested independent of the webview.

## 3. Remote-content policy

Remote content **inside a document** (http/https images or CSS) is governed by a user policy setting
(DD-22): **Ask** (default — an in-preview banner offers allow/block for this document),
**Always allow**, or **Always block**. This is the only mechanism by which document-referenced remote
bytes may load, and it is per the user's explicit choice; the app still originates no requests of its
own. Blocked remote assets render as a placeholder with the banner affordance
(`01_Product/09_ASSETS_AND_SECURITY.md` `#banner`).

## 4. Webview CSP

The rendered preview treats document content as untrusted. A restrictive Content-Security-Policy scopes
what the webview may load: local app assets and allowlisted local files by default; remote origins only
when the content policy permits (§3). Script execution from document content is not permitted — the
Markdown renderer produces sanitized output (sanitization rules in
`01_Product/05_RENDERING_AND_EXTENSIONS.md` `#sanitization`), so a malicious document cannot run code or
exfiltrate data.

## 5. No telemetry

There is **no telemetry, analytics, usage reporting, or auto-update** in v1 (DD-33, DD-34). No build
phones home. This is a hard constraint enforced at review: any code path that would open a socket for a
non-user-initiated purpose is a defect.

## 6. Local logs only

Diagnostic logs are written to a **local rotating file** (lumberjack) and **never transmitted**
(DD-33). The error `cause` chain is logged locally at the handler boundary but is **stripped from the
`WireError`** that reaches the UI, so implementation detail and absolute internal paths never appear in
a toast or any shareable surface (`02_Architecture/06_ERROR_HANDLING.md` `#wire`). Logs contain no PII
or secrets.

## 7. Parameterized queries

All SQLite access is through **sqlc-generated, parameterized** queries (`internal/db/store/`, never
hand-edited). There is no string-concatenated SQL on any user-influenced path, so SQL injection is not
possible. The one place table names appear as literals (the factory-reset wipe) uses a hardcoded,
non-user-supplied list.

## 8. No secrets

GoMarkEdit has no accounts and stores no secret values. Before the assistant exists there are no credential concept at all.
the assistant phases may talk to a remote LLM provider that requires an API key, but the **key value is never stored**:
a provider config references only the **name of an environment variable** (DD-45); the value is read from
the process environment at request time and is never written to code, config, the database, the run
transcript, or any log (§9). The local default provider needs no credential at all. So no secret value
lives anywhere in the app's persisted state on any path.

## 9. LLM data flow and privacy

The assistant assistant (`02_Architecture/08_LLM_INTEGRATION.md`; DD-38–DD-55) is the only feature that can
send document content off the machine, and it does so under strict, explicit constraints (DD-54):

- **User-action only, configured-provider only.** Document text (whole document or the current selection)
  leaves the machine **only** when the user invokes an action or sends a chat message, and **only** to the
  provider the user has explicitly configured. The app never sends content in the background, on open, on
  save, or on any timer. The **default provider is local** (e.g. Ollama / LM Studio), so a default install
  keeps every byte on-device; remote providers are strictly opt-in.
- **API keys by env-var name, never stored or logged.** Provider credentials are referenced by the
  **name** of an environment variable; the secret value is resolved from `os.Getenv` at call time and is
  never persisted to the `providers` table, never emitted to a log, and never placed in the transcript or
  a `WireError` (DD-45; §8). A configured-but-unresolved env var yields a `missing_credential` error
  rather than an unauthenticated request.
- **Least-privilege tools with a workspace allowlist.** The agent's tools are read-mostly and scoped: the
  current document/selection always, and — only when a folder workspace is open — listing and reading of
  other Markdown/text files under the **workspace root**, reusing the §2 asset **allowlist** with
  **path-traversal rejection**. There are no arbitrary filesystem, shell, or network tools, and the model
  **never writes files** — edits are proposals the user reviews and applies (DD-41, DD-42).
- **Model output is untrusted input.** Tool-call arguments produced by the model are validated against
  each tool's JSON schema before execution and treated as untrusted data, never as trusted instructions;
  a request to read outside the allowlist is rejected, not honored.
- **Local provider keeps data on-device.** With the default local provider, inference happens on the
  user's machine and no document content crosses the network boundary at all (DD-54).

Telemetry and auto-update remain **never** (DD-33, DD-34): the assistant adds no analytics and no
phone-home. The only socket the app ever opens is the user-invoked inference call to the configured
provider (§1, `04_OFFLINE.md` §6).
