#!/usr/bin/env python3
"""Assemble a batch-run staging dir into a tracked deck asset library.

Generic form for any deck topic:

    python3 scripts/qa/assemble.py <raw-dir> <images-dir> [shard-glob]

- <raw-dir>:    staging area the batch runner wrote PNGs into (e.g. /tmp/bb-raw)
- <images-dir>: the library the caption builder reads (e.g. decks/<slug>/images)
- [shard-glob]: optional, e.g. "decks/<slug>/shards/batch-*.txt". When given,
  `SAME-IMAGE-AS <target>` alias rows are materialized by copying the target's
  bytes (missing target or alias cycle = hard error), so the library is complete
  without anyone hand-copying alias files into the staging dir.

Copies every >50 KB PNG into the images dir (SHA-1 dedup: unchanged bytes are
not recopied) and rewrites <images-dir>/manifest.json with {file, sha1, bytes}
per asset. Existing manifest entries whose PNG is absent this run are preserved.
A batch run is NOT complete until this has run.
"""
import hashlib
import json
import shutil
import sys
from pathlib import Path
from typing import Optional

MIN_BYTES = 50_000


def resolve_aliases(raw, shard_glob):
    """Materialize SAME-IMAGE-AS rows from the shard files into raw-dir."""
    if not shard_glob:
        return
    shards = sorted(Path().glob(shard_glob))
    if not shards:
        raise SystemExit(f"shard glob matched no files: {shard_glob!r} (pass a quoted glob from the repo root)")
    alias: dict[str, str] = {}
    for shard in shards:
        for line in shard.read_text().splitlines():
            parts = line.strip().split("\t")
            if len(parts) >= 2 and parts[1].startswith("SAME-IMAGE-AS"):
                rest = parts[1][len("SAME-IMAGE-AS"):]
                if not rest.startswith(":") or len(rest) <= 1:
                    raise SystemExit(f"{shard}: malformed alias row (expected SAME-IMAGE-AS:<target>): {parts[1]!r}")
                alias[parts[0]] = rest[1:].strip()
            elif parts and parts[0] and "SAME-IMAGE-AS" in (parts[1] if len(parts) > 1 else ""):
                raise SystemExit(f"{shard}: malformed alias row (expected SAME-IMAGE-AS:<target>): {parts[1]!r}")

    def resolve(name: str, seen: tuple[str, ...]) -> str:
        target = alias.get(name)
        if target is None:
            return name
        if name in seen or target in seen:
            raise SystemExit(f"alias cycle: {' -> '.join((*seen, name, target))}")
        return resolve(target, (*seen, name))

    for name in alias:
        final = resolve(name, ())
        src = raw / f"{final}.png"
        if not src.exists():
            raise SystemExit(f"alias {name} -> {final}: {src} missing; generate {final} first")
        dst = raw / f"{name}.png"
        if not dst.exists() or hashlib.sha1(dst.read_bytes()).hexdigest() != hashlib.sha1(src.read_bytes()).hexdigest():
            shutil.copy2(src, dst)


def main() -> None:
    if len(sys.argv) not in (3, 4):
        print(__doc__)
        sys.exit(1)
    raw, dest = Path(sys.argv[1]), Path(sys.argv[2])
    shard_glob = sys.argv[3] if len(sys.argv) == 4 else None
    resolve_aliases(raw, shard_glob)
    dest.mkdir(parents=True, exist_ok=True)
    manifest = dest / "manifest.json"
    entries = json.loads(manifest.read_text()) if manifest.exists() else {}
    ok, missing = 0, []
    for png in sorted(raw.glob("*.png")):
        data = png.read_bytes()
        if len(data) < MIN_BYTES:
            missing.append((png.stem, "too small"))
            continue
        sha = hashlib.sha1(data).hexdigest()
        target = dest / png.name
        if not target.exists() or hashlib.sha1(target.read_bytes()).hexdigest() != sha:
            shutil.copy2(png, target)
        entries[png.stem] = {"file": png.name, "sha1": sha, "bytes": len(data)}
        ok += 1
    manifest.write_text(json.dumps(entries, indent=1, sort_keys=True))
    print(f"assembled {ok} images; total in manifest: {len(entries)}")
    if missing:
        print("MISSING:", missing)


if __name__ == "__main__":
    main()