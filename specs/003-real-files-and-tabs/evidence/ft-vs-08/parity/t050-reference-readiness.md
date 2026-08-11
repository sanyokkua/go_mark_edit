# T050 reference readiness evidence

Date: 2026-08-11

## Verification

- Focused navigation probe: passed (`T050 reference navigation reaches every mapped probe before capture`).
- Parity unit suites: 4 suites, 15 tests passed.
- Unrestricted command: `npm --prefix frontend run verify:ui -- e2e/real-files-parity.test.ts --workers=1`.
- Unrestricted result: exit 1 after 14.6 minutes because the final pixel-parity assertion remains red.
- Final compact report: 546 logical cases, 3 repetitions, 1,638 attempted, 1,620 comparisons completed, 0 passed,
  1,638 failed, and 18 incomplete rows.
- The 18 incomplete rows are actual-page `save-prompt` selector fixture failures; no reference-selector readiness wait
  remains. The prior 738 reference-selector waits are eliminated. The remaining actual fixture gap is outside T050.

## Authority checks

The final report retains these unchanged hashes:

- Reference source: `af1c8abb0f9e214337c95b08cddb23727bf5eb14f0f246e681597e369880c41b`
- Adapter: `cfa4d0a3528eb026ab24dc081985d5946b39243bf085a9781ea64a41ddf02123`
- Manifest: `e2f8d239d016e83dd7cd7bdaaea2f4ecc6d27277d8b4bda75e647dc22c4ef463`
- Mapping: `c9615a0f12576bf3fcadaa2469091c17f7ca8f6a1c29ba58575c42068a708210`

The mockup, mapping, masks, tolerance, comparator, and coordinate handling were not changed. Generated per-case
artifacts remain ignored; no generated case files are tracked.
