# SC-FT-007 autosave latency, measured on the shipped binary

**Task:** T181. **Requirement:** SC-FT-007 (last input → saved, within 5,000 ms).
**Build:** `just build` at commit `bcf0b548`, binary mtime `2026-08-19 09:00:31`.
**Stale-instance guard:** no GoMarkEdit process existed before the build; the process under
test started `09:01:24`, after the binary was written. Re-checked for the second instance
(`09:11:34`).

## The method, and why the earlier attempt could not do this

The 2026-08-18 spot-check established coalescing and constancy but explicitly **not**
magnitude, on the ground that "an anchor cannot bound an interval shorter than itself": the
tool round trip (~5.6 s) is coarser than the quantity being measured, so no timestamp taken
around a keystroke-dispatching call can bound the keystroke-to-write interval.

That reasoning is correct and the conclusion drawn from it was too strong. It rules out
measuring the interval *against an external clock*. It does not rule out measuring it
**against itself**.

The autosave is a trailing-edge debounce of some period `d`. Type three characters spaced
`s` apart:

- if `s > d`, the timer expires between keystrokes and each one produces its own write;
- if `s < d`, each keystroke resets the timer and the three coalesce into one write.

The transition is at `s = d`. Counting writes needs no anchor at all — only the *number* of
writes, and `s` is set by the harness rather than observed. Bisecting `s` therefore measures
`d` absolutely, and the round trip is irrelevant because every keystroke in a probe is
dispatched inside a single batched call.

Writes were observed by a 5 ms-resolution `stat` watcher on the file itself, so the
observation is of the real on-disk effect, not of a status surface.

## Small document (40 bytes)

| nominal `s` | writes | verdict |
|---|---|---|
| 3.0 s | 3 | separate — `s > d` |
| 1.0 s | 3 | separate — `s > d` |
| 0.96875 s | 3 | separate — `s > d` |
| **0.9375 s** | **1** | **coalesced — `s < d`** |
| 0.875 s | 1 | coalesced |
| 0.75 s | 1 | coalesced |
| 0.625 s | 1 | coalesced |
| 0.5 s | 1 | coalesced |
| 0.25 s | 1 | coalesced |
| 0.125 s | 1 | coalesced |

Monotone, with no inversion anywhere in the ten probes — which is itself the check that the
method is sound, since a debounce must produce exactly one transition.

**Bracket: 0.9375 s < d ≤ 0.96875 s (nominal).** The harness's own typing overhead was
measured from the separated probes — consecutive writes came 3.021 s and 3.040 s apart at
3.0 s nominal, and 1.045 s and 1.025 s apart at 1.0 s nominal, so 21–45 ms. Adding it:

> **d ≈ 0.97 – 1.01 s.**

## Large document (2,097,153 bytes)

Same bracket, on a document one byte over the live-preview limit so the preview is paused
(see the defect below — at exactly the limit this measurement cannot be taken at all).

| nominal `s` | writes | verdict |
|---|---|---|
| 0.9375 s | 1 | coalesced — unchanged from the small document |
| 0.96875 s | 2 (1.019 s apart) | **partially** separated |

At 0.96875 s the small document separated fully into three writes and the large one into
two, so `d` is marginally longer at 2 MiB — consistent with the write of 2 MiB itself
consuming part of the next interval. The shift is a few tens of milliseconds on a ~1 s
quantity.

All six keystrokes reached the document (2,097,153 → 2,097,156 → 2,097,159 bytes), so the
probe is not vacuous.

## Result

**SC-FT-007's 5,000 ms bound holds with about five times' margin, at both sizes.** The
autosave debounce is ~1.0 s on a 40-byte document and marginally longer on a 2 MiB one.

File mode `640` was preserved across every write at both sizes — including the 2 MiB writes,
which is a stronger case for FR-FT-009's atomic-write clause than the small-file evidence.

## What this does not cover

- **The distribution.** This is a bracket on the debounce constant, not the 100-trial
  protocol; that remains T121's evidence.
- **The write's own duration.** The watcher sees the file after the write completes; the
  time spent inside the write is inside `d`'s measured bracket, not separated from it.
- **Explicit Save.** Only the autosave path was measured. Explicit-save timings are
  `sc-ft-002/explicit-save-timings-2026-08-15.md`.
- **A first attempt at the large-document probe recorded zero writes and was discarded, not
  reported.** The click meant for the editor had landed on a tab button, so nothing was
  typed; the focus ring in the capture is what showed it. The probe above verified the caret
  moved (`Ln 4, Col 22`) before typing. A zero-write result would have read as "autosave does
  not fire on large documents", which would have been false.
