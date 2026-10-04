# Preserve table words and simplify the editor caret

Approved scope: preserve whole words in preview tables and remove decorative
focus effects near the editor caret while retaining its theme color.

- Table headers and cells wrap at normal word boundaries, including inline code.
- Automatic column sizing, borders, padding and horizontal scrolling remain.
- Long unbroken values remain accessible through horizontal scrolling.
- Surrounding prose retains its existing wrapping.
- Confirm the focused Monaco input causes the decoration before changing it.
- Remove only the internal input shadow and outline; retain visible editor
  boundary focus and generated caret colors across all six appearance variants.
- No new settings, APIs, dependencies or persistence changes.

Verification: browser regressions for Full/GFM tables in narrow Split and wide
Preview modes; focused input and caret checks across six appearances; native
application walkthrough; canonical baseline, six-stage verification and baseline
comparison; independent final review. Preserve pre-existing generated-file edits.
