---
name: python-helpers
description: Conventions for Python helper scripts in this repo. Stdlib-first, single-file, typed, idempotent.
---

# Python Helper Scripts

## When to write one

- Repo automation: codegen, asset processing, mass file rewrites.
- Data tasks: CSV/JSON munging, DB exports, log analysis.
- CI glue and one-off migrations.

If the task is recurring and part of dev workflow → live under
`.claude/scripts/` or `.agent/scripts/`.

## Conventions

- Python 3.11+, `from __future__ import annotations`.
- Stdlib only unless there's a clear reason. If you need a dep, document why at
  the top.
- Single file with `argparse` CLI, `if __name__ == "__main__":` guard.
- Type hints everywhere. Mypy-strict friendly.
- Format: `ruff format`. Lint: `ruff check --fix`.
- Idempotent: re-running should be safe. Use `--dry-run` flag by default for
  destructive ops.
- No `except:` — catch specific exceptions or let them bubble.
- Exit codes: `0` success, non-zero on failure.

## Clarivant

```python
#!/usr/bin/env python3
"""Short description of what this script does."""
from __future__ import annotations

import argparse
import logging
import sys
from pathlib import Path

log = logging.getLogger(__name__)


def run(path: Path, *, dry_run: bool) -> int:
    if not path.exists():
        log.error("missing: %s", path)
        return 1
    # ... work ...
    return 0


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("path", type=Path)
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("-v", "--verbose", action="store_true")
    args = parser.parse_args(argv)

    logging.basicConfig(
        level=logging.DEBUG if args.verbose else logging.INFO,
        format="%(levelname)s %(message)s",
    )
    return run(args.path, dry_run=args.dry_run)


if __name__ == "__main__":
    sys.exit(main())
```
