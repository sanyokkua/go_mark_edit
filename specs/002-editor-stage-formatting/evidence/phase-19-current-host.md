# Phase 19 current-host walkthrough

Host: macOS arm64. Package: the `GoMarkEdit.app` produced by the immediately preceding `just build`.

- The ordinary OS-managed frame exposed native close, zoom, and minimize controls. The native zoom action
  executed and the close control returned the window to a clean initial editor state; no in-app window
  chrome replaced those controls.
- File opened with every future File command disabled. Selecting View while File was open left exactly the
  View menu active; Escape dismissed it and restored focus to View.
- In the real identity-bound editor, `hello` selected with Cmd+A became `**hello**` after Bold, while the
  preview rendered `hello`. The toolbar showed Image, Format, Compact, Lint, and Toggle Assistant disabled;
  no Assistant panel appeared. The visible tabs remained disabled fixtures.
- The current-host run did not exercise Windows/Linux-only behavior or package-minimum-size limits. No
  external requests, File lifecycle, real tab lifecycle, Assistant/provider, tidy, or renderer behavior was
  introduced by this walkthrough.
