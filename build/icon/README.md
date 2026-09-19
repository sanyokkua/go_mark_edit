# App icon assets

The canonical icon source and the processed build asset are checked in here and under `build/`.
The generated platform icons are derived by Wails during a build.

## Files

| File                      | Role                                                                                                |
| ------------------------- | --------------------------------------------------------------------------------------------------- |
| `appicon-source.png`      | **Canonical source** — the "MD>GO" glass-tile artwork supplied by the owner. Never edited in place. |
| `../../build/appicon.png` | **Processed build asset** — the 1024×1024 RGBA image consumed by Wails.                             |

Wails derives the macOS `.icns` and Windows `icon.ico` from `build/appicon.png` at build time. Linux
packaging and platform document/file-association icons use the same processed asset; no platform icon
is maintained as a separate hand-edited source.
