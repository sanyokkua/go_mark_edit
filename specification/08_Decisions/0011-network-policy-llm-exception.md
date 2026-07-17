# ADR-0011 — Network policy: offline-first with no background network; the only outbound calls are user-invoked provider inferences

**Status:** accepted
**Date:** 2026-07-10
**Deciders:** project owner, architect

## Context and problem statement

Through Stages 1–2, GoMarkEdit's network policy was stated absolutely: the app makes **zero** network
calls of any kind — no update checks, no telemetry, no CDN/asset fetches; every rendering asset is bundled
locally. This absolute framing was correct for a Viewer/Editor with no remote features, and it is a core
part of the product's privacy promise.

Stage 3 introduces the LLM assistant, whose entire purpose is to send the user's document text to a model
and get a rewrite back — which, for a remote provider, is a network call. The original "never open a
socket" invariant, read literally, forbids the assistant to exist. We must decide how to reconcile the
assistant with the offline promise **without** weakening the promise into "the app talks to the network
whenever it likes." The revision must be precise about *what* traffic is allowed, *when*, *to whom*, and
what remains categorically forbidden. This ADR revises DD-32 and records the resulting network posture;
it locks the revised DD-32 and DD-54.

## Decision drivers

- **Keep the privacy promise meaningful.** Users chose GoMarkEdit partly because it doesn't phone home;
  the assistant must not become a backdoor for background traffic (DD-32, DD-33, DD-54).
- **The assistant is inherently a network feature for remote providers.** Its whole job is to send text to
  a model — so *some* precisely-scoped outbound traffic must be permitted (DD-38+).
- **Local-first by default.** A default install should stay fully on-device; the default provider is a
  **local** server, so no bytes leave the machine unless the user opts into a remote provider (DD-32
  revised, DD-54).
- **User intent gates every call.** Traffic may only leave on an explicit user action (invoking an action
  or sending a chat message) — never in the background, on a timer, or on launch.
- **Destination is constrained.** The only host contacted is the provider the user configured; nothing may
  fan out to any other endpoint.
- **Telemetry and auto-update stay never.** The revision opens exactly one door and no other; analytics,
  crash uploads, license phone-home, and auto-update remain categorically forbidden (DD-33, DD-34).

## Considered options

- **Offline-first, except user-invoked provider calls** — no background/unsolicited network of any kind;
  the *only* outbound requests are user-invoked LLM inferences to the user-configured provider; default
  provider is local; telemetry/auto-update remain never.
- **Fully offline (no LLM)** — keep the absolute "zero network" invariant and drop the LLM assistant
  entirely (or restrict it to a hypothetical fully-embedded local model with no socket).
- **Always-on cloud** — treat the app as a networked client: allow background calls (model prewarming,
  update checks, usage analytics) to make the assistant feel seamless.

## Decision outcome

Chosen: **revise the offline invariant to "offline-first with no background network," where the only
outbound requests the app ever makes are user-invoked LLM inferences to the user-configured provider.**
Precisely:

- **No background or unsolicited network activity whatsoever** — no update checks, no telemetry, no
  crash/usage uploads, no CDN/asset fetches, no font/plugin/theme fetch. All rendering assets remain
  bundled locally.
- **The only permitted outbound call** is an LLM inference to the provider the user explicitly configured,
  and **only on user action** (invoking an action or sending a chat message) — never automatic, never
  background, never on a timer or launch.
- **The default provider is local** (on-device, e.g. a local model server), so a **default install stays
  fully on-device** — zero bytes leave the machine until the user opts into a remote provider and supplies
  their own endpoint/credentials.
- **Stages 1–2 (Viewer, Editor) make zero network calls of any kind**; the exception exists only in
  Stage 3 and only through the provider HTTP client, which is the single outbound socket in the app.
- **Telemetry and auto-update remain never** (DD-33, DD-34); the revision opens exactly one narrowly-scoped
  door and nothing else.

