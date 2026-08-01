---
description: Run flutter analyze + flutter test for the current package.
---

Run the following and surface only failures:

```bash
rtk flutter analyze
rtk flutter test
```

If `build_runner` artifacts look stale, also run:

```bash
rtk dart run build_runner build --delete-conflicting-outputs
```

Report failures grouped by file. Do not print passing test names.
