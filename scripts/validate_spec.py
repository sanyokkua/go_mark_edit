#!/usr/bin/env python3
"""Check a Delivery Spec tree against the mechanical parts of the writing rules.

    python3 validate_spec.py docs/delivery
    python3 validate_spec.py docs/delivery --json

Exit code 1 if any error-level finding is present. Warnings do not fail.

This checks what a script can check. It cannot tell you whether a rule is *right* — for
that, read a feature file end to end and ask whether someone could build from it without
asking you anything.
"""

import argparse
import json
import re
import sys
from collections import defaultdict
from pathlib import Path

# Deferral phrases are the main way a rule stops being self-contained.
DEFER = re.compile(
    r"\b(see (?:section|the|`|\[)|as (?:defined|described|specified) in|refer to|"
    r"detail(?:s)? in|documented in|governed by|per the|according to the)\b", re.I)

# Numeric identifier namespaces this standard replaces with kebab anchors.
IDS = re.compile(r"\b(?:FR|REQ|NFR|EC|DD|SPEC|AC|UC|SC|TC|BR)-[A-Z0-9]{1,10}(?:-\d+)?\b")

VAGUE = re.compile(
    r"\b(appropriate(?:ly)?|as needed|as required|robust|user-friendly|"
    r"efficiently|reasonabl[ey]|properly|correctly handle|and/or|etc\.|"
    r"if necessary|where applicable|some kind of|various)\b", re.I)

ANCHOR = re.compile(r"\{#([a-z0-9][a-z0-9-]*)\}")
ANCHOR_REF = re.compile(r"[`(]([A-Za-z0-9_./-]+\.md)#([a-z0-9][a-z0-9-]*)")
HEADING = re.compile(r"^(#{1,6})\s+(.*)$")
FENCE = re.compile(r"^\s*```")

FEATURE_SECTIONS = ["## What it's for", "## What you can do", "## Rules",
                    "## When things go wrong", "## Edge cases", "## Not this",
                    "## Open questions"]
PHASE_SECTIONS = ["## What you get", "## Done when", "## Questions to settle first"]

MERMAID_STARTERS = ("graph", "flowchart", "sequenceDiagram", "classDiagram",
                    "stateDiagram", "stateDiagram-v2", "erDiagram", "journey",
                    "gantt", "pie", "gitGraph", "mindmap", "timeline", "quadrantChart",
                    "C4Context", "C4Container", "block-beta", "sankey-beta", "xychart-beta")


class Findings:
    def __init__(self):
        self.items = []

    def add(self, level, path, line, code, msg):
        self.items.append({"level": level, "file": str(path), "line": line,
                           "code": code, "message": msg})

    error = lambda self, *a: self.add("error", *a)
    warn = lambda self, *a: self.add("warning", *a)


def strip_code(text):
    """Blank out fenced blocks and inline code so they are not scanned as prose."""
    out, fenced = [], False
    for ln in text.splitlines():
        if FENCE.match(ln):
            fenced = not fenced
            out.append("")
            continue
        out.append("" if fenced else re.sub(r"`[^`]*`", "``", ln))
    return out


def check_mermaid(text, path, f):
    """A broken diagram renders as an error message in the middle of the document."""
    lines = text.splitlines()
    i = 0
    while i < len(lines):
        m = re.match(r"^\s*```\s*mermaid\s*$", lines[i])
        if not m:
            i += 1
            continue
        start = i + 1
        end = start
        while end < len(lines) and not re.match(r"^\s*```\s*$", lines[end]):
            end += 1
        if end >= len(lines):
            f.error(path, i + 1, "mermaid-unclosed", "mermaid block is never closed")
            return
        body = [l for l in lines[start:end] if l.strip()]
        if not body:
            f.error(path, i + 1, "mermaid-empty", "mermaid block is empty")
        else:
            first = body[0].strip()
            if not first.startswith(MERMAID_STARTERS):
                f.error(path, start + 1, "mermaid-no-type",
                        f"mermaid block starts with {first[:40]!r} — expected a diagram "
                        f"type such as flowchart, sequenceDiagram, stateDiagram-v2")
            depth = sum(l.count("[") - l.count("]") for l in body)
            if depth:
                f.warn(path, start + 1, "mermaid-brackets",
                       "unbalanced [] in the mermaid block — likely a syntax error")
            paren = sum(l.count("(") - l.count(")") for l in body)
            if paren:
                f.warn(path, start + 1, "mermaid-parens",
                       "unbalanced () in the mermaid block — likely a syntax error")
        i = end + 1


