# Appearance surface

`mockup.html` is the binding visual surface for the delivered appearance contract and the approved
native-window shell. It is a self-contained, offline HTML file containing all six palettes and only
the current shell states: the in-app Settings/View/About row, responsive workspace forms, delivered
Appearance Settings, About, notifications, and startup recovery.

`future-product-reference.html` preserves the broader product gallery for later migration slices. It
is reference-only: it does not authorize current implementation, override `mockup.html`, or make any
future surface part of the native-window shell.

Arbitration is deliberately simple:

- The mockup decides visible shape: controls, labels, order, layout, token values, and displayed
  states. A visible difference in the application is a defect.
- [`../appearance-contract.md`](../appearance-contract.md) decides behaviour: persistence,
  acknowledgement, Auto mode, failure handling, and non-goals.
- [`../contracts/window-launcher-shell.md`](../contracts/window-launcher-shell.md) decides the current
  shell behavior and explicitly keeps later product surfaces absent.

The files were copied into this SpecKit feature on 2026-07-30. They are now the active source for
appearance work; their counterparts under `docs/delivery/` are historical reference only.
