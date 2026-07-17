# Diff Strategies

How to turn a user's request into a concrete, deterministic review scope, and how to read the
output of `scripts/get-review-target.sh`. The goal is to review exactly the change the user means —
no more, no less — and to never guess the scope.

## Phrasing → scope mapping

| User says (roughly)                                  | Scope            | Script invocation                  | What it compares                       |
|------------------------------------------------------|------------------|------------------------------------|----------------------------------------|
| "my changes", "what I have so far", "uncommitted"    | working          | `get-review-target.sh --working`   | working tree vs `HEAD`                 |
| "my staged changes", "what I'm about to commit"      | staged           | `get-review-target.sh --staged`    | index (staged) vs `HEAD`               |
| "this branch vs `main`", "the diff against base"     | branch-vs-base   | `get-review-target.sh --branch [BASE]` | current branch vs base branch      |
| "the last N commits", "my last 3 commits"            | last-N           | `get-review-target.sh --commits N` | `HEAD~N..HEAD`                         |
| "this Pull Request (PR)", "review the PR"            | branch-vs-base   | `get-review-target.sh --branch [BASE]` | the PR's source branch vs its base |
| (nothing specified)                                  | working (default)| `get-review-target.sh`             | working tree vs `HEAD`                 |

When the request is ambiguous (e.g. "review my work" with both staged and unstaged changes
present), default to **working** (it is the superset of unstaged changes) and state in the review
which scope you used, so the user can correct you.

## Picking the base branch (for branch-vs-base / PR)

A Pull Request is reviewed as "source branch versus its base branch". Resolve the base in this
order and use the first that exists:

1. An explicit base the user named (e.g. "against `develop`").
2. `origin/main`
3. `origin/master`
4. `main`
5. `master`

The script auto-detects in this order when `--branch` is given without an explicit base. If the
repository has a different default branch (e.g. `trunk`, `develop`), pass it explicitly:
`get-review-target.sh --branch origin/develop`. Detect the remote default with
`git symbolic-ref refs/remotes/origin/HEAD` when unsure.

Compare against the **merge base**, not the raw tip, so unrelated commits that landed on the base
after branching are excluded. (`git diff base...HEAD` — three-dot — uses the merge base.)

## What to exclude

Treat the following as noise. The script flags them with a `skip` flag; do not hand-review them and
do not let them inflate the diff size in your summary:

- **Lockfiles** — `package-lock.json`, `yarn.lock`, `pnpm-lock.yaml`, `Gemfile.lock`, `go.sum`,
  `Cargo.lock`, `poetry.lock`, `composer.lock`.
- **Generated code** — `*.pb.go`, `*_pb2.py`, `*.generated.*`, OpenAPI/GraphQL codegen output,
  snapshot files.
- **Vendored / third-party** — anything under `vendor/`, `node_modules/`, `third_party/`.
- **Build / distribution output** — `dist/`, `build/`, `out/`, `target/`, coverage reports.
- **Minified assets** — `*.min.js`, `*.min.css`.
- **Binaries** — images, fonts, archives, compiled artifacts (no meaningful text diff).

Still glance at lockfile changes for *unexpected* dependency additions (a supply-chain smell), but
do not line-review them.

## Handling very large diffs

If the change set is large (the script flags total lines and per-file size):

1. **Recommend splitting.** If the Pull Request mixes unrelated concerns (e.g. a refactor plus a
   feature), say so and suggest splitting — large diffs hide the important change and get rubber-stamped.
2. **Prioritize high-risk files.** Review in risk order: security-sensitive code (auth, crypto,
   input handling), concurrency, data migrations, public APIs, then the rest.
3. **Sample mechanical changes.** For large, repetitive, mechanical edits (a rename across 200
   files), review the pattern thoroughly in a few files and spot-check the rest rather than reading
   all of it.
4. **Be explicit about coverage.** State what you reviewed deeply versus sampled, so the user knows
   where the review's confidence is.

## Renames and moves

A rename shows up in `git diff` as a status `R` (with a similarity percentage) when `--find-renames`
is in effect. Review the *delta* introduced by the move, not the whole file as new. A pure move
(100% similarity) needs only a sanity check that imports/references were updated everywhere — use
Grep to confirm no stale references to the old path remain.

## Uncommitted vs committed work

- **Uncommitted (working / staged)** — the user is mid-flight; focus on correctness and design so
  they can fix before committing. Commit messages don't exist yet, so don't review them.
- **Committed (branch-vs-base / last-N)** — also assess commit hygiene where relevant (atomic
  commits, messages that explain *why*), and that the history tells a coherent story. Still review
  the *net* diff for correctness, not each intermediate commit in isolation.

## Mapping the script output to your review

The script emits JSON to stdout. Use it as the authoritative scope:

- `mode`, `base`, `head` — restate these in your review's summary so the scope is explicit.
- `total_files`, `total_added`, `total_deleted` — gauge size; trigger the large-diff handling above.
- `files[]` — each entry has `path`, `added`, `deleted`, `status` (`A`/`M`/`D`/`R`...), and `flags`.
  - Entries flagged `skip: generated/large` are excluded from line-by-line review.
  - For everything else, open the file and its callers/tests with Read/Grep before writing findings.
