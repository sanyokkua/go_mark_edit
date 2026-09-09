**Status:** Accepted
**Owner:** architect
**Audience:** all
**Last Updated:** 2026-07-10

# Personas & Use Cases

## Personas

- **P1 — The developer/technical writer.** Lives in Markdown (READMEs, docs, notes). Wants fast
  editing, syntax highlighting, GFM + Mermaid + code blocks, git-friendly output (no silent
  reformatting of line endings), and keyboard-driven formatting. Values offline, no telemetry, MIT.
- **P2 — The note-taker.** Keeps a folder of `.md`/`.txt` notes. Wants to open the folder as a tree,
  jump between files in tabs, autosave, and a clean reading view. Cares about a pleasant theme.
- **P3 — The reader.** Double-clicks a `.md` file from the OS to _read_ it (rendered), not edit it.
  Wants GoMarkEdit to be the default handler and to open straight into a distraction-free view — sets
  the **default open mode** to **Reading (Viewer)** (DD-27; the shipped default is Editor).

## Primary use cases

- **UC1 — Edit a Markdown file.** Open a file (dialog, recent, or OS association) → edit source with
  live preview → autosave / explicit save. (Phases 01, 04, 05)
- **UC2 — Read a Markdown file.** Set the default open mode to Reading (Viewer) (DD-27) → open via OS
  association → read rendered content with Mermaid/math/code → optionally switch to the Editor.
  (Phases 02, 05, 07)
- **UC3 — Work a folder of notes.** Open a folder → filtered tree → open several files in tabs →
  switch/close tabs → reopen last folder next launch. (Phase 07)
- **UC4 — Tidy a document.** Format (pad tables, normalize markers) and Lint (consistency) on demand
  or on save; fix the flagged issues. (Phase 10)
- **UC5 — Export to PDF.** Export the current rendered document to PDF, styled or clean. (Phase 10)
- **UC6 — Make it mine.** Pick a theme (Glass/Material/Minimal) and appearance (auto/light/dark);
  set default open mode, autosave, markdown standard, remote-content policy. (Phase 03)
- **UC7 — Handle references.** A document links a local image (resolved relative to the file) and a
  remote image (loaded only per the content policy). (Phase 06)
- **UC8 — Assist with the document.** Configure a local LLM provider → open the assistant
  sidebar → run Proofread / a reformat target / Summarize on the selection or whole document, or chat and
  give a custom instruction → review the proposed diff → Apply into the editor and save. Outbound calls go
  only to the configured provider and only on the user's action. (Phases 09–11)

## Anti-use-cases (explicitly not supported in v1)

- WYSIWYG editing; collaborative editing; plugin authoring; cloud sync; automatic session restore;
  recovering unsaved buffers after a crash; producing print-shop paginated PDFs.
