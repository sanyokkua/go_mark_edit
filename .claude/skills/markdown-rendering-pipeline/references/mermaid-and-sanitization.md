# Mermaid Rendering and Sanitization

How Mermaid diagrams render safely and asynchronously, what the sanitize schema must permit, and
the offline/remote-content rules that govern every asset this pipeline touches.

## Mermaid: async, cancel-guarded, theme-aware (DD-19)

Fenced code with info-string `mermaid` is intercepted by the `components` override into an async
`MermaidBlock` — never a `<pre><code>`. `startOnLoad:false`; `mermaid.parse()` first, then
`mermaid.render()`; cancel on unmount; theme derives from the live `data-theme`; invalid syntax →
inline error, never a crashed preview (EC-RENDER-1).

```tsx
// ui/components/MermaidBlock.tsx
export const MermaidBlock: React.FC<{ code: string }> = ({ code }) => {
  const [svg, setSvg] = React.useState<string | null>(null);
  const [err, setErr] = React.useState<string | null>(null);
  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      const mermaid = (await import('mermaid')).default;           // dynamic, bundled — no CDN
      const theme = document.documentElement.getAttribute('data-mode') === 'dark' ? 'dark' : 'default';
      mermaid.initialize({ startOnLoad: false, theme });
      try {
        await mermaid.parse(code);                                  // parse THEN render
        const { svg } = await mermaid.render(`m-${Math.random().toString(36).slice(2)}`, code);
        if (!cancelled) setSvg(svg);                                // already-sanitized Mermaid SVG
      } catch (e) {
        if (!cancelled) setErr(e instanceof Error ? e.message : String(e)); // EC-RENDER-1
      }
    })();
    return () => { cancelled = true; };                            // cancel-on-unmount guard
  }, [code]);
  if (err) return <pre className="gme-mermaid-error" role="alert">{err}</pre>;
  if (!svg) return <div className="gme-mermaid" aria-busy="true">…</div>;
  return <div className="gme-mermaid" dangerouslySetInnerHTML={{ __html: svg }} />;
};
```

Key properties this implementation must preserve:

- **`startOnLoad: false`** — Mermaid never auto-scans the document; it only renders the specific
  `code` this component owns.
- **`parse` before `render`** — a syntax error is caught at `parse()` and turned into `err` state,
  so `render()` is never called with input that would throw mid-render.
- **`cancelled` flag + cleanup** — if the component unmounts (or `code` changes) before the async
  `import`/`parse`/`render` chain resolves, the stale result is discarded instead of calling
  `setSvg`/`setErr` on an unmounted component (avoids the React "setState on unmounted component"
  warning — see `references/troubleshooting.md`).
- **Theme from `data-mode`** — read live at render time, not cached, so a live theme toggle is
  reflected the next time the block re-renders.

## The `dangerouslySetInnerHTML` rule

`dangerouslySetInnerHTML` is permitted **only** for the already-sanitized Mermaid SVG returned by
`mermaid.render()`. Mermaid's own renderer is trusted to produce safe SVG output for the diagram
source it was given (which itself only reaches `MermaidBlock` after having passed through the
Markdown parse — it is diagram *syntax*, not arbitrary HTML). Every other piece of HTML in the
document — anything that came from `react-markdown`'s own rendering — flows through
`rehype-sanitize` instead. Do not add a second `dangerouslySetInnerHTML` anywhere else in the
rendering pipeline without an equivalent, explicit sanitization guarantee.

## Sanitize schema requirements (EC-RENDER-5)

The sanitize schema passed to `rehype-sanitize` (see `references/plugin-sets.md` for where it's
wired into `pluginsFor`) must be permissive enough to allow the pipeline's *own* output through,
while stripping everything else:

- **KaTeX math spans** — the `span`/`math`/`annotation` elements and `class`/`style` attributes
  KaTeX emits for `$…$`/`$$…$$` output must be allowed, or Full-standard math renders as stripped
  text instead of typeset math.
- **`hljs-*` classes** — `rehype-highlight`'s token classes (`hljs-keyword`, `hljs-string`, etc.)
  must survive sanitization or code blocks lose syntax coloring.
- **Read-only task-list checkboxes** — the `<input type="checkbox" disabled>` elements
  `remark-gfm` emits for GFM task lists must be allowed through as read-only; sanitizing must not
  strip them into plain text, and must not permit an *enabled*, user-editable checkbox.
- **Mermaid SVG** — the diagram SVG itself is handled by the `dangerouslySetInnerHTML` path above,
  not by `rehype-sanitize` — the two mechanisms are complementary, not redundant.
- **Everything else stripped** — `<script>`, inline event-handler attributes (`onclick`, etc.),
  and dangerous URL schemes (`javascript:`, etc.) must never survive sanitization, at any standard
  level. This is the core of EC-RENDER-5: an author cannot use Markdown/HTML source to execute
  script in the app.

## Bundled assets / offline (DD-32)

**All rendering assets are bundled** — `import 'katex/dist/katex.min.css'`, dynamic
`import('mermaid')`, local highlight.js token styles, app fonts. **No CDN / network fetch at
runtime.** This is a repo-wide invariant (see `.claude/rules/offline-and-privacy.md`), not
specific to this pipeline: GoMarkEdit performs **no background or unsolicited network activity
whatsoever**. the phases before the assistant (Viewer, Editor) make zero network calls of any kind; the only outbound
request the app ever makes anywhere is a user-invoked LLM inference call to the provider the user
explicitly configured (the assistant phases).

Concretely, for this pipeline:

- Bundle KaTeX CSS/fonts via `import 'katex/dist/katex.min.css'` — never a `<link>` to a CDN.
- Bundle Mermaid via dynamic `import('mermaid')` — resolved by the bundler, not fetched at runtime.
- Bundle highlight.js token styles and all app fonts from npm packages / local files.
- Never reference `cdn`, `unpkg`, `jsdelivr`, or a Google Fonts `<link>` for any app resource.

## Remote content policy (DD-22)

The **only** thing in this pipeline that may touch the network is a *document-referenced* remote
asset — an image or stylesheet the user's own Markdown links to — and only under the content
policy:

| Mode | Behavior |
|---|---|
| **Ask** (default) | An in-preview banner prompts the user before the remote asset loads. |
| **Always allow** | Remote document assets load without prompting (explicit user opt-in). |
| **Always block** | Remote document assets never load; the preview shows a placeholder. |

This policy applies per document/session per the product spec — treat it as user-controlled, not
a build-time constant. It never applies to the app's own rendering assets (those are always
bundled, never optional — see above); it only governs assets *referenced inside the Markdown
content itself*.

## Local image handler

Local document images (a relative path inside the user's own Markdown, e.g. `![](./diagram.png)`)
resolve through the guarded `internal/assets` handler — relative-to-document resolution plus an
allowlist, with path traversal rejected. This is the one place a rendering concern crosses into Go:
the webview requests the asset through the guarded handler rather than resolving an arbitrary
filesystem path itself. Do not add a second, ad-hoc path-resolution mechanism for local images in
the frontend — route everything through the existing handler.
