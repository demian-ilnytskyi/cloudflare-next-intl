# Flutter — Models

## Models / JSON

- **Use `freezed` + `json_serializable` for all models.** Do not hand-roll
  `fromJson` / `toJson` / `copyWith` / `==` / `hashCode`.
- Map mismatched field names with annotations (`@JsonKey(name: 'example_field')`,
  `@JsonKey(fromJson: ..., toJson: ...)`, `@JsonValue(...)` on enums) —
  **never override the whole `fromJson` / `toJson` method**.
- Run `dart run build_runner build --delete-conflicting-outputs` after model
  changes.
