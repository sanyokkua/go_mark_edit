# Design

## Context

A CSS-only fix in the preview table styles and the Monaco input styling.

## Goals / Non-Goals

- Goals: keep whole words in tables without losing automatic column sizing, borders, padding or horizontal scrolling; leave prose wrapping untouched.
- Non-goals: new settings or APIs.

## Decisions

- Wrap table text at word boundaries; very long unbroken values stay reachable by horizontal scroll.
- Remove only the internal input shadow and outline after confirming the focused Monaco input caused them; keep the visible editor-boundary focus and the generated caret colors across all six appearance variants.

## Risks / Trade-offs

- Monaco internals may change in an upgrade; browser regressions check the focused input and caret in every appearance.
