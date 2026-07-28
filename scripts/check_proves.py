#!/usr/bin/env python3
"""Resolve every `Proves:` tag in the source tree against the specification.

    python3 check_proves.py docs/delivery .
    python3 check_proves.py docs/delivery src frontend --unproven

A test tagged with an anchor that does not exist proves nothing, and nothing else in the
workflow will ever notice: the tag is a comment, the test passes, the Definition of Done
row is filled in, and the rule it claims to cover is untested.

With --unproven, also reports rules in the specification that no test claims. That list is
advisory — some rules are proven by a surface diff or a walkthrough — so it never fails the
run. It is worth reading anyway; it is usually short and usually surprising.
"""

import argparse
import re
import sys
from pathlib import Path

TAG = re.compile(r"(?://|#|/\*|\*|--|;)\s*Proves:\s*([A-Za-z0-9_./-]*?)#?([a-z0-9][a-z0-9-]*)\s*$")
HEADING = re.compile(r"^#{1,6}\s+.*?\{#([a-z0-9][a-z0-9-]*)\}\s*$")
SKIP_DIRS = {".git", "node_modules", ".venv", "venv", "target", "build", "dist",
             "vendor", ".gradle", "__pycache__", ".next", "out"}
SOURCE_EXT = {".go", ".py", ".ts", ".tsx", ".js", ".jsx", ".java", ".kt", ".rs", ".rb",
              ".cs", ".swift", ".c", ".cc", ".cpp", ".h", ".hpp", ".php", ".scala", ".sh"}


def anchors(spec_root: Path) -> dict:
    found = {}
    for f in spec_root.rglob("*.md"):
        rel = str(f.relative_to(spec_root))
        if rel.startswith("work/") or "_archive" in rel:
            continue
        for line in f.read_text(encoding="utf-8", errors="replace").splitlines():
            m = HEADING.match(line)
            if m:
                found.setdefault(m.group(1), rel)
    return found


def walk(roots) -> list:
    out = []
    for root in roots:
        base = Path(root)
        if base.is_file():
            out.append(base)
            continue
        for p in base.rglob("*"):
            if any(part in SKIP_DIRS for part in p.parts):
                continue
            if p.is_file() and p.suffix in SOURCE_EXT:
                out.append(p)
    return out


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("spec_root")
    ap.add_argument("source", nargs="+", help="source directories to scan")
    ap.add_argument("--unproven", action="store_true",
                    help="also list specification rules no test claims")
    args = ap.parse_args()

    spec_root = Path(args.spec_root).resolve()
    if not spec_root.is_dir():
        print(f"error: {spec_root} is not a directory", file=sys.stderr)
        return 2

    known = anchors(spec_root)
    dangling, claimed, total = [], set(), 0

    for f in walk(args.source):
        try:
            lines = f.read_text(encoding="utf-8", errors="replace").splitlines()
        except OSError:
            continue
        for n, line in enumerate(lines, 1):
            m = TAG.search(line.rstrip())
            if not m:
                continue
            total += 1
            cited_file, anchor = m.group(1), m.group(2)
            if anchor in known:
                claimed.add(anchor)
                want = known[anchor]
                if cited_file and Path(cited_file).name not in want:
                    print(f"  warning {f}:{n} — `{anchor}` exists, but in `{want}`, "
                          f"not `{cited_file}`")
            else:
                dangling.append((f, n, cited_file, anchor))

    print(f"check_proves — {total} tag(s) across {len(args.source)} root(s)\n")
    for f, n, cited_file, anchor in dangling:
        cite = f"{cited_file}#{anchor}" if cited_file else f"#{anchor}"
        print(f"  ERROR   {f}:{n} — `{cite}` does not exist in {spec_root}. "
              f"This test claims to prove a rule that was never written.")

    if args.unproven:
        unclaimed = sorted(a for a in known if a not in claimed)
        if unclaimed:
            print(f"\n  {len(unclaimed)} rule(s) no test claims "
                  f"(advisory — some are proven by walkthrough or surface diff):")
            for a in unclaimed:
                print(f"    · {known[a]}#{a}")

    print(f"\n{len(dangling)} dangling tag(s), {len(claimed)} rule(s) claimed")
    return 1 if dangling else 0


if __name__ == "__main__":
    sys.exit(main())
