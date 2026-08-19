# A document at exactly the live-preview limit wedges the whole interface

**Found:** 2026-08-19, during T181's host walk. **Severity:** the application stops accepting input for minutes at a time, on open and again on each
interaction. **Corrected 2026-08-19** — see "What the first write-up got wrong".
**Build:** `just build` at commit `bcf0b548`, binary mtime `09:00:31`, process started
`09:01:24` — stale-instance guard recorded.

## What happens

Open a Markdown document of **exactly 2,097,152 bytes** (2 MiB). The document loads and the
live preview renders it. From that moment the entire interface stops accepting input:

- the tab strip does not switch tabs when clicked (the click focuses the tab button — the
  focus ring moves — but the tab does not activate);
- the **File** and **View** menus do not open when clicked;
- the editor takes no keystrokes: `Ln 1, Col 1` is unchanged after clicking into the text,
  pressing Down and Right, and typing three characters, and the document's word count and
  `Saved` state never move.

The window continues to **paint** — the newly opened document did eventually appear, about
70 seconds after the open — which is what makes the state so easy to misread. It looks like
a slow but live application. It is not: nothing that requires the main thread to run script
will ever complete.

`com.apple.WebKit.WebContent` sits at **100% CPU, state `Rs`, 662 MB RSS**, with
`DispatchQueue_1: com.apple.main-thread` saturated and JavaScriptCore heap-helper threads
running. The Go process is idle at **0.2%**. It had not recovered five and a half minutes
after the open, when the instance was killed.

**Checking the Go process is what hides this.** A wedge in the webview leaves the Go side
looking perfectly healthy, so "the app is not spinning" is true and irrelevant. Sample the
`WebContent` XPC process, not the binary.

## The cause is the live preview, demonstrated by a one-byte control

`PreviewPane.tsx:7` sets `PREVIEW_BYTE_LIMIT = 2_097_152` and the guard at `:28` and `:52`
is `byteLength <= PREVIEW_BYTE_LIMIT` — **inclusive**. So a document of exactly the limit is
the largest one the live preview will render, and it renders it.

The control is decisive. The same file plus **one byte** (2,097,153) opens with

> Live preview is paused — this document is over 2 MB.

and a `Refresh preview` button; the application stays fully responsive, the caret moves on
click (`Ln 4, Col 22`), typing lands, and autosave writes normally. The entire T181 large-
document measurement was taken on that file.

One byte either side of the boundary is the difference between a usable application and a
dead one, so the cause is the preview render, not the editor and not document size as such.

## Why no test caught it

- `PreviewPane.test.tsx` exercises the limit against `byteLength` as a **number**. It never
  renders 2 MiB of Markdown, so it cannot observe the cost of doing so.
- Playwright runs the mock bridge and no e2e fixture approaches the limit.
- The boundary fixtures that do exist (`boundary-10mib-*`, `boundary-50mib-*`) are about
  FR-FT-016's open/read-only thresholds, and both are **above** the preview limit — so every
  one of them opens with the preview already paused. The one size that hurts is the one no
  fixture uses.

## What is not yet known

- **Whether it is a hang or merely very slow.** Five and a half minutes with no progress is
  enough to call it unusable, and enough to file, but it was not left overnight.
- **Where the boundary of the pathology is.** Only 2,097,152 was tried. The document is
  304,765 words of `lorem ipsum` in ~28,000-character lines; line length and structure may
  matter as much as byte count, and a 1 MiB document was not tried.
- **Whether an exclusive threshold would be enough**, or whether the limit is simply set too
  high for the renderer. Making the guard exclusive would move the cliff by one byte, not
  remove it — a document of 2,097,151 bytes is not meaningfully cheaper to render.

Filed rather than fixed: the fix is a requirement question (what the preview limit should
be, and whether the pause must be based on something other than byte count), and this walk's
scope was T181's latency.


---

# Correction and diagnosis, 2026-08-19

Two things in the write-up above are wrong, and the cause is not what it said.

## What the first write-up got wrong

**"Permanently unusable", "no recovery after five and a half minutes."** It does recover. A
later instance was observed at **0.0% CPU after 3m18s**, having finished on its own, and the
very first instance had already settled once (it painted `big.md` correctly about 70 seconds
after the open) before wedging *again* when the editor was clicked. So the behaviour is not
one permanent hang but a **multi-minute stall repeated on open and on each interaction**.
That is still severe, and it is a different defect from the one first recorded.

