# Images and remote content

## What it's for

A document's images are local files sitting beside it, and rendering them means letting the webview
read files off the user's disk. That is the most dangerous thing this application does, so the rules are
about what it will refuse. Separately, a document can reference an image or a stylesheet on the
internet — and the app's whole promise is that nothing leaves the machine, so a document cannot be
allowed to break that promise on the user's behalf without being asked.

## What you can do

Write `![diagram](./assets/flow.png)` and see the image, resolved relative to the document exactly as
GitHub and GitLab do it.

If a document references something on the internet, a banner appears in the preview: **This document
references external images / CSS. Load remote content?** with **Load once**, **Always allow** and
**Keep blocked**. The default is to ask. You can change that in Settings → Content and privacy to always
allow or always block.

## Rules

### Local paths resolve relative to the document {#relative-to-the-document}
- A local asset path resolves against the folder containing the **current document**.
- An absolute local path is used as written, and is still subject to the allowlist.

Examples: `![](./assets/flow.png)` in `~/Notes/projects/notes.md` → `~/Notes/projects/assets/flow.png` ·
the same document moved with its `assets/` folder → still works, which is why relative resolution is the
right default · resolving against the workspace root instead → the link breaks for every document not at
the root.

### An unsaved document has no folder, so only the workspace root applies {#unsaved-documents-have-no-folder}
- **While** a document has never been saved, it has no containing folder, so the only allowlisted root
  is the open workspace's root, if there is one.

Examples: a new document with `Notes/` open, `![](images/a.png)` → resolved under `Notes/` · the same
with no folder open → nothing is served, and the alt text is shown.

### A file is served only from inside the allowlist {#the-allowlist}
- The allowlist is: the **current document's folder**, and the **workspace root** when a folder is open.
- The requested path is canonicalised — symlinks resolved — and checked to be a descendant of an
  allowlisted root **before any file is read**.
- **If** it is not, **then** it is refused and the preview shows the placeholder.

Examples: `../images/logo.png` from `docs/guide.md` with the repository root open → served, because the
root is allowlisted · the same link with only `docs/` open → refused · `/etc/passwd` → refused ·
checking the path before canonicalising → a symlink inside the folder pointing outside it passes the
check and then reads the target.

*This is a security invariant, not a convenience.* It has its own tests, and they are not the same tests
as the rendering ones.

### Traversal is rejected before any read {#traversal-is-rejected}
- Paths that attempt to escape the allowlist — `../../etc/passwd`, an absolute path outside the roots, a
  symlink pointing out — are rejected without opening the file.

Examples: `![](../../../../etc/passwd)` → refused, placeholder shown, nothing read · reading the file
and then deciding → the read already happened, and on some paths that is the whole exploit.

### A missing local file shows its alt text {#missing-images-show-alt-text}
- **If** a referenced local file does not exist, **then** the image's alt text is shown as a placeholder
  and no error is raised.

Examples: a document with twelve broken image links → twelve placeholders and no toasts · one toast per
broken image → a wall of notifications for one mistyped folder name.

### The remote-content policy has three values and defaults to Ask {#remote-content-policy}
- **Ask** — remote content is blocked and the banner is shown. This is the default.
- **Always allow** — remote content loads without prompting.
- **Always block** — remote content is never requested, and no banner appears.

Examples: a document with one remote image, policy Ask → the banner, the rest of the document renders ·
policy Always block → the image is absent, no banner, nothing requested · policy Always allow → it
loads.

### The app never fetches remote content on its own {#app-never-fetches}
- This policy governs **document-referenced** remote assets only. The app itself makes no network
  request of any kind for its own purposes.
- The only other outbound traffic that ever exists is the assistant's user-invoked calls to a configured
  provider, and it is unrelated to this setting.

Examples: opening a document with no remote references and policy Always allow → nothing is requested ·
an update check → not present anywhere in the app; see `../constraints.md#nothing-leaves-the-device`.

### The banner's exact text and actions {#the-banner}
- **While** the policy is Ask and the open document references remote images or stylesheets, an in-preview
  banner reads: `This document references external images / CSS. Load remote content?`
- Its actions are **Load once**, **Always allow** and **Keep blocked**.
- **Load once** loads for the current view only and does not change the setting.
- **Always allow** and **Keep blocked** change the setting.
- **Until** a choice is made, remote content stays blocked and the rest of the document renders normally.

