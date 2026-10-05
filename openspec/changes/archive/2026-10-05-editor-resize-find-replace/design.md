# Design

## Context

The backend owns document view state; the frontend only projects it. Per-path metadata already existed for other view settings.

## Goals / Non-Goals

- Goals: independent, persisted split ratio per document; native Monaco search with no custom UI.
- Non-goals: tab or session restoration, search across documents, changes to the narrow stacked layout or sidebar resize.

## Decisions

- Keys: Left and Right move the divider 2 points, Home and End jump to 20 and 80. The ratio is committed through the backend document-view command when a drag ends; cancel restores the initial ratio. Drag state is disposable UI state.
- The ratio survives mode and focus changes without remounting Monaco, so cursor, selection, undo and scroll are kept. Save As and first save of an untitled document record the ratio under the destination path. Missing or invalid stored values mean 50. A persistence failure keeps the session ratio and uses the existing error path. The divider is hidden in the stacked layout or single-pane mode, but the ratio is retained.
- A slower backend acknowledgement never overrides newer local input.
- Find and Replace reuse Monaco's built-in widgets; replacement goes through existing buffer sync, dirty state and undo. Find stays available on read-only documents; replacement is blocked; shortcuts are inactive while a modal is open.

## Risks / Trade-offs

- Native pointer dragging in the packaged application was not verified, because desktop automation could not drag in the window. Dragging passed in the real-backend browser tests.
