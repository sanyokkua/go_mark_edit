**Status:** verified
**Owner:** tester
**Revision:** feature/v1-implementation@c7771c8 plus unstaged process remediation
**Date:** 2026-07-21

# Phase 00 runtime evidence

- Native target: macOS/arm64.
- `just build` completed successfully with Wails CLI v2.12.0 and produced
  `build/bin/GoMarkEdit.app/Contents/MacOS/GoMarkEdit`.
- Frontend dependencies, bindings, frontend compilation, Go compilation, packaging, and self-signing all
  completed successfully.
- The built native app launched as a standard `GoMarkEdit` window at `wails://wails/`, rendered the File
  explorer plus Split editor/preview shell, and accepted close/quit actions without an error or confirmation.
- `just dev-ui` served the frontend-only runtime at `http://127.0.0.1:5173/`; the browser-visible DOM
  contained the File explorer, Document area, Editor/Preview panes, status surface, and Notifications region.
- The bridge-mock browser runtime reported zero console errors. The local development server was then
  stopped normally by the verifier.