The original observation window was simply too short to see the end, and "no recovery after
5.5 minutes" was written as though it established permanence. It did not.

## The stated cause was wrong: rendering 2 MiB is cheap

The write-up above attributes the wedge to the live preview rendering a 2 MiB document, and
the one-byte control does prove the preview is *involved*. It does not prove that rendering
is what costs the time — and it is not. Measured directly, on the very file that wedges the
host:

| Stage | Cost for `big.md` (2,097,152 B, 1,907 lines, longest 1,100 chars) |
|---|---|
| Markdown pipeline (`remark-parse` → `remark-gfm` → `remark-rehype` → `rehype-sanitize`) in **JSC/WebKit** | **579 ms** |
| Same pipeline in **V8/Chromium** | 1,411 ms |
| Browser layout of an equivalent 2 MiB DOM, WebKit | 46 ms |
| Browser layout of an equivalent 2 MiB DOM, Chromium | 188 ms |

**Everything the preview has to do costs under a second.** The application takes minutes.
The gap is not the renderer, not the markdown pipeline, and not the engine.

## Where the time actually goes

`sample` of the wedged `com.apple.WebKit.WebContent` main thread, 4,057 samples:

```
4015  operationPutByIdStrictGaveUp
  4013  JSC::JSArray::put(JSC::JSCell*, JSC::JSGlobalObject*, ...)
    4013  JSC::JSObject::countElements()
```

**98.9% of samples are in `countElements`, reached through `JSArray::put`.** That is the
signature of an array in a slow (sparse/dictionary) storage mode, where each indexed write
walks the whole array — an O(n²) build. It is application JavaScript, not WebCore layout and
not the markdown pipeline, both of which were measured above and are fast.

The JS frames are not symbolicated in a `sample` of JIT-compiled code, so the exact function
is not identified here. Locating it needs Safari Web Inspector attached to the packaged
webview.

## Why lowering `PREVIEW_BYTE_LIMIT` is the wrong fix

Three independent reasons:

1. **It is forbidden.** `spec.md:952` (FR-FT-005) says live preview "MUST remain active
   **through exactly 2 MiB** and pause above it". The inclusive guard is the requirement, not
   an oversight. Changing it needs the owner.
2. **It would mask a quadratic path rather than remove it.** Quadratic cost does not
   disappear when the input shrinks, it only gets quieter: if 2 MiB stalls for minutes, 512
   KiB still stalls for roughly a sixteenth of that. The stall would survive at every size
   below any new limit, where no pause protects the user.
3. **The premise it rests on is measurably false.** The task framed the limit as unfixable
   because "a 2,097,151-byte document is not meaningfully cheaper to render". True, and
   irrelevant — rendering either one costs well under a second.

## A separate finding, which does need the owner

Parse cost scales with **line count**, not document size, and short lines are the expensive
shape. At a fixed 2,097,152 bytes, in Node/V8:

| line length | lines | parse |
|---|---|---|
| 80 chars | 25,891 | **14,916 ms** |
| 1,000 chars | 2,096 | 1,413 ms |
| 10,000 chars | 210 | 567 ms |
| 28,000 chars | 75 | 535 ms |
| one line | 1 | 474 ms |

In-browser V8 measures the 55-char shape at **24,272 ms** at 2 MiB. Real Markdown prose has
short lines, so **the common shape is the slow one** — and FR-FT-005 requires live preview to
stay active at exactly that size. That is a requirement that cannot be met for ordinary
content on Chromium, independent of the quadratic defect above. JSC is far better here (1,512
ms for the same shape), so this one is engine-dependent in the opposite direction.

## What is now established, and what is not

**Established.** The preview is involved (one-byte control). The markdown pipeline and layout
are both fast on the exact failing file, in both engines. The stall is repeated rather than
permanent. The hot path is `JSArray::put`/`countElements` in application JavaScript.

**Not established.** Which application function builds that array. Whether it is on the
preview path specifically or on a shared path the preview merely triggers. Whether the same
cost is present, smaller, at ordinary document sizes — which is the question that decides how
urgent this is, and it is the next thing to measure.

---

