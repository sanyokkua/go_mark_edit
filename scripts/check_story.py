#!/usr/bin/env python3
"""Check one story against the specification it was written from.

    python3 check_story.py docs/delivery 058
    python3 check_story.py docs/delivery 058 --quiet

Every check here exists because the corresponding step is *described* as mechanical but is
actually performed by a human or an agent retyping things, and nothing downstream can tell
the difference.

  1. Is it still a stub?          — a stub built by mistake becomes invented requirements.
  2. Do the copied rules match?   — a table copied with 10 of 23 rows produces code missing
                                    exactly those 13 rows, and every later check passes.
  3. Are the architecture rules   — a glob of `**` cannot fail to match. If it is absent
     that match actually present?   from the story, the match was never computed.
  4. Do all the anchors resolve?  — an invented anchor is a test that proves nothing.
  5. Is the story too big?        — an oversized story is built as most-of-a-story.

Exit code 1 if there are errors, 0 otherwise. Warnings never fail the run.
"""

import argparse
import re
import sys
from pathlib import Path

HEADING = re.compile(r"^(#{1,6})\s+(.*?)(?:\s*\{#([a-z0-9][a-z0-9-]*)\})?\s*$")
# Backticks around the path are optional — trees written by earlier revisions omit them.
PROVENANCE = re.compile(
    r"^\*\(\s*(?:from\s+)?`?([A-Za-z0-9_./-]+?\.md)#([a-z0-9][a-z0-9-]*)`?"
    r"(?:\s*[—–-]\s*copied verbatim)?\s*\)\*\s*$", re.I)
# The section holding the rules a story owns has gone by two names.
OWNED_SECTION = ("## What must be true when this is done", "## Rules this story owns")
ENFORCED_PROV = re.compile(r"^\*\(\s*enforced by\s+.*\)\*\s*$", re.I)
APPLIES = re.compile(r"^\*\*Applies to:\*\*\s*(.+?)\s*$", re.M)
ANCHOR_REF = re.compile(r"`([A-Za-z0-9_./-]+\.md)#([a-z0-9][a-z0-9-]*)`")
TABLE_ROW = re.compile(r"^\s*\|.*\|\s*$")
STUB = re.compile(r"^\*\*STATUS:\*\*\s*stub", re.M | re.I)
SIZE_CEILING = 5


# --------------------------------------------------------------------------- globs

def glob_to_re(pat: str) -> re.Pattern:
    """Translate a path glob to a regex. Handles ** (any depth), * (one segment), ?."""
    pat = pat.strip().strip("`").rstrip("/")
    if not pat:
        return re.compile(r"(?!)")
    out, i = [], 0
    while i < len(pat):
        c = pat[i]
        if pat.startswith("**/", i):
            out.append(r"(?:.*/)?"); i += 3
        elif pat.startswith("**", i):
            out.append(r".*"); i += 2
        elif c == "*":
            out.append(r"[^/]*"); i += 1
        elif c == "?":
            out.append(r"[^/]"); i += 1
        else:
            out.append(re.escape(c)); i += 1
    return re.compile(r"^" + "".join(out) + r"$")


def split_globs(raw: str) -> list:
    """`Applies to:` may hold several globs separated by comma, middot, or 'and'."""
    raw = re.sub(r"\s+and\s+", "·", raw)
    parts = re.split(r"[,·;]|\s{2,}", raw)
    return [p.strip().strip("`") for p in parts if p.strip().strip("`")]


# --------------------------------------------------------------------------- blocks

def blocks(text: str) -> list:
    """Every heading with an explicit {#anchor}, and the body up to the next heading of the
    same or higher level. Returns [(level, title, anchor, body_lines, start_line)]."""
    lines = text.splitlines()
    heads = []
    fenced = False
    for n, line in enumerate(lines):
        if line.lstrip().startswith("```"):
            fenced = not fenced
            continue
        if fenced:
            continue
        m = HEADING.match(line)
        if m:
            heads.append((n, len(m.group(1)), m.group(2).strip(), m.group(3)))
    out = []
    for idx, (n, lvl, title, anchor) in enumerate(heads):
        if not anchor:
            continue
        end = len(lines)
        for n2, lvl2, _, _ in heads[idx + 1:]:
            if lvl2 <= lvl:
                end = n2
                break
        out.append((lvl, title, anchor, lines[n + 1:end], n + 1))
    return out