def rule_blocks(lines):
    """Yield (heading_line_no, anchor, body_lines) for each ### rule."""
    idx = [i for i, l in enumerate(lines) if l.startswith("### ")]
    for n, start in enumerate(idx):
        end = idx[n + 1] if n + 1 < len(idx) else len(lines)
        # stop at the next ## section
        for j in range(start + 1, end):
            if lines[j].startswith("## "):
                end = j
                break
        m = ANCHOR.search(lines[start])
        yield start, (m.group(1) if m else None), lines[start:end]


def check_file(path, root, f, anchors, refs):
    raw = path.read_text(encoding="utf-8", errors="replace")
    lines = raw.splitlines()
    prose = strip_code(raw)
    rel = path.relative_to(root)
    s = str(rel)

    check_mermaid(raw, rel, f)

    for i, ln in enumerate(prose, 1):
        for m in IDS.finditer(ln):
            f.error(rel, i, "numeric-id",
                    f"numeric identifier {m.group(0)!r} — use a kebab anchor such as "
                    f"`{{#session-timeout}}` instead; anchors are self-describing and "
                    f"cannot silently point at the wrong thing")
        for m in VAGUE.finditer(ln):
            f.warn(rel, i, "vague",
                   f"vague wording {m.group(0)!r} — replace with the actual value, "
                   f"string or condition")

    for m in ANCHOR.finditer(raw):
        anchors[(s, m.group(1))].append(raw[:m.start()].count("\n") + 1)
    for m in ANCHOR_REF.finditer(raw):
        refs.append((rel, raw[:m.start()].count("\n") + 1, m.group(1), m.group(2)))

    is_feature = "spec/product/" in s
    is_arch_rules = s.endswith("architecture/rules.md")
    is_constraints = s.endswith("spec/constraints.md")
    is_phase = "/plan/phase-" in s

    if is_feature:
        for sec in FEATURE_SECTIONS:
            if not any(l.strip() == sec for l in lines):
                f.error(rel, 0, "missing-section", f"feature file has no {sec!r} section")
        oq = next((i for i, l in enumerate(lines) if l.strip() == "## Open questions"), None)
        if oq is not None:
            body = [l.strip() for l in lines[oq + 1:] if l.strip()]
            body = [l for l in body if not l.startswith("#")]
            unresolved = [l for l in body
                          if not re.match(r"^[*_(<]*\s*(none|n/?a)\b", l, re.I)]
            if unresolved:
                f.warn(rel, oq + 1, "open-questions",
                       f"{len(unresolved)} open question(s) — this feature is not ready "
                       f"for story planning; resolve with the user, do not answer it "
                       f"yourself")

    if is_phase:
        for sec in PHASE_SECTIONS:
            if not any(l.strip() == sec for l in lines):
                f.error(rel, 0, "missing-section", f"phase file has no {sec!r} section")
        title = next((l for l in lines if l.startswith("# ")), "")
        if title and not re.search(r"\bI\b|\bmy\b|\byou\b", title):
            f.warn(rel, 1, "phase-title",
                   "phase title is not a sentence a user would say — "
                   'e.g. "Phase 04 — I can sign in and my notes appear on another machine"')

    if is_feature or is_arch_rules or is_constraints:
        for ln_no, anchor, body in rule_blocks(lines):
            head = lines[ln_no]
            if anchor is None:
                f.error(rel, ln_no + 1, "no-anchor",
                        f"rule {head[4:60]!r} has no {{#kebab-anchor}} — nothing can cite it")
            btxt = "\n".join(strip_code("\n".join(body)))
            if DEFER.search(btxt):
                m = DEFER.search(btxt)
                f.error(rel, ln_no + 1, "defers",
                        f"rule defers with {m.group(0)!r} — paste the value in. A "
                        f"cross-reference is an invitation to drift; a copied value is a fact")
            if is_feature or is_constraints:
                if not re.search(r"^\s*(Examples?|e\.g\.)\s*[:.]", btxt, re.M | re.I):
                    f.warn(rel, ln_no + 1, "no-examples",
                           "rule has no Examples line — EARS gives a well-formed sentence, "
                           "not numbers, and the boundary case is what otherwise ships as "
                           "an off-by-one")
                else:
                    ex = re.search(r"^\s*Examples?\s*[:.]((?:.|\n(?!\s*\n))*)",
                                   btxt, re.M | re.I)
                    if ex and len(re.split(r"\s[·|]\s|\s+-\s", ex.group(1))) < 2:
                        f.warn(rel, ln_no + 1, "one-example",
                               "only one example — include a boundary case, and state the "
                               "comparison (e.g. 'exactly 2.0 MB -> live (the check is > 2 MB)')")
            if is_arch_rules:
                if not re.search(r"^\*\*Applies to:\*\*", btxt, re.M):
                    f.error(rel, ln_no + 1, "no-applies-to",
                            "architecture rule has no '**Applies to:**' path globs — "
                            "injection into stories is a glob match, so without this the "
                            "rule reaches no story")
                if not re.search(r"^\*\*Enforced by:\*\*", btxt, re.M):
                    f.error(rel, ln_no + 1, "no-enforced-by",
                            "architecture rule has no '**Enforced by:**' — name a real "
                            "command, or the literal word 'review'. An enforcement claim "
                            "that does not run is worse than an honest gap")
                if not re.search(r"^\*Why:\*", btxt, re.M):
                    f.warn(rel, ln_no + 1, "no-why",
                           "rule has no '*Why:*' — a rule without a reason gets 'improved' "
                           "away by the next person who finds it inconvenient")
                if not re.search(r"^\*Do instead of:\*", btxt, re.M):
                    f.warn(rel, ln_no + 1, "no-do-instead",
                           "rule has no '*Do instead of:*' — naming the specific wrong call "
                           "is more effective than describing the right one twice")

    if is_feature:
        ec = next((i for i, l in enumerate(lines) if l.strip() == "## Edge cases"), None)
        if ec is not None:
            nxt = next((i for i in range(ec + 1, len(lines))
                        if lines[i].startswith("## ")), len(lines))
            block = "\n".join(lines[ec:nxt])
            triggers = len(re.findall(r"^\s*-\s*\*Trigger:\*", block, re.M))
            avoids = len(re.findall(r"^\s*-\s*\*Avoid:\*", block, re.M))
            if triggers and avoids < triggers:
                f.warn(rel, ec + 1, "edge-no-avoid",
                       f"{triggers} edge case(s) but {avoids} 'Avoid:' line(s) — every edge "
                       f"case should name the plausible wrong implementation")

        nt = next((i for i, l in enumerate(lines) if l.strip() == "## Not this"), None)
        if nt is not None:
            nxt = next((i for i in range(nt + 1, len(lines))
                        if lines[i].startswith("## ")), len(lines))
            for i in range(nt + 1, nxt):
                ln = lines[i].strip()
                if ln.startswith("- ") and len(ln) < 70 and "—" not in ln and "--" not in ln:
                    f.warn(rel, i + 1, "non-goal-no-reason",
                           "non-goal has no reason — without one it gets reopened every "
                           "third conversation")


