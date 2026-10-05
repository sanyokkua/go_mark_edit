# Editor pane resizing and Find/Replace

Status: Approved by the product owner in chat on 2026-10-04.

## Requirements

- **FR-001**: While the editor and preview are visible side by side, the application shall expose a draggable, keyboard-accessible divider whose editor share is bounded to 20–80 percent and defaults to 50 percent.
- **FR-002**: When the user presses Left or Right on the divider, the application shall change the editor share by 2 percentage points; Home and End shall select 20 and 80 percent respectively.
- **FR-003**: When the user finishes dragging, the application shall commit the ratio through the backend document-view command; cancellation shall restore the drag's initial ratio, and document changes shall clean up the interaction.
- **FR-004**: When a document changes viewing mode or loses and regains focus, the application shall preserve its independent split ratio without remounting Monaco or losing its cursor, selection, undo history or scroll state.
- **FR-005**: When a saved document is reopened, including after application restart, the application shall restore its split ratio from existing per-canonical-path file metadata; missing or invalid stored ratios shall use 50 percent.
- **FR-006**: When an untitled document is saved or a document is saved as another path, the application shall record its current ratio under the destination path; untitled ratios shall otherwise remain session state.
- **FR-007**: If metadata persistence fails, the application shall keep the current session ratio and surface the failure through the existing error path.
- **FR-008**: While the existing narrow stacked layout is active or only one pane is visible, the application shall hide the divider and retain the document's split ratio.
- **FR-009**: When Ctrl+F on Windows/Linux or Cmd+F on macOS is pressed in the editor or Find widget, the application shall open Monaco's built-in Find widget.
- **FR-010**: When Ctrl+R on Windows/Linux or Cmd+R on macOS is pressed in the editor or Find widget, the application shall open Monaco's built-in Replace widget while retaining Monaco's standard Replace shortcuts.
- **FR-011**: While a document is read-only, the application shall allow Find and prevent replacement; while a modal is open, editor search shortcuts shall remain unavailable.
- **FR-012**: When replacement changes content, the application shall use existing buffer synchronization, dirty state, live preview, saving and Monaco undo/redo behavior.
- **FR-013**: The application shall derive app action labels and shortcuts from the action registry and catalogues, use centralized visual tokens, and add no runtime dependency or network behavior.

## Acceptance scenarios

1. Given split mode, when the divider is dragged in either direction or beyond its bounds, then the two pane widths change within 20–80 percent and Monaco's working state survives.
2. Given a focused divider, when arrows, Home or End are pressed, then its width and accessible current value change to the prescribed percentages.
3. Given an active drag, when the pointer is released outside the divider, cancelled, or the document changes, then the drag ends safely; cancellation restores its initial ratio.
4. Given two documents with different ratios, when tabs or viewing modes are switched, then each retains its ratio; reopening a saved file after restart restores it.
5. Given legacy or corrupt metadata, when a file opens, then the split defaults to 50 percent; saving an untitled file or Save As preserves its current ratio under the new path.
6. Given a persistence failure, when the ratio is committed, then the current session remains resized and the failure is surfaced.
7. Given a narrow stacked layout or single-pane mode, when displayed, then no divider is visible and the stored ratio is retained.
8. Given editable text, when Find or Replace shortcuts are pressed, then Monaco's widget opens; navigation, case/whole-word/regex options, replace one/all and undo work within the active document.
9. Given a replacement, when synchronization and saving complete, then dirty state, preview and saved bytes reflect the replacement.
10. Given a read-only document or modal, when search shortcuts are used, then Find remains available for read-only text, replacement cannot mutate it, and modal interactions do not invoke editor actions.

## Boundaries

Search is within the active editor document. No tab/session restoration is added. Existing narrow layout and sidebar resize behavior are preserved. Backend application state stays authoritative; temporary drag state is disposable UI state.
