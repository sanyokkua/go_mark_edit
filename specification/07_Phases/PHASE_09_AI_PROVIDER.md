# Phase 09 — I can point the app at an AI provider

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
   Context group for the token settings below. They slot into the Phase 02 Settings shell.
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

**Blocking — the network policy currently forbids this phase.** ADR-0011 says the only permitted
outbound calls are user-invoked LLM *inferences*. "Test connection" and "list models" are neither.
Amend the ADR to cover user-invoked calls to the configured provider endpoint, of which inference is
one kind, before writing any code. Do not just do it and hope nobody notices the contradiction.

Also settle:

- **Do custom provider headers hold the secret, or the name of an environment variable?** Env-var name
  only — DD-45 already forbids persisting secrets, and this decides the database schema, so settle it
  before the migration is written. Define one case-insensitive redaction rule for logs, drafts,
  diagnostics, events and errors while you are there.
- **Can you save a provider that has not been verified?** The sources both require verification before
  save and permit saving an unverifiable manually-entered model. Recommendation: saving is always
  allowed and verification is advisory — a warning badge, not a gate.
- **The per-run time limit.** A configurable wall-clock ceiling is required with no default, unit or
  range given. Recommendation: 120 seconds, adjustable between 10 and 600.

## Done when

Install Ollama locally, configure it in Settings, list its models, pick one, and run all three tests
successfully. Configure a cloud provider with its key in an environment variable and verify the key
value appears nowhere in the settings database, the logs, or any error message. Watch the token meter
change as you select more text. Then close the app, watch the network, and see nothing at all.
