<!--
  Code Review report template.

  Fill this in and post the result in chat. The review is READ-ONLY: report findings,
  do not modify code.

  Severity legend:
    - blocking      Must be fixed before merge (correctness, security, data loss, broken contract).
    - non-blocking  Should be addressed, but does not block merge (design, missing test, clarity).
    - nit           Minor preference; author may ignore. Pure style belongs to linters, not here.

  Recommendation values (pick exactly one in the Summary):
    - approve                 No blocking or notable non-blocking issues.
    - approve-with-nits       Only nits / minor non-blocking items remain.
    - changes-requested       One or more blocking issues exist.

  Guidance:
    - Every finding MUST cite a real file:line you actually read this session.
    - Frame findings as requests ("Consider...", "This will...") backed by technical facts.
    - State the review scope (mode/base/head) from get-review-target.sh in the Summary.
    - Delete these comments before posting.
-->

## Summary

<!-- 2-4 sentences: what the change does, overall code-health impression, scope reviewed
     (e.g. "Scope: branch-vs-base against origin/main, 7 files, +210/-34"). -->

**Recommendation:** <!-- approve | approve-with-nits | changes-requested -->

## Findings

<!-- One numbered entry per finding, highest severity first. Remove the example. -->

### [1] [area] short title
- **Location:** `path/to/file.ext:42`
- **Severity:** blocking <!-- blocking | non-blocking | nit -->
- **Why:** <!-- The concrete problem and its consequence, as a technical fact. -->
- **Suggested change:** <!-- A specific, actionable fix or direction. -->

### [2] [area] short title
- **Location:** `path/to/other.ext:108`
- **Severity:** non-blocking
- **Why:** <!-- ... -->
- **Suggested change:** <!-- ... -->

<!-- Areas: design, correctness, functionality, complexity, tests, naming, comments,
     security, concurrency, performance. -->

<!-- If no issues were found, state that explicitly:
     "No blocking or non-blocking issues found." -->

## Cross-reference notes

<!-- Results of checking beyond the diff:
     - Affected callers verified / updated? List them.
     - Tests covering the new behavior present? Where?
     - Anything left inconsistent across the repository (stale references, partial rename,
       docs/config not updated)?
     - Generated/vendored/large files skipped (from the script's flags). -->

REVIEW_COMPLETE