LEGACY_PATH = re.compile(r"\b\d{2}_[A-Za-z][A-Za-z_]*/[A-Za-z0-9_.-]+\.(?:md|html|yaml|yml)\b")


def check_tree(root, files, f):
    """Checks that need the whole tree rather than one file at a time."""

    # --- references to paths that existed before a conversion moved the tree ---
    for p in files:
        rel = p.relative_to(root)
        if "_archive" in str(rel):
            continue
        for n, ln in enumerate(p.read_text(encoding="utf-8", errors="replace").splitlines(), 1):
            for hit in LEGACY_PATH.findall(ln):
                f.error(rel, n, "dead-path",
                        f"`{hit}` is a pre-conversion path and resolves nowhere — rewrite it "
                        f"or delete the sentence if the content moved into a rule")

    # --- the same section body repeated across many files is boilerplate ---
    for section in ("## Open questions", "## Not this", "## Edge cases"):
        bodies = defaultdict(list)
        for p in files:
            if "/spec/" not in str(p):
                continue
            m = re.search(rf"^{re.escape(section)}\s*$(.*?)(?:^## |\Z)",
                          p.read_text(encoding="utf-8", errors="replace"), re.M | re.S)
            if m:
                body = " ".join(m.group(1).split())
                if len(body) > 20:
                    bodies[body].append(p.relative_to(root))
        for body, where in bodies.items():
            if len(where) >= 3:
                f.warn(where[0], 0, "boilerplate",
                       f"{len(where)} files share an identical `{section}` body — that is "
                       f"boilerplate, not thinking, and it passes every other check here. "
                       f"Also in: {', '.join(str(w) for w in where[1:4])}"
                       + (" …" if len(where) > 4 else ""))

    # --- the revision marker ---
    if not (root / ".delivery-spec").is_file():
        f.warn(Path(".delivery-spec"), 0, "no-revision-marker",
               "no `.delivery-spec` file — nothing records which revision of the standard "
               "this tree was built to, so a later upgrade cannot tell what is missing")

    # --- files the current revision expects ---
    for rel, why in (
        ("WORKFLOW.md",
         "nothing tells a reader which command to run when, or what to do with what it "
         "produced — the process ends up living only inside files written for agents"),
        ("architecture/release.md",
         "build, packaging, signing and CI have no normative home, so that material ends "
         "up in a stale README or archived during a conversion"),
    ):
        if not (root / rel).is_file():
            f.warn(Path(rel), 0, "missing-file", why)

    # --- stories must declare whether they are buildable ---
    for p in sorted((root / "work").glob("story-*.md")) if (root / "work").is_dir() else []:
        text = p.read_text(encoding="utf-8", errors="replace")
        if not re.search(r"^\*\*STATUS:\*\*", text, re.M):
            f.error(p.relative_to(root), 2, "no-status",
                    "no `**STATUS:**` line — nothing can tell a stub from a planned story, "
                    "so /build-story cannot refuse one")
        sec = re.search(r"^## Rules this story owns\s*$(.*?)(?:^## |\Z)", text, re.M | re.S)
        if sec:
            bare = len(re.findall(r"^\s*[-*]\s*`[^`]+#[a-z0-9-]+`\s*$", sec.group(1), re.M))
            total = len(re.findall(r"^\s*[-*]\s+\S", sec.group(1), re.M))
            if total and bare / total > 0.5:
                f.error(p.relative_to(root), 0, "bare-anchor-stub",
                        f"{bare} of {total} bullets are a bare anchor with no prose — "
                        f"neither a person nor an agent can judge the slicing from that, "
                        f"and it hides how big the story really is")


