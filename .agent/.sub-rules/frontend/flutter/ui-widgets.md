# Flutter — Theming, Buttons, Widgets, Scrolling, SafeArea

## Localization

- **All user-visible text via `l10n`** (e.g. `context.l10n.someKey`). Never hard-code a UI string in a widget.

## Colors & theming

- **All colors come from the theme** if the app has one wired up
  (`Theme.of(context).colorScheme.*`, `theme.textTheme.*`, or the project's
  custom theme extension). **Never hard-code `Color(0xFF...)` / `Colors.red`**
  in a widget.
- New tokens go into the theme, not into the widget. If a needed color isn't
  in the theme yet, add it to the theme (or theme extension) first, then
  reference it from the widget.
- Same for typography: use `Theme.of(context).textTheme.*` rather than
  building `TextStyle(...)` inline.

## Buttons

- **Use `UserButton` / `AppButton` only** — never bare `GestureDetector` /
  `InkWell`. Padding goes **inside** the button widget so the full visual area
  is tappable.
- **Never restyle a button by wrapping it in `Container` / `DecoratedBox`.**
  Customize via its `style` parameter (`ButtonStyle`,
  `OutlinedButton.styleFrom(...)`, theme).

## Widget choices (avoid heavy / opaque widgets)

- **Prefer `DecoratedBox` + `Padding` + `SizedBox` over `Container`.** Only use
  `Container` when you actually need ≥3 of its features at once.
- **Avoid `Stack`** unless overlap is the design intent. Reach for `Column`,
  `Row`, `Wrap`, `Flex`, or `Align` first.
- **Avoid `OverflowBox`, `Transform`, `FittedBox`, `SizedOverflowBox`** and
  similar layout-breaking widgets. Use proper constraints / `Flexible` /
  `Expanded` / `AspectRatio` instead.
- **Prefer native Flutter widgets.** Don't build a custom `Switch`, `Checkbox`,
  `Slider`, `Radio`, `ProgressIndicator`, etc. — use the framework widgets and
  theme them. Only build a custom version when the design genuinely cannot be
  achieved via the native widget.

## Scrolling

- **Never use `SingleChildScrollView`** for content lists. Use `ListView`
  (better: `ListView.builder` — lazy-builds children).
- For a page with **multiple scrollable sections** (e.g. a header + a list +
  another list), use `CustomScrollView` with slivers — not nested
  `SingleChildScrollView` / `ListView`.

## SafeArea / AppBar / Scaffold

- **Every page must be inside `SafeArea`.** `AppScaffold` already wraps its body
  in `SafeArea` — do not strip it or wrap content again. Use a plain `Scaffold`
  only when you have a specific reason, and then wrap the body in `SafeArea`
  yourself.
- **`CustomAppBar` belongs in the `appBar:` slot of `AppScaffold`** — never
  render it as a regular widget inside the body.