The guiding formulation is: the invariant is **"no *background/unsolicited* network,"** not "never open a
socket." Document text leaves the machine only when the user invokes an action/chat and only to the
configured provider; a local provider keeps everything on-device (DD-54). The privacy settings state this
plainly so the user always knows when and where their text can go.

### Consequences

- Positive: The assistant can exist without diluting the privacy promise — the allowed traffic is exactly
  one kind, user-triggered, to one user-chosen host, and nothing else (DD-32 revised, DD-54).
- Positive: A default install is still fully offline because the default provider is local; privacy-first
  users lose nothing, and remote/cloud use is a deliberate, informed opt-in (DD-32 revised, DD-54).
- Positive: The rule is auditable and enforceable — "the provider HTTP client is the only outbound socket,
  opened only on user action" is a concrete invariant CI and code review can check; telemetry/auto-update
  stay categorically absent (DD-33, DD-34).
- Positive: Clear user-facing posture: the privacy settings explain when text leaves and to whom, so
  consent is explicit rather than assumed.
- Negative: The invariant is no longer the maximally-simple "zero network"; it now has a scoped exception
  that every contributor must understand precisely, or risk either over-blocking the assistant or
  smuggling in disallowed background calls.
- Negative: Choosing a remote provider does send document text off-device; the responsibility for that
  trust decision shifts to the user, and the UI must make the boundary unmistakable.
- Neutral: Enforcement now depends on discipline and review (the single-outbound-socket rule) rather than a
  blanket ban; the offline-and-privacy rule and F6 seam encode this scoping.

## Pros and cons of the options

### Option A — Offline-first, except user-invoked provider calls (chosen)

- Good: Enables the assistant while preserving a meaningful, auditable privacy promise; local-default keeps
  a default install fully on-device; one narrow, user-gated, single-destination exception; telemetry and
  auto-update stay never; matches a well-understood "local-first, user-consented network" posture.
- Bad: A scoped invariant is subtler than an absolute one and must be understood and enforced by everyone;
  remote-provider use does transmit document text, moving a trust decision onto the user.

### Option B — Fully offline (no LLM)

- Good: The simplest, strongest possible promise — literally zero network, nothing to explain or enforce;
  no data ever leaves the machine.
- Bad: Kills the Stage-3 assistant, the whole point of the stage; a bundled-only local model would bloat
  the app enormously and still couldn't reach the user's existing local/remote endpoints. Rejected as
  incompatible with the product roadmap.

### Option C — Always-on cloud

- Good: A networked client can prewarm models, check for updates, and stream smoothly; potentially the
  slickest assistant UX.
- Bad: **Directly contradicts the product's privacy identity** — background traffic, telemetry, and
  auto-update are exactly what GoMarkEdit promises never to do (DD-32, DD-33, DD-34); erodes user trust and
  the offline-first value proposition. Rejected outright.

## Links

- Design decisions: **DD-32 (revised for Stage 3)** (offline-first, no background network; only outbound
  calls are user-invoked LLM inferences to the user-configured provider; default provider local;
  Stages 1–2 zero-network), **DD-54** (privacy explicit: document text leaves only on user action, only to
  the configured provider; telemetry/auto-update remain never; a local provider keeps everything
  on-device). Related: DD-22 (remote document-asset content policy), DD-33 (no telemetry; local logs only),
  DD-34 (no auto-update).
- Spec clauses: `00_Foundation/04_DESIGN_DECISIONS.md#10-non-functional--operations`,
  `00_Foundation/04_DESIGN_DECISIONS.md#11-llm-assistant-stage-3`,
  `02_Architecture/08_LLM_INTEGRATION.md#forward-compat-seams` (F6 — offline scoping),
  `03_NonFunctional/04_OFFLINE.md`, `03_NonFunctional/03_SECURITY_AND_PRIVACY.md`,
  `.claude/rules/offline-and-privacy.md`.
- Stories: Phase 11 (LLM foundation — the first stage that opens the provider socket) and the Stage-1/2
  offline-invariant stories (Phases 00–10) that must remain zero-network, per `07_Phases/00_ROADMAP.md`
  (authored per phase; none `done` at ADR time).
