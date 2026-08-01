# Flutter — No `utils` / `helpers` (mandatory)

- **Do not create `utils.dart` / `helpers.dart` / `*_utils.dart` /
  `*_helper.dart` files** stuffed with static functions. That pattern is from
  other languages and does not match idiomatic Flutter.
- If a piece of logic is **UI-local** to one widget → keep it as a **private
  method on that widget's `State` / `StatelessWidget`** (e.g. `_formatLabel`,
  `_onTap`). Don't hoist it into a global helper.
- If the logic is **domain / business** logic → it belongs in a **Bloc /
  Cubit** (or a repository). Never in a static helper called from UI.
- If it's a **pure value transformation** that's genuinely reusable (e.g.
  formatting a date for display in many widgets), put it as an **extension
  method** on the relevant type, or as a method on the model itself
  (`freezed` data class). Not as a free-standing `Utils.formatDate(...)`.
- Existing helper/utils code being touched should be migrated to one of the
  above forms when the surrounding code is edited.
