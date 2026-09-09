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
3. **Filter the model list.** A provider like OpenRouter reports several hundred models, and the free
   ones are scattered through a flat list by a `:free` suffix. Every surface that lists models gets a
   filter box with an `N of M shown` header and a clear control; matching is case-insensitive and
   **anywhere in the id**, not a prefix, which is what makes `:free` work. The filter **persists per
   provider**, and it never changes the selection — a filter that silently deselects loses the
   configuration. One component, used by both the Settings picker and the assistant's model chip.
   `../spec/product/connecting-an-ai-provider.md#every-model-picker-filters`.
4. **Prove it works.** Four buttons: test the connection, test that models can be listed, test that
   an actual inference returns, and test that the model can make a **tool call** — which is what tells
   you whether it can drive the assistant at all. Real calls, on your click, against the currently
   selected model, showing what came back or what failed.
5. **Secrets by reference only.** An API key is configured as the _name of an environment variable_,
   never the value. The value is read at call time and never persisted, never logged, never included
   in an error or an event.
6. **The settings screens.** An AI / Providers group to configure providers and models, and an AI
   Context group for the token settings below. They slot into the Phase 03 Settings shell.
7. **Count tokens without asking anyone.** An offline estimator, the model's context window, a reply
   reserve and a safety margin, and a meter that tells you whether what you are about to send fits.
   No network call to count tokens.

## Where the details are

- Behaviour: `../spec/product/connecting-an-ai-provider.md`, `../spec/product/how-much-fits-in-context.md`
- Architecture: `../spec/product/chatting-about-a-document.md`
- What it looks like: `../spec/surface/mockup.html` → `settings-ai-providers`, `settings-ai-context`
- Decisions: one OpenAI-compatible client parameterised by a per-kind profile
  (`../adr/0007-llm-provider-abstraction.md`); outbound calls only to the configured provider and only
  on a user action (`../adr/0011-network-policy-llm-exception.md`);
  an API key is an environment-variable name, never a value; one inference at a time through the gate
  that already exists

## Questions to settle first

**Nothing blocking — the four former questions were settled on 2026-07-25.**

- **The network policy no longer forbids this phase.** ADR-0011 said the only permitted outbound call
  was an LLM _inference_, which made Test connection and model discovery contradictions. It now names
  the category — a **user-invoked request to the configured provider** — of which inference is one kind.
  Same host, same trigger, same count of permitted destinations.
- **Custom headers hold no secret**, and one case-insensitive redaction rule covers logs, drafts,
  diagnostics, events, errors and any future export
  (`../spec/product/connecting-an-ai-provider.md#provider-config-fields`).
- **A provider can be saved without being verified.** Verification is advisory — a badge, not a gate.
- **The per-run wall-clock ceiling is 120 seconds**, adjustable between 10 and 600
  (`../spec/product/connecting-an-ai-provider.md#retry-policy`). It **pre-empts retries and iterations**;
  without that, the three bounds multiply to roughly half an hour per click.

One thing genuinely remains open, and it should be answered by running the app rather than by reasoning:

- **Which model fills each size-class role in the live plan.** `testing/live-plan.md`
  names small / mid / large rather than specific models, because local catalogues rotate. Record what
  you actually pulled in the first report.

## Done when

Install Ollama locally, configure it in Settings, list its models, pick one, and run **all four**
tests successfully — including Test tools, which tells you whether that model can drive the assistant at
all. Configure a cloud provider with its key in an environment variable and verify the key value appears
nowhere in the settings database, the logs, or any error message. Watch the token meter change as you
select more text.

Then point the app at a provider that serves **hundreds** of models — OpenRouter will do. Read the
header and confirm it names the true total. Type `:free` into the filter, watch the list collapse, and
confirm the header now reads `N of M shown` with the same M. Select one of the free models and run all
four tests against it — that is the whole point of the filter, and it must cost nothing. Clear the
filter and confirm the full list is back **and the model you selected is still selected**. Type
something that matches nothing and read `No model matches "<query>"` rather than looking at an empty
box. Close Settings, reopen it, and find `:free` still applied. Configure a second provider and confirm
its filter is its own. Then open the assistant's model chip and confirm it is the same filtered list,
not a second unfiltered one.

Then point the provider at `testing/tools/fault_proxy.py` and step through its modes. Each one must
produce a **different, actionable** message — a rejected credential must not read the same as a rate
limit or a mistyped model name — and `empty_completion` must reach the provider **once**, not four
times.

The assistant sidebar is **still absent at the end of this phase**, even though a provider is now
configured: nothing uses the model yet, and Phase 12 builds the sidebar. The `✦` toggle does not appear.

Then close the app, watch the network, and see nothing at all.

And the constraints every phase carries: confirm that with a provider configured and untouched, the
network stays silent for five minutes — every request must follow a button you pressed; confirm the
settings database contains no API key anywhere; confirm each of the four test buttons produces its own
distinct message rather than one generic failure; the whole provider tab is reachable by keyboard alone
with a visible focus ring and works in three themes across light and dark; every new string goes
through `t()`. All of it in a real build.
