# Autosave on the shipped binary: coalescing and constancy, not magnitude

**Build:** `just build` at `31c66762`, binary mtime 21:57:01, process started 21:57:02
(started after the binary was written, so not a stale instance).
**Fixture:** a path-backed writable file at mode `640`, autosave on.

## What was measured, and how

A file watcher polling `st_mtime` every 10 ms recorded the absolute epoch of every
atomic replacement. No instrumentation was added to the release build — T181
forbids that, because instrumenting the artifact changes the thing under
measurement.

**Burst.** Twelve keystrokes typed with no pause produced **exactly one write**,
containing all twelve characters. Not twelve writes, not two.

**Paced.** Three keystrokes at 5-second spacing produced **three** writes, at
intervals of **5.036 s** and **5.037 s**.

## What that establishes

- **Debounce coalescing works on the shipped binary.** A burst collapses to one
  atomic replacement, so there is no per-keystroke write and no catch-up burst.
- **The latency is constant, not drifting or accumulating.** Write-to-write
  spacing reproduced keystroke-to-keystroke spacing to within 1 ms over 5 s. A
  debounce that accumulated, or a queue that fell behind, would show diverging
  intervals.
- **The write is atomic and permission-preserving**: mode `640` survived every
  replacement, and no temporary file was left in the directory.

## What it does NOT establish, and why

**The magnitude of the latency.** SC-FT-007 bounds it at 5,000 ms and the harness
distribution T181 compares against is p50 ≈ 1.25 s, p95 ≈ 1.33 s, max ≈ 1.34 s.
Measuring that needs a timestamp on the _keystroke_, and the only keystroke source
available here is a tool call whose round trip was measured at **~5.6 s** earlier
in this session — coarser than the quantity being measured. An anchor cannot bound
an interval shorter than itself.

The two results above are anchor-free, which is why they are trustworthy and why
they stop short of a number. **T181 stays open for the magnitude**, and its own
text is right that the honest route is a person with the real `.app`: type one
character, watch for the replacement, and say whether the observed interval sits
in the harness range. What is no longer owed is the coalescing and constancy half.
