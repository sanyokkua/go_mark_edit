# Phase 11 — I can point the app at an AI provider

## What you get

Tell the app where your model lives — Ollama on your own machine by default, or LM Studio, llama.cpp,
OpenAI, Azure, or anything OpenAI-compatible. Pick a model from a list it fetched. Press a button to
check the connection actually works before you rely on it.

Nothing uses the model yet. This phase is the plumbing and the settings screen.

## What changes about the product

This is where GoMarkEdit stops being an application that never touches the network. From here on there
is exactly one kind of outbound request: one you explicitly triggered, to the provider you configured.
No background calls, no telemetry, no update checks — those stay never. The default provider is local,
so a default install still never leaves the machine.

## Build it in this order

1. **One client, many providers.** A single OpenAI-compatible HTTP client parameterised by a profile
   per provider kind, rather than a class per vendor. Timeouts, retries and error classification live
   here once.
2. **Find the models.** Ask the provider what models it has and offer them in a list, with manual
   entry for providers that cannot be asked.
3. **Prove it works.** Three buttons: test the connection, test that models can be listed, test that
   an actual inference returns. Real calls, on your click, showing what came back or what failed.
4. **Secrets by reference only.** An API key is configured as the *name of an environment variable*,
   never the value. The value is read at call time and never persisted, never logged, never included
   in an error or an event.
5. **The settings screens.** An AI / Providers group to configure providers and models, and an AI
   Context group for the token settings below. They slot into the Phase 03 Settings shell.
6. **Count tokens without asking anyone.** An offline estimator, the model's context window, a reply
   reserve and a safety margin, and a meter that tells you whether what you are about to send fits.
   No network call to count tokens.

## Where the details are

- Behaviour: `01_Product/17_PROVIDERS_MODELS_SETTINGS.md`, `01_Product/18_TOKENIZER_AND_CONTEXT.md`
- Architecture: `02_Architecture/08_LLM_INTEGRATION.md`
- What it looks like: `mockups/gomarkedit-mockup.html` → `settings-ai-providers`, `settings-ai-context`
- Decisions: DD-38…DD-55, ADR-0007 (provider abstraction), ADR-0008, ADR-0011 (network policy),
  DD-45 (secrets are env-var names), DD-47 (the single-flight gate, already built)

## Questions to settle first

**Nothing blocking — the four former questions were settled on 2026-07-25.**

- **The network policy no longer forbids this phase.** ADR-0011 said the only permitted outbound call
  was an LLM *inference*, which made Test connection and model discovery contradictions. It now names
  the category — a **user-invoked request to the configured provider** — of which inference is one kind.
  Same host, same trigger, same count of permitted destinations.
- **Custom headers hold no secret**, and one case-insensitive redaction rule covers logs, drafts,
  diagnostics, events, errors and any future export
  (`01_Product/17_PROVIDERS_MODELS_SETTINGS.md#custom-headers-and-redaction`).
- **A provider can be saved without being verified.** Verification is advisory — a badge, not a gate.
- **The per-run wall-clock ceiling is 120 seconds**, adjustable between 10 and 600
  (`17_PROVIDERS_MODELS_SETTINGS.md#ranges-and-defaults`). It **pre-empts retries and iterations**;
  without that, the three bounds multiply to roughly half an hour per click.

One thing genuinely remains open, and it should be answered by running the app rather than by reasoning:

- **Which model fills each size-class role in the live plan.** `docs/testing/LIVE_TESTING_PLAN.md`
  names small / mid / large rather than specific models, because local catalogues rotate. Record what
  you actually pulled in the first report.

## Done when

Install Ollama locally, configure it in Settings, list its models, pick one, and run **all four**
tests successfully — including Test tools, which tells you whether that model can drive the assistant at
all. Configure a cloud provider with its key in an environment variable and verify the key value appears
nowhere in the settings database, the logs, or any error message. Watch the token meter change as you
select more text.

Then point the provider at `docs/testing/tools/fault_proxy.py` and step through its modes. Each one must
produce a **different, actionable** message — a rejected credential must not read the same as a rate
limit or a mistyped model name — and `empty_completion` must reach the provider **once**, not four
times.

The assistant sidebar is **still absent at the end of this phase**, even though a provider is now
configured: nothing uses the model yet, and Phase 12 builds the sidebar. The `✦` toggle does not appear.

Then close the app, watch the network, and see nothing at all.
