#!/usr/bin/env python3
"""Read the checksum for one Linux archive from Go's official downloads JSON."""

import json
import re
import sys


def checksum(downloads: list[dict], version: str, arch: str) -> str:
    filename = f"go{version}.linux-{arch}.tar.gz"
    matches = [
        item.get("sha256")
        for release in downloads
        if release.get("version") == f"go{version}"
        for item in release.get("files", [])
        if item.get("filename") == filename
        and item.get("os") == "linux"
        and item.get("arch") == arch
        and item.get("kind") == "archive"
    ]
    if len(matches) != 1 or not isinstance(matches[0], str) or not re.fullmatch(r"[0-9a-f]{64}", matches[0]):
        raise ValueError(f"missing or invalid checksum for {filename}")
    return matches[0]


if __name__ == "__main__":
    if len(sys.argv) != 4:
        raise SystemExit("usage: verify_go.py DOWNLOADS_JSON VERSION ARCH")
    with open(sys.argv[1], encoding="utf-8") as source:
        data = json.load(source)
    print(checksum(data, sys.argv[2], sys.argv[3]))