def main():
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("root", nargs="?", default="docs/delivery")
    ap.add_argument("--json", action="store_true")
    ap.add_argument("--quiet", action="store_true", help="errors only")
    args = ap.parse_args()

    root = Path(args.root).resolve()
    if not root.exists():
        print(f"error: {root} does not exist", file=sys.stderr)
        return 2

    f = Findings()
    anchors = defaultdict(list)
    refs = []
    files = sorted(p for p in root.rglob("*.md") if "/archive/" not in str(p))

    for p in files:
        check_file(p, root, f, anchors, refs)

    for (fname, a), lns in anchors.items():
        if len(lns) > 1:
            f.error(Path(fname), lns[1], "duplicate-anchor",
                    f"anchor {{#{a}}} is defined {len(lns)} times in this file "
                    f"(lines {', '.join(map(str, lns))}) — a citation cannot resolve")

    known = {(fn.rsplit("/", 1)[-1], a) for fn, a in anchors}
    for rel, ln, target, anchor in refs:
        if (target.rsplit("/", 1)[-1], anchor) not in known:
            f.warn(rel, ln, "dangling-ref",
                   f"cites {target}#{anchor} — no such anchor was found in the tree")

    check_tree(root, files, f)

    for p in root.rglob("*.html"):
        txt = p.read_text(encoding="utf-8", errors="replace")
        rel = p.relative_to(root)
        if "data-screen" in txt or "<html" in txt.lower():
            if "location.hash" not in txt and "hashchange" not in txt:
                f.warn(rel, 0, "surface-no-deeplink",
                       "surface artifact has no hash deep-linking — no rule can cite a "
                       "state, which is most of what a mockup is for")
            for tag in ("</html>", "</body>"):
                if tag not in txt.lower():
                    f.error(rel, 0, "html-unclosed", f"missing {tag}")

    if args.json:
        print(json.dumps({"root": str(root), "files": len(files),
                          "findings": f.items}, indent=2))
        return 1 if any(i["level"] == "error" for i in f.items) else 0

    errs = [i for i in f.items if i["level"] == "error"]
    warns = [i for i in f.items if i["level"] == "warning"]
    shown = errs if args.quiet else errs + warns

    by_file = defaultdict(list)
    for i in shown:
        by_file[i["file"]].append(i)

    print(f"Delivery Spec validation — {root}")
    print(f"{len(files)} markdown files · {len(errs)} error(s) · {len(warns)} warning(s)\n")

    for fn in sorted(by_file):
        print(fn)
        for i in sorted(by_file[fn], key=lambda x: x["line"]):
            mark = "ERROR " if i["level"] == "error" else "warn  "
            loc = f":{i['line']}" if i["line"] else ""
            print(f"  {mark}{loc:<6} [{i['code']}] {i['message']}")
        print()

    if not shown:
        print("Clean.\n")

    print("This checks what a script can check. Now read one feature file, one rule set and")
    print("one phase end to end, and ask whether someone could build from them without")
    print("asking you anything.")
    return 1 if errs else 0


if __name__ == "__main__":
    sys.exit(main())
