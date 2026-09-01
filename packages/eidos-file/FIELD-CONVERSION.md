# Eidos File field conversion standard

Field conversion is an atomic schema operation. The Runtime preflights the
complete stored value domain, classifies the operation, and either commits the
entire conversion or leaves the Field, rows, and File revision unchanged.

## Editor conversion matrix

The matrix is source row to destination column:

- `✓` means the editor offers the route. Runtime still scans the complete value
  domain and rejects invalid values, nullability conflicts, or blocked
  dependencies.
- `⚠` means the route is offered and may be explicitly lossy. It succeeds only
  after preflight reports the exact impact and the user confirms it.
- `•` is already the same type, so no conversion is needed.
- `—` means the editor does not offer the route.

| From → To    | Text | Number | Integer | Checkbox | Select | Multi-select | Rating | Date | Date & time | URL |
| ------------ | :--: | :----: | :-----: | :------: | :----: | :----------: | :----: | :--: | :---------: | :-: |
| Text         |  •   |   ✓    |    ✓    |    ✓     |   ✓    |      ✓       |   ✓    |  ✓   |      ✓      |  ✓  |
| Number       |  ✓   |   •    |    ⚠    |    ⚠     |   ✓    |      —       |   ⚠    |  —   |      —      |  —  |
| Integer      |  ✓   |   ⚠    |    •    |    ⚠     |   ✓    |      —       |   ✓    |  —   |      —      |  —  |
| Checkbox     |  ✓   |   ✓    |    ✓    |    •     |   ✓    |      —       |   ✓    |  —   |      —      |  —  |
| Select       |  ✓   |   ✓    |    ✓    |    ✓     |   •    |      ✓       |   ✓    |  ✓   |      ✓      |  ✓  |
| Multi-select |  ✓   |   —    |    —    |    —     |   ⚠    |      •       |   —    |  —   |      —      |  —  |
| Rating       |  ✓   |   ✓    |    ✓    |    ⚠     |   ✓    |      —       |   •    |  —   |      —      |  —  |
| Date         |  ✓   |   —    |    —    |    —     |   ✓    |      —       |   —    |  •   |      ✓      |  ✓  |
| Date & time  |  ✓   |   —    |    —    |    —     |   ✓    |      —       |   —    |  ⚠   |      •      |  ✓  |
| URL          |  ✓   |   —    |    —    |    —     |   ✓    |      —       |   —    |  ✓   |      ✓      |  •  |

The following fields intentionally stay outside the general Type conversion
control:

| Field                                | General source | General destination | Change it through                                   |
| ------------------------------------ | :------------: | :-----------------: | --------------------------------------------------- |
| File                                 |       —        |          —          | Create a File field and move attachments explicitly |
| Relation                             |       —        |          —          | The dedicated Relation definition flow              |
| Formula                              |       —        |          —          | The Formula editor and its declared result type     |
| Lookup / rollup                      |       —        |          —          | The Lookup editor and aggregate settings            |
| Row ID / Created time / Updated time |       —        |          —          | System-managed fields are immutable                 |

`Rating` is an Integer presentation in the Eidos File format. The editor keeps
it in the matrix because users select it as a field presentation; conversion
to Rating additionally requires every resulting value to be a whole number
from 0 through 5.

## Classification and safety

- `metadata-only`: logical stored values do not change. Text, Select, and URL
  share nullable SQLite `TEXT` column DDL; a compatible conversion reuses that
  physical column. Converting into URL still validates every value first.
- `lossless-rewrite`: values or SQLite constraints change without losing
  information. Examples include Text to Number, Date to Date & time, and
  Select to Multi-select.
- `explicit-lossy`: the default product policy would discard or round
  information. The UI must disclose this and send `confirmLossy: true` only
  after the user confirms.
- `forbidden`: at least one value is invalid, the route is unsupported, or a
  dependency blocks the change. No mutation or revision increment is allowed.

Default lossy policies are explicit and shared by Runtime adapters:

- Number to Rating/Integer uses round-to-nearest, ties-to-even.
- Integer/Rating to Number may round values outside exact binary64 range.
- Number/Integer/Rating to Checkbox maps zero to false and nonzero to true.
- Date & time to Date keeps the UTC calendar date and discards time.
- Multi-select to Select keeps the first option; an empty list becomes `NULL`.
- JSON literal `null` can become SQL `NULL`; scalar-to-list conversion maps SQL
  `NULL` to an empty list.

Text-to-Number accepts only canonical inverse binary64 spellings: whitespace,
noncanonical leading zeroes, infinities, and partially numeric strings fail.
Text-to-Checkbox accepts lowercase `true` or `false`. Dates and instants must be
canonical, URLs must be valid URI-references, and Rating values must be within
0–5 before any approved rounding. Select option inference is bounded to 1,000
distinct choices.

## Performance contract

The Eidos Lite performance gate uses independent file copies so conversions do
not warm or mutate one another. It covers every editor algorithm family at
100,000 rows and representative million-row boundaries:

- Text/Select metadata conversion at 1m rows: at most 3 seconds.
- Text/Select/URL shared-column conversion: at most 3 seconds, including full
  URL validation where required.
- Lossless 100k physical rewrite: at most 15 seconds.
- Confirmed lossy 100k physical rewrite: at most 20 seconds.
- Representative 1m physical rewrite: at most 60 seconds.
- Invalid 100k value domain rejection: at most 3 seconds.
- Unsupported File conversion guard: at most 200 milliseconds.

Fixture construction is excluded from user-visible timings. Every successful
case verifies the original row count and resulting Field type; every rejected
case verifies an error and relies on Runtime atomicity tests for unchanged data
and revision.
