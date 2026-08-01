# Flutter — Sizing

- **All UI dimensions via `flutter_screen_util`** (`.w`, `.h`, `.sp`, `.r`). No raw pixel literals for sizes, paddings, radii, or font sizes.

- **Don't hard-code widget sizes when you don't have to.** Prefer layout that
  flows from constraints — `Expanded`, `Flexible`, `Wrap`, `IntrinsicWidth`,
  `FractionallySizedBox`, `AspectRatio` — over fixed `width:` / `height:`
  numbers.
- **Avoid size-dependent widgets** like `LayoutBuilder`, `MediaQuery.sizeOf`,
  `MediaQuery.of(context).size`. They couple the widget to runtime metrics,
  force extra rebuilds, and usually mean the layout is being driven by
  measurement instead of constraints. Use them **only** when there is no
  declarative alternative (e.g. real responsive breakpoints, true
  measure-then-layout cases). Default to flex / constraint widgets first.
- **`minWidth` / `maxWidth` / `minHeight` / `maxHeight` (via `BoxConstraints` /
  `ConstrainedBox`) are allowed** — they bound the layout without locking it.
  Use them to cap or floor a size when the content is still free to flex.
  **Fixed `width` / `height` are the thing to avoid** — they ignore the
  surrounding constraints and break responsiveness.
- Only set an explicit size when the design genuinely requires it (icons,
  avatars, a precise thumbnail). In that case the number must still come from
  the design system / theme spacing tokens and be expressed via
  `flutter_screen_util` (`.w` / `.h` / `.r`), never a raw pixel literal.
- Avoid `SizedBox(width: X, height: Y)` purely to "force" a layout — that's a
  signal the parent constraints are wrong; fix the parent instead.
- For **gaps / spacing**, use `Padding`, `SizedBox.shrink()` between flex
  children, `Wrap(spacing: ...)`, `Column/Row` with a `gap` (or `separated`)
  helper, or the project's spacing token — **never** a hard-coded
  `SizedBox(width: 16)` / `SizedBox(height: 24)` just to push the next widget.
  Padding is almost always the better expression of "space around this widget".