def normalise(body_lines: list) -> list:
    """Drop provenance lines, comments and blank lines; strip trailing space."""
    out = []
    for ln in body_lines:
        s = ln.rstrip()
        if not s.strip():
            continue
        if PROVENANCE.match(s.strip()) or ENFORCED_PROV.match(s.strip()):
            continue
        if s.strip().startswith("<!--"):
            continue
        out.append(s.strip())
    return out


def rows(body_lines: list) -> int:
    """Table rows, excluding header separators."""
    return sum(1 for ln in body_lines
               if TABLE_ROW.match(ln) and not re.match(r"^\s*\|[\s:|-]+\|\s*$", ln))


# --------------------------------------------------------------------------- checks

class Report:
    def __init__(self):
        self.errors, self.warnings, self.notes = [], [], []

    def error(self, m): self.errors.append(m)
    def warn(self, m): self.warnings.append(m)
    def note(self, m): self.notes.append(m)


def resolve(spec_root: Path, cited: str) -> Path:
    """A citation like `spec/product/x.md`, `product/x.md`, `../spec/product/x.md`, or a
    repo-relative `docs/delivery/spec/product/x.md`."""
    cited = cited.lstrip("./")
    # Strip a repo-relative prefix that duplicates the spec root.
    tail = spec_root.name
    if f"/{tail}/" in f"/{cited}":
        cited = cited.split(f"{tail}/", 1)[1]
    for prefix in ("", "spec/", "spec/product/", "spec/surface/", "architecture/"):
        p = spec_root / (prefix + cited)
        if p.is_file():
            return p
    # last resort: match on filename anywhere under the tree
    name = Path(cited).name
    hits = [p for p in spec_root.rglob(name) if p.is_file()]
    return hits[0] if len(hits) == 1 else None