Examples: Load once, then switch tabs and back → the banner again, because nothing was persisted ·
blocking the whole document until the user chooses → one remote image makes the document unreadable.

### A policy change is stored before anything is requested {#policy-persists-before-loading}
- **If** persisting a policy change fails, **then** the previously acknowledged policy stays in force and
  the failure is reported.
- Nothing is loaded speculatively on the assumption that a policy change will save.

Examples: the database is unwritable and the user picks Always allow → the failure is reported and
nothing is fetched · fetching first → the user's content went out under a policy the app did not manage
to record.

### A fixed content security policy backs all of this {#csp}
- The webview enforces a content security policy: app assets come from the embedded bundle only,
  document scripts and styles are sanitised, and remote loading is constrained to what the policy
  permits.
- The policy, the sanitiser and the allowlist are three layers, and no one of them is relied on alone.

Examples: a document that defeats the sanitiser → the content security policy still blocks the outbound
request it wanted to make.

## What it looks like

- The remote-content banner — `../surface/mockup.html#material-light/banner`
- Settings → Content and privacy — `../surface/mockup.html#material-light/settings-privacy`
- A document with a resolved local image — `../surface/mockup.html#material-light/editor-split`

## When things go wrong

| Situation | What the user sees | What they can do |
|---|---|---|
| A local image path is outside the allowlist | The image's alt text as a placeholder | Move the image beside the document, or open the folder that contains it |
| A local image does not exist | The alt text as a placeholder | Fix the path |
| A remote image is blocked by policy | Nothing where the image would be, and the banner if the policy is Ask | Load once, or change the policy |
| A remote image is allowed and fails to load | The alt text as a placeholder | Check the network, or the URL |
| A policy change cannot be saved | The failure is reported; the old policy stays in force | Retry, and check the configuration folder |

## Edge cases

**A symlink inside the document's folder points outside it**
- *Trigger:* `assets/logo.png` is a symlink to `/etc/shadow`.
- *Expected:* the path is canonicalised first, found to be outside the allowlist, and refused.
- *Avoid:* checking the literal path, which is inside the folder, and then following the link.

**A document is saved for the first time while an image is displayed**
- *Trigger:* an untitled document with `![](images/a.png)` is saved into a new folder.
- *Expected:* the allowlist gains the new document folder and the image resolves from there.
- *Avoid:* keeping the old allowlist, so the image stays broken until the tab is reopened.

**The remote policy is Ask and the document has fifty remote images**
- *Trigger:* a document that references many remote assets.
- *Expected:* one banner for the document, not one per image. Nothing is requested until a choice is
  made.
- *Avoid:* fifty banners, or fifty requests fired to find out whether they exist.

**Load once, then the document is edited**
- *Trigger:* Load once is chosen, then the user types.
- *Expected:* the loaded content stays loaded for this view. The banner does not reappear on every
  debounce tick.
- *Avoid:* re-blocking on each render, which makes Load once last about 200 ms.

**An export while remote content is blocked**
- *Trigger:* Export to PDF with policy Always block and a document referencing remote images.
- *Expected:* the blocked content is simply absent from the export, and the export does not stall waiting
  for it.
- *Avoid:* waiting for an image that will never load, which hangs the export indefinitely.

## Not this

- **No configurable extra allowlist roots.** Three documents required them and none ever defined a
  setting key, type, default or control, so the feature was removed rather than half-built.
- **No fetching of remote content by the app itself.** See `#app-never-fetches`.
- **No inlining or copying of images on export.** A PDF embeds what it renders and nothing else is
  produced, so there is no second artifact that would need the image folder travelling beside it.
- **No image proxy or cache.** Caching a remote asset means storing content the user only agreed to view
  once.
- **No per-document remote policy.** One setting, so the answer to "does this app fetch things" is one
  answer.

## Decisions

- *2026-07-25* — Configurable allowlist roots were removed. They were referenced by three documents and
  defined by none.
- *2026-07-25* — The sanitising allowlist is derived from the active standard level and the content
  security policy is fixed. Recorded in `../../adr/0030-sanitization-allowlist-and-csp.md`.

## Open questions

*(none — ready to build)*
