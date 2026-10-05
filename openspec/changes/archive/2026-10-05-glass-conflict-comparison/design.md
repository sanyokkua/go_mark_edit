# Design

## Context

The conflict payload previously carried only the first hunk (12 lines or 4,096 bytes). Popup and ModalShell own all floating surfaces.

## Goals / Non-Goals

- Goals: obscure background text with a translucent tint; complete, exact comparison; keep all existing decision safeguards.
- Non-goals: new settings, merge tools, or changes to the 50 MiB document limit.

## Decisions

- Blur is applied in the shared Popup and ModalShell, not per dialog.
- The payload holds the whole canonical text of both versions. On disk bytes come from the stable read including BOM and line endings. Yours bytes come from the existing save-encoding owner for the exact current revision, with no formatting or writes; an unresolved or unsupported encoding gives a localized "unavailable" reason.
- The bundled Monaco diff editor shows read-only panes with line numbers, whitespace differences, virtualized scrolling and change navigation in a wider responsive dialog; transient models are disposed.
- Diff computation is capped at five seconds; if it does not finish, this is stated visibly and the full text stays scrollable.
- Revision and disk-version decisions, read-only restrictions, initial focus, dismissal and stale-decision protection are unchanged.

## Risks / Trade-offs

- Sending full text raises the payload size for large documents; the existing 50 MiB limit bounds it.