def check(spec_root: Path, story: Path, rep: Report, code_roots=()) -> None:
    text = story.read_text(encoding="utf-8")

    # ---- 8. a supersede that was announced but never performed --------------
    m = SUPERSEDED.search(text)
    if m:
        target = m.group(1)
        hits = sorted((story.parent).glob(f"story-{target}-*.md"))
        if not hits:
            rep.error(f"marked as folded into STORY-{target}, but no such story file exists.")
        else:
            owned_here = owned_anchors(text)
            owned_there = owned_anchors(hits[0].read_text(encoding="utf-8", errors="replace"))
            lost = sorted(owned_here - owned_there)
            if lost:
                rep.error(
                    f"marked as folded into STORY-{target}, but {len(lost)} rule(s) it owns "
                    f"do not appear in {hits[0].name}: {', '.join('#' + a for a in lost)}. "
                    f"A supersede that does not move the rules leaves them owned by nobody "
                    f"buildable \u2014 the phase looks covered and is not.")

    # ---- 1. stub -----------------------------------------------------------
    if STUB.search(text):
        rep.error(f"{story.name} is still marked `**STATUS:** stub`. "
                  f"Run /plan-story to expand it; /build-story must refuse it.")
        return

    if not any(s in text for s in OWNED_SECTION):
        rep.error("missing section: " + " (or) ".join(OWNED_SECTION))
    for section in ("## Technical constraints",
                    "## Where the code goes",
                    "## Definition of done"):
        if section not in text:
            rep.error(f"missing section: {section}")

    story_blocks = blocks(text)
    body_by_anchor = {a: b for _, _, a, b, _ in story_blocks}

    # ---- 2. copied rules match their source --------------------------------
    lines = text.splitlines()
    copied = 0
    for lvl, title, anchor, body, start in story_blocks:
        prov = next((PROVENANCE.match(ln.strip()) for ln in body[:3]
                     if PROVENANCE.match(ln.strip())), None)
        if not prov:
            continue
        copied += 1
        cited_file, cited_anchor = prov.group(1), prov.group(2)
        src = resolve(spec_root, cited_file)
        if src is None:
            rep.error(f"#{anchor}: source `{cited_file}` not found under {spec_root}")
            continue
        srcblocks = {a: b for _, _, a, b, _ in blocks(src.read_text(encoding="utf-8"))}
        if cited_anchor not in srcblocks:
            rep.error(f"#{anchor}: `{cited_file}#{cited_anchor}` does not exist in the source")
            continue

        want, got = normalise(srcblocks[cited_anchor]), normalise(body)
        wrows, grows = rows(srcblocks[cited_anchor]), rows(body)

        if want == got:
            rep.note(f"#{anchor}: exact ({len(want)} lines"
                     + (f", {wrows} table rows" if wrows else "") + ")")
            continue

        if grows < wrows:
            rep.error(
                f"#{anchor}: TABLE TRUNCATED — source has {wrows} rows, the story has "
                f"{grows}. The {wrows - grows} missing row(s) will not be built, and no "
                f"check after this point can see that.")
        missing = [w for w in want if w not in got]
        extra = [g for g in got if g not in want]
        if missing:
            rep.error(f"#{anchor}: {len(missing)} line(s) in the source are not in the copy "
                      f"({len(want)} → {len(got)} lines). First: {missing[0][:90]!r}")
        if extra and not missing:
            rep.warn(f"#{anchor}: {len(extra)} line(s) in the copy are not in the source — "
                     f"the rule was reworded. Copies are exact; fix the source instead. "
                     f"First: {extra[0][:90]!r}")

    if copied == 0:
        rep.error("no rule carries a `*(from `file#anchor` — copied verbatim)*` line. "
                  "Rules must be copied in, not cited.")

    # ---- 3. size -----------------------------------------------------------
    owned = None
    for s in OWNED_SECTION:
        owned = re.search(rf"^{re.escape(s)}\s*$(.*?)^## ", text, re.M | re.S) or owned
    if owned:
        n = len(re.findall(r"^###\s", owned.group(1), re.M))
        if n > SIZE_CEILING:
            rep.warn(f"the story owns {n} rules (ceiling is {SIZE_CEILING}). An oversized "
                     f"story is built as most-of-a-story; propose a split.")

    # ---- 4. architecture injection is complete -----------------------------
    paths = []
    where = re.search(r"^## Where the code goes\s*$(.*?)(?:^## |\Z)", text, re.M | re.S)
    if where:
        paths = [m for m in re.findall(r"`([^`]+)`", where.group(1))
                 if "/" in m or "." in m]
    rules_file = spec_root / "architecture" / "rules.md"
    if rules_file.is_file() and paths:
        rtext = rules_file.read_text(encoding="utf-8")
        injected = set()
        tc = re.search(r"^## Technical constraints\s*$(.*?)(?:^## |\Z)", text, re.M | re.S)
        if tc:
            injected = {a for _, _, a, _, _ in blocks("# x\n" + tc.group(1))}
            injected |= set(re.findall(r"\{#([a-z0-9][a-z0-9-]*)\}", tc.group(1)))
        for _, title, anchor, body, _ in blocks(rtext):
            m = APPLIES.search("\n".join(body))
            if not m:
                continue
            globs = split_globs(m.group(1))
            hits = [p for p in paths for g in globs if glob_to_re(g).match(p.lstrip("./"))]
            universal = any(g.strip() in ("**", "**/*", "*") for g in globs)
            if (hits or universal) and anchor not in injected:
                why = ("its glob is universal (`**`) and matches every path"
                       if universal and not hits else f"it matches `{hits[0]}`")
                rep.error(
                    f"architecture rule `#{anchor}` was NOT injected, but {why}. "
                    f"A matched rule the implementer never sees is a rule nothing enforces.")

    # ---- 5. every anchor referenced resolves --------------------------------
    known = {}
    for f in spec_root.rglob("*.md"):
        if "/work/" in str(f) or "/_archive" in str(f):
            continue
        for _, _, a, _, _ in blocks(f.read_text(encoding="utf-8", errors="replace")):
            known.setdefault(a, f)
    for cited_file, cited_anchor in ANCHOR_REF.findall(text):
        if cited_anchor not in known and cited_anchor not in body_by_anchor:
            rep.error(f"dangling reference `{cited_file}#{cited_anchor}` — that anchor does "
                      f"not exist anywhere in {spec_root}")

    # ---- 6. definition of done ----------------------------------------------
    dod = re.search(r"^### This story.*?$(.*?)(?:^### |\Z)", text, re.M | re.S)
    if dod:
        body = dod.group(1)
        rowlines = [l for l in body.splitlines()
                    if TABLE_ROW.match(l) and not re.match(r"^\s*\|[\s:|-]+\|\s*$", l)]
        real = [l for l in rowlines if "<" not in l and "Proven by" not in l]
        if not real:
            rep.error("the Definition-of-Done rule-to-test table has no filled rows.")
        for l in real:
            if not re.search(r"`[^`]+`\s*\|\s*`[^`]+`", l):
                rep.warn(f"DoD row names no concrete test: {l.strip()[:80]}")
    else:
        rep.warn("no `### This story` rule-to-test table found in the Definition of done.")

    # ---- 7. values an owned rule depends on, that nothing provides -----------
    for tok, why in unresolved_tokens(text, code_roots):
        rep.error(f"`{tok}` is used by a rule this story owns, but {why}. The implementer "
                  f"cannot build the rule without inventing a value \u2014 own the rule that "
                  f"defines it, or depend on a story that has shipped it.")


