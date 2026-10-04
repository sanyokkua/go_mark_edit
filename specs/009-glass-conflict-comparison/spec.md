# Liquid Glass popup blur and accurate external-change comparison

User-approved scope (2026-10-04): strong frosted Liquid Glass light/dark floating surfaces and complete external-change comparisons with accurate full-version statistics.

- Popup and ModalShell remain the surface owners. Menus, context menus, disclosures and dialogs obscure underlying text while retaining translucent color. Start with 48px blur; preserve Material and Minimal.
- Compare complete canonical On disk and Yours text, including all distant changes. This replaces feature 003's first-hunk, 12-line/4,096-byte preview contract; historical artifacts remain unchanged.
- On disk bytes are physical bytes from the stable read, including BOM and line endings. Yours bytes are the expected encoded saved size of the exact current revision, using the existing save encoding owner without formatting, writes or new normalization authorization. Unresolved or unsupported encoding reports a localized unavailable reason.
- Full line counts use one plus the LF count, including empty text and trailing empty lines.
- Use the bundled Monaco diff editor with read-only panes, line numbers, whitespace differences, virtualized scrolling and previous/next-change controls. Use a wider responsive dialog and dispose transient models.
- Diff computation is limited to five seconds. Incomplete highlighting is visibly reported and complete text remains scrollable. The existing 50 MiB document acceptance limit remains.
- Preserve exact revision/disk-version decisions, metadata-only display, read-only restrictions, initial focus, dismissal, and stale-decision safeguards.
- No network requests, dependencies or settings are added.

Acceptance: native Liquid Glass light/dark surfaces hide readable background text; all changes and physical/expected encoded sizes are correct; encoding-unavailable states are explicit; all six verification stages, baseline comparison and independent review establish evidence.
