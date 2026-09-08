# App icon assets (DD-66)

The canonical icon source and its deterministic processing pipeline. Normative doc:
`../../04_Build_and_Release/04_VERSIONING_ICON_AND_CICD.md`; decision: DD-66 (ADR-0015).

## Files

| File | Role |
|---|---|
| `appicon-source.png` | **Canonical source** — the "MD>GO" glass-tile artwork exactly as provided by the owner (square, dark backdrop around a rounded glass tile). Never edited in place. |
| `process_icon.py` | **Deterministic pipeline**: crops the tile out of the dark backdrop, makes everything outside the tile's rounded-rect silhouette transparent, and exports a 1024×1024 `appicon.png`. Re-runnable at any time; same input → same output. |

> `appicon-source.png` must be placed here by the owner (it is the artwork supplied with the icon
> request). If it is missing, `process_icon.py` fails fast with a clear message.

## Producing the build icon

```bash
python3 process_icon.py appicon-source.png ../../../build/appicon.png
```

Output contract (asserted by the script): 1024×1024, RGBA, fully transparent corners
(alpha == 0 at all four corner pixels), the tile centered. Wails derives the macOS `.icns` and
Windows `icon.ico` from `build/appicon.png` at build time; Linux packaging and the per-OS
**document/file-association icons** (DD-07) are derived from the same processed image — no platform
icon is ever hand-forked from a different source.

## Why processing is required

The provided artwork sits on a dark navy backdrop. Shipping it unprocessed would give the app a
visible dark square plate behind the rounded tile on macOS (which expects transparent margins),
in the Windows taskbar, and in Linux launchers. The pipeline removes the backdrop the same way the
reference project prepared its `build/appicon.png`.
