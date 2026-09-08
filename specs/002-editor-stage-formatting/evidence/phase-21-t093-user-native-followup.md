# Phase 21 T093 user native-control follow-up

Captured 2026-08-06 on the current macOS host from the user's direct
interaction with the freshly built GoMarkEdit window. This is append-only
evidence; prior T093 records remain unchanged.

## Native resize

The user directly resized the OS-managed framed window by its native frame.
The window visibly changed dimensions at multiple sizes, including the compact
responsive states shown in the supplied walkthrough captures. Manual resize is
therefore treated as observed for this follow-up. This record makes no separate
authoritative claim about native movement.

This record does not claim native zoom/fullscreen or close success. The green
macOS traffic-light control was visibly disabled in the walkthrough and needs
separate remediation/verification.

## Popup observation by appearance

- Material and Minimal: context and menu popups appeared at the expected
  pointer/trigger locations during the user's walkthrough.
- Liquid Glass: context/menu popups appeared displaced from the right-click or
  menubar trigger and could extend beyond the visible window at compact sizes.

The Liquid Glass popup defect remains open. The earlier local-only socket
observations in `phase-21-t093-real-control-followup.md` remain the retained
request proof; this record adds no new network claim.

## T093 status

**Not complete.** Manual resize is now user-verified, but native movement, the
Liquid Glass popup defect, and the disabled native green control remain
unresolved or unverified. T093 must not be checked until the corrected popup
behavior and the required native/local-only proof are both retained.