# Second investigation, 2026-08-19 — the preview render is exonerated

The correction above narrowed the cause to "application JavaScript, quadratic array writes,
not the renderer". This pass narrowed it further, answered the urgency question, and hit a
hard blocker. It did **not** name the function, and nothing was changed in production code.

## The urgency question is answered: no quadratic cost at ordinary sizes

The task asked, before any fix, whether the same quadratic cost is present but small at 256
KiB and 1 MiB. It is not. The **real `MarkdownView`** — the shipped component, imported from
the running dev server, so the actual `react-markdown` + plugin + React commit path — rendered
and laid out at three sizes:

| size | WebKit (JSC) | Chromium (V8) |
|---|---|---|
| 256 KiB | 163 ms | 175 ms |
| 1 MiB | 490 ms | 620 ms |
| 2 MiB | **950 ms** | 2,144 ms |

WebKit is linear across the range (163 → 490 → 950 for 1× → 4× → 8× the bytes). There is no
hidden quadratic term waiting at smaller sizes, so the defect is **not** silently degrading
ordinary documents. That lowers its urgency, and it is the one thing the task said to
establish first.

## The whole preview render path is now exonerated, end to end

Every stage has been measured on the host's engine family at 2 MiB:

| Stage | WebKit/JSC |
|---|---|
| GFM pipeline alone (parse → gfm → rehype → sanitize) | 579 ms |
| Full `MarkdownView`: pipeline + react-markdown + React commit + layout | **996 ms** |
| Plain DOM layout of an equivalent 2 MiB tree | 46 ms |

**Under one second for everything the preview does**, against a stall measured in minutes. The
preview render is not where the time goes. That is a stronger statement than the earlier
correction could make, which had only measured the pipeline and layout, not the component.

## What the stack actually says, re-read

The frames above the hot spot were under-read the first time. In full:

```
WebCore::timerFired
  WebCore::WindowEventLoop::didReachTimeToRun
    WebCore::EventLoop::run
      WebCore::EventTarget::dispatchEvent
        WebCore::EventTarget::fireEventListeners
          WebCore::JSEventListener::handleEvent
            JSC::Interpreter::executeCall
              ... operationPutByIdStrictGaveUp
                    JSC::JSArray::put  →  JSC::JSObject::countElements
```

The quadratic write happens **inside an event listener dispatched from a timer** — not inside
a React render, and not inside layout. `operationPutByIdStrictGaveUp` is a put **by
identifier**, a named property, on a `JSArray`. On an array the hot named property is
`length`, and in JSC assigning `length` to an array in non-fast storage calls `countElements`,
which is O(n). Repeated in a loop, that is the observed O(n²).

## Where it is not

`grep` over `frontend/src` for `length` assignment (`\.length\s*=\s*[^=]`) returns **nothing**
outside tests, and the large-array idioms present are three benign ones (two single-element
`splice` calls in `notificationsSlice`, one 39-element `Array.from` in the bridge mock). So
the quadratic write is **not in first-party application source**. It is in bundled dependency
code — Monaco or the markdown stack — or in generated Wails runtime code.

## The blocker

The task named Safari Web Inspector as the direct route. **It is not available in this
environment**: browsers are granted at a read-only tier here, so Safari can be seen in a
screenshot but cannot be clicked, and the Develop menu cannot be driven. `sample` does not
symbolicate JIT frames, so it cannot name the function either. There is no third profiler to
hand.

Reproducing inside the packaged app was also not achieved: Monaco is not exposed on `window`,
so a 2 MiB document cannot be injected into the running app from a test harness, and the mock
bridge has no seam for seeding large document content.

## What would finish it

1. A **symbolicated JS profile** during the stall — Safari Web Inspector attached to the
   packaged webview, by a person who can click. That is the shortest path and it names the
   function directly.
2. Failing that, a **content seam in the mock bridge** so a 2 MiB document can be loaded in
   `just dev-ui`, which would make the stall reproducible under Playwright WebKit where it can
   be bisected. Note this may not reproduce it: the stall may depend on the real Go bridge,
   which the mock does not model.
3. Either way, **do not lower `PREVIEW_BYTE_LIMIT`** — unchanged from the previous pass, and
   now better supported: the preview render is measurably linear and cheap, so the threshold
   is not what is hurting anyone.
