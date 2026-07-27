# ADR-0033 — Workspace file operations are additive only: the app creates, it never renames, moves or deletes

**Status:** accepted
**Date:** 2026-07-25
**Deciders:** project owner, architect

## Context and problem statement

The mockup and the prose contradict each other, and both are readable as normative.

`mockups/gomarkedit-mockup.html` gives the folder sidebar a **New file** and a **New folder** button,
and gives every tree row a context menu containing **Open · Open in new window · Rename… · Reveal in
Finder · Copy path · Delete…**. `mockups/README.md` calls the mockup "the single source of truth for the
GoMarkEdit UI".

`01_Product/03_FILES_TABS_WORKSPACE.md` and DD-56/DD-59 say the opposite, deliberately and twice: the
app "only opens — it never moves, copies, renames, or reorders anything on disk."

Neither position is obviously right. A notes application where you cannot create a note inside your
notes folder is broken in a way users notice on day one — and creating files is the one operation the
prose's reasoning does not actually argue against. Destructive operations are different: with no
filesystem watcher (`EC-WS-6` defers to a manual refresh), a rename or a delete leaves the tree, any open
tab on that path, and the recent-files list all describing a file that is no longer there.

## Decision drivers

- The folder sidebar exists so someone can keep a folder of notes. Creating a note is the point.
- There is deliberately **no filesystem watcher**, so the app cannot observe the consequences of its own
  destructive operations, let alone anyone else's.
- Every destructive operation implies an undo story, and the app has no undo outside the editor buffer.
- The mockup is the visual source of truth and must be made to agree, in whichever direction we choose.
- Users already have a file manager, and it is better at this than we will be.

## Considered options

- **A.** Read-only workspace. Delete New file, New folder, Rename and Delete from the mockup.
- **B.** Additive only. Keep New file and New folder; delete Rename and Delete.
- **C.** The full set, with a confirmation dialog and OS-trash semantics for delete.

## Decision outcome

Chosen: **B**.

**Permitted, and specified in `01_Product/03_FILES_TABS_WORKSPACE.md`:**

- **New file** — creates an empty `.md` in the selected folder (or the workspace root) and opens it in a
  tab. If the name is taken, the app says so and does not overwrite.
- **New folder** — creates an empty directory in the selected folder.
- **Reveal in file manager** — hands the path to the platform. Called by a name that is true on all three
  platforms, not "Reveal in Finder".
- **Copy path** — the absolute path to the clipboard.

**Refused, and removed from the mockup:**

- Rename, move, delete, and drag-to-reorder within the tree.

The reason creation is safe and the others are not is worth stating plainly, because it is the whole
argument: **after a create, the app knows exactly what changed.** It made the file, it knows its path, it
inserts one node. After a rename or a delete it must reconcile an unknown amount of state — every open
tab, the recent list, the whole subtree — with no watcher to tell it what the filesystem now looks like,
and with no way to put it back if the user did not mean it.

The tree is refreshed after a create by inserting the known node, not by re-enumerating the folder.

### Consequences

- Positive: the "I cannot make a note in my notes folder" hole closes, at the cheapest point.
- Positive: no undo journal, no watcher, no tab reconciliation, no trash semantics, no confirm dialogs.
- Positive: the mockup and the prose agree, in writing, in one direction.
- Negative: renaming a note means using a file manager, or Save As and then deleting the original
  elsewhere. This is a real limitation and it is recorded in
  `00_Foundation/01_VISION_AND_SCOPE.md#refused-on-2026-07-25-with-reasons` rather than hidden.
- Negative: DD-56 and DD-59 said "never creates" and now say "creates, never destroys". That is a
  narrowing of an accepted decision and is why this is an ADR rather than an edit.
- Neutral: the app still holds no destructive filesystem capability, so the assistant's tool scope
  (which is read-only) is unaffected.

## Pros and cons of the options

### Option A — fully read-only
- Good: maximally consistent with DD-56/DD-59 as written; nothing to build.
- Bad: the folder sidebar becomes a viewer. The primary persona keeps a folder of notes and would have
  to leave the app to add one to it.

### Option B — additive only *(chosen)*
- Good: fixes the real hole; needs no watcher, no undo, no reconciliation.
- Bad: an asymmetry a user might find odd — I can make a file here but not rename it.

### Option C — the full set
- Good: everything the mockup drew; a genuinely complete file manager.
- Bad: needs a watcher the specification deliberately does not have, an undo story that does not exist,
  reconciliation with open tabs and the recent list, and OS-trash semantics on three platforms. Large,
  and it is duplicating software the user already has.

## Links

- Design decisions: DD-56, DD-59 (narrowed by this ADR), new DD-77
- Spec clauses: `specification/01_Product/03_FILES_TABS_WORKSPACE.md#file-operations`,
  `specification/00_Foundation/01_VISION_AND_SCOPE.md#refused-on-2026-07-25-with-reasons`
- Mockup: `specification/mockups/gomarkedit-mockup.html` — `#ctxmenu` and the sidebar header buttons
- Phase: `specification/07_Phases/PHASE_07_A_FOLDER_OF_NOTES.md`
- Stories: the Phase 07 stories, not yet written.
