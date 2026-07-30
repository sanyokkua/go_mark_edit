# Appearance surface

`mockup.html` is the binding visual surface for the appearance batch. It is a self-contained,
offline HTML file containing all six palettes and the responsive screens used by T016–T019.

Arbitration is deliberately simple:

- The mockup decides visible shape: controls, labels, order, layout, token values, and displayed
  states. A visible difference in the application is a defect.
- [`../appearance-contract.md`](../appearance-contract.md) decides behaviour: persistence,
  acknowledgement, Auto mode, failure handling, and non-goals.

The files were copied into this SpecKit feature on 2026-07-30. They are now the active source for
appearance work; their counterparts under `docs/delivery/` are historical reference only.