CSS_TOKEN = re.compile(r"--[a-z][a-z0-9-]*")
TOKEN_DEF_ROW = re.compile(r"^\s*\|\s*`?(--[a-z][a-z0-9-]*)`?\s*\|")
SUPERSEDED = re.compile(
    r"^\*\*STATUS:\*\*.*?(?:folded into|re-?planned as|superseded by)\s+STORY-(\d+)",
    re.M | re.I)


def owned_anchors(text):
    for s in OWNED_SECTION:
        m = re.search(rf"^{re.escape(s)}\s*$(.*?)(?:^## |\Z)", text, re.M | re.S)
        if m:
            body = m.group(1)
            out = set(re.findall(r"\{#([a-z0-9][a-z0-9-]*)\}", body))
            out |= set(re.findall(r"`[^`]*\.md#([a-z0-9][a-z0-9-]*)`", body))
            return out
    return set()


def unresolved_tokens(text, code_roots):
    section = None
    for s in OWNED_SECTION:
        m = re.search(rf"^{re.escape(s)}\s*$(.*?)(?:^## How it works now|^## Technical|"
                      rf"^## Where the code|^## Implementation|\Z)", text, re.M | re.S)
        if m:
            section = m.group(1); break
    if not section:
        return []
    used = set(CSS_TOKEN.findall(section))
    if not used:
        return []
    defined = {m.group(1) for m in
               (TOKEN_DEF_ROW.match(l) for l in section.splitlines()) if m}
    families = {f.rstrip("*") for f in re.findall(r"`(--[a-z][a-z0-9-]*\*)`", section)}
    families |= {f[:-1] for f in re.findall(r"--[a-z][a-z0-9-]*-(?=\*)", section)}
    in_code = set()
    for root in code_roots:
        base = Path(root)
        if not base.exists():
            continue
        files = [base] if base.is_file() else [
            q for q in base.rglob("*")
            if q.is_file() and q.suffix in {".css", ".scss", ".less", ".ts", ".tsx",
                                            ".js", ".jsx", ".html", ".vue", ".svelte"}
            and not any(x in q.parts for x in ("node_modules", "dist", "build", ".git"))]
        for q in files:
            try:
                body = q.read_text(encoding="utf-8", errors="replace")
            except OSError:
                continue
            for tok in used - in_code:
                if re.search(re.escape(tok) + r"\s*:", body):
                    in_code.add(tok)
    out = []
    for tok in sorted(used):
        if tok in defined or tok in in_code:
            continue
        if any(tok.startswith(f) for f in families):
            continue
        out.append((tok, "no rule in this story defines its value and it does not exist in "
                         "the code" if code_roots else
                         "no rule in this story defines its value (pass --code to check code)"))
    return out


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("spec_root", help="e.g. docs/delivery")
    ap.add_argument("story", help="story number, e.g. 058, or a path to the file")
    ap.add_argument("--quiet", action="store_true", help="errors only")
    ap.add_argument("--code", nargs="*", default=[],
                    help="source dirs, to check a value the story does not define")
    args = ap.parse_args()

    spec_root = Path(args.spec_root).resolve()
    if not spec_root.is_dir():
        print(f"error: {spec_root} is not a directory", file=sys.stderr)
        return 2

    if Path(args.story).is_file():
        story = Path(args.story)
    else:
        num = args.story.upper().replace("STORY-", "").strip()
        hits = sorted((spec_root / "work").glob(f"story-{num}-*.md"))
        if not hits:
            print(f"error: no story file matching story-{num}-*.md under {spec_root}/work",
                  file=sys.stderr)
            return 2
        if len(hits) > 1:
            print(f"error: {len(hits)} files match story-{num}-*: "
                  + ", ".join(h.name for h in hits), file=sys.stderr)
            return 2
        story = hits[0]

    rep = Report()
    check(spec_root, story, rep, args.code)

    print(f"check_story — {story.name}\n")
    for m in rep.errors:
        print(f"  ERROR   {m}")
    for m in rep.warnings:
        print(f"  warning {m}")
    if not args.quiet:
        for m in rep.notes:
            print(f"  ok      {m}")
    print(f"\n{len(rep.errors)} error(s), {len(rep.warnings)} warning(s)")
    if rep.errors:
        print("\nDo not build this story until the errors above are resolved.")
    return 1 if rep.errors else 0


if __name__ == "__main__":
    sys.exit(main())
