# Glossary

Only terms that are genuinely ambiguous — words this project uses in a narrower sense than they are
normally used, where guessing the wrong sense produces the wrong code.

Process vocabulary is not here. Words like *phase*, *story* and *decision record* mean what they look
like, and are described where they are used.

---

**Workspace** — the one folder currently open in the sidebar, and its filtered tree. It is not a
project, not a set of settings, and not a saved session. There is exactly one per window, or none. It
matters because two things are scoped to it and to nothing else: which local files may be served to the
preview, and which files the assistant's read tools can see.

**Document** versus **buffer** — a **document** is the thing with an identity, a path, a modified flag
and a place in the tab set; it lives in Go memory and survives a tab switch. A **buffer** is the
editable text of the *visible* document, held in the editor widget in the webview. There is one buffer
at a time; there may be forty documents. The buffer is a working copy pushed to the document on a
debounce. When a rule says "the canonical content" it means the document's, never the buffer's.

**Scope** — what an assistant action runs against: the whole document, or the current selection. It is
resolved once when a run starts and does not change during the run. It is unrelated to a shortcut's
*scope*, which is a different word for a different thing.

**Scope**, for a keyboard shortcut — when the binding fires: **global** whenever the window has focus,
**editor** only when the editor is focused, **document** whenever a document is open. Named the same as
the assistant's scope by accident of English; they never appear in the same sentence.

**The gate** — one process-wide guard that permits a single long operation at a time. Exporting,
formatting a whole folder and running an inference all acquire the same one. There is not a gate per
feature. A second attempt while it is held is refused immediately with a busy error; it does not queue.

**Standard level** — how much Markdown syntax the renderer understands: Minimal, GFM or Full. It
governs what is **displayed** and never what is parsed for a round trip — Format and Lint always parse
with every plugin, whatever the level says. Confusing the two destroys front matter.

**Appearance** versus **theme** — the **theme** is one of Liquid Glass, Material or Minimal. The
**appearance** is Auto, Light or Dark. They are independent, so there are nine combinations and six
palettes. "Dark theme" is not a thing this product has.

**Choice** versus **resolved**, for appearance — the **choice** is what the user picked, one of `auto`,
`light` or `dark`. The **resolved** value is what it currently means, `light` or `dark`. Both are
stored. Collapsing them destroys the Auto state on first run.

**Proposal** — an edit the assistant returns for review, rendered as a diff. It is not applied. Nothing
in the product lets a model change a document without a person pressing Apply, and nothing writes to
disk except save and autosave.

**Projection** — the Redux store's copy of the application model. It is derived, disposable, and never
a source of truth. It is hydrated once and thereafter only reflects what the Go backend says changed.

**Reply reserve** versus **max output tokens** — the **reply reserve** is what the fit meter subtracts
from the context window before deciding whether the input fits. **Max output tokens** is the field sent
to the provider that caps generation. They are related and are not the same number:
`replyReserve ≤ maxOutputTokens < contextWindow`.

**Normative** versus **descriptive** — everything under `spec/` and `architecture/` is **normative**: it
says what must be true, and no implementation edits it to agree with what was built. Everything else,
including all documentation outside `docs/delivery/`, is **descriptive**: it says what is true, and is
updated freely when a change makes it stale.
