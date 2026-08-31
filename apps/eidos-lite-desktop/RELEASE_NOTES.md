## What's new

### Use standard SQLite functions in Formula fields

Formula fields now use a fixed SQLite 3.45 profile of 41 deterministic scalar
functions. The Formula editor and Runtime share the same allowlist, validation,
type inference, and autocomplete, keeping expressions portable across Eidos
Lite, Eidos File Web, and the standalone Runtime.

This release removes the earlier Eidos-only function names. Before upgrading a
file that uses them, replace `IF` with `IIF`, `IS_NULL(value)` with
`value IS NULL`, and `LOWER_ASCII` / `UPPER_ASCII` with `LOWER` / `UPPER`.
Rewrite the old date and datetime helper functions with SQLite `DATE`,
`DATETIME`, `JULIANDAY`, `UNIXEPOCH`, `STRFTIME`, or `TIMEDIFF` expressions;
date/time modifiers must be string literals.
