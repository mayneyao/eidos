---
title: "Eidos Standard Views 1.0"
description: "Canonical Eidos Standard Views 1.0 specification."
sidebar:
  order: 45
---

> **Source status:** This page is generated from the canonical English specification in the Eidos repository.

Status: Final Eidos Standard
Version: 1.0
Published: 2026-08-23
Editor and change controller: Eidos Project
Canonical language: English

## Abstract

Eidos Standard Views 1.0 defines the five built-in View types shared by Eidos
UI implementations: Grid, Gallery, Kanban, Calendar, and Form. It owns their
persisted layout meaning, defaults, renderer-specific configuration, and
View-specific interaction requirements.

This document is a normative companion to
[Eidos UI 1.0](/specifications/ui-1-0/). It does not introduce another product layer
or another conformance label. Eidos UI owns the common RuntimeClient,
HostServices, state, editing, accessibility, and renderer-isolation contract;
this document specializes that contract for built-in Views.

## 1. Status and normative language

This English document is normative. The
[Chinese reference](/zh-cn/specifications/standard-views-1-0/) is informative.

The key words **MUST**, **MUST NOT**, **REQUIRED**, **SHALL**, **SHALL NOT**,
**SHOULD**, **SHOULD NOT**, **RECOMMENDED**, **NOT RECOMMENDED**, **MAY**, and
**OPTIONAL** are interpreted as BCP 14 terms only when written in capitals.

Examples and rationale marked informative are not requirements. JSON schemas,
default values, applicability tables, algorithms, and conformance vectors in
this document are normative.

## 2. Scope, ownership, and conformance

A **standard View** is a View whose saved `type` is exactly `grid`, `gallery`,
`kanban`, `calendar`, or `form`.

The lower layers retain their existing ownership:

- Eidos File Format owns the `eidos__views` row and canonical JSON storage;
- Eidos Runtime owns stable Field identity, logical types, saved-query
  semantics, row and View mutations, revision checking, groups, and
  aggregates;
- Eidos Adapter owns platform, persistence, asset, and publication behavior;
  and
- Eidos UI and this document own layout interpretation and presentation-layer
  interaction.

This document does not define publishing, public URLs, authentication,
passwords, remote Form submission, abuse controls, attachment transfer, or
response collection. A service MAY consume a View as immutable input, but its
network and storage behavior belongs to a separate service contract.

No `EU-Views` or per-View conformance label exists. The existing Eidos UI
labels incorporate this document as follows:

| Label           | Standard Views requirement                                                                                                                                              |
| --------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `EU-Viewer-1.0` | render all five standard View types, including a read-only Form Preview, and implement the common preservation, bounded-read, accessibility, and compatibility behavior |
| `EU-Editor-1.0` | all Viewer requirements plus all standard View configuration, Form Builder editing with existing eligible Fields, and revision-checked View mutation                    |
| `EU-Schema-1.0` | all Editor requirements plus Form question creation through schema preflight and schema mutation                                                                        |

A headless tool MAY create conforming standard View metadata without claiming
a UI label, provided it writes through a conforming revision-checked Runtime
View mutation.

## 3. Common saved representation

### 3.1 Ownership and preservation

`ViewDescriptor` exposes `type`, canonical `query`, and canonical `layout`.
This document owns the meaning of known standard-View layout keys. Runtime
treats unknown layout members as opaque canonical metadata.

A UI updating one known key MUST preserve every unknown member and every known
member it did not update. It MAY send a Runtime-supported member patch or merge
the change into the latest object under `expectedRevision`; it MUST NOT parse
and rewrite a stale copy.

The five standard types share one layout envelope. A known key not applicable
to the current type is preserved and ignored. This allows an explicit type
change and reversal without losing layout intent.

View configuration has two independent classifications. `query.filter` and
`query.sort` are common functional configuration whose row-set semantics are
owned by Runtime. Layout keys are either common or renderer-specific. A
renderer-specific key can select a Runtime operation, but remains a layout
recipe: generated groups, aggregates, rows, and resolved values MUST NOT be
copied into layout.

Core layout never stores Row IDs, cell or group values, resolved labels,
selection, scroll, hover, open editors, transient collapsed groups, Builder or
Preview mode, draft answers, validation errors, or completion state. Those are
Runtime results or UI state.

### 3.2 Common Field layout

| Key                   | Type                  | Read default                           | Applies to                      | Meaning                                                     |
| --------------------- | --------------------- | -------------------------------------- | ------------------------------- | ----------------------------------------------------------- |
| `fieldOrder`          | unique Field-ID array | metadata Field position, then Field ID | all standard Views              | leading-to-trailing Field or question order                 |
| `hiddenFields`        | unique Field-ID array | `[]`                                   | all standard Views              | ordinary Fields omitted from the View, never deleted        |
| `visibleSystemFields` | unique Field-ID array | `[]`                                   | Grid, Gallery, Kanban, Calendar | optional hidden system Fields explicitly shown in that View |

An ordinary Field's visibility is controlled by `hiddenFields`. An optional
system Field's visibility is controlled only by `visibleSystemFields`; placing
the same system Field in `hiddenFields` has no additional effect. Form excludes
system Fields entirely as defined in Section 9.2.

Unknown or deleted Field IDs are preserved in layout JSON but ignored during
rendering. If an ID becomes valid again, its prior layout applies. Duplicate
IDs in a core array are invalid UI output. When reading such input, UI uses the
first occurrence for rendering, preserves the original value until an explicit
layout edit, and reports an advisory diagnostic.

Every `EU-Editor-1.0` implementation provides one discoverable Fields control
for every standard View. It can show or hide every currently configurable
Field and update `fieldOrder`; it preserves unknown or deleted IDs while
editing current Fields and remains usable when the View has zero visible
Fields. For Form, this control lists only eligible inputs and additionally
supports **Show all** and **Hide all**.

### 3.3 Type changes and unavailable renderers

Changing `view.type` is an explicit revision-checked View mutation. Layout
members inapplicable to the new type remain preserved. The UI MUST NOT infer a
type change from navigation or rendering fallback.

An unknown `view.type` remains valid forward-compatible metadata. A UI without
a registered renderer MUST show the View name, unknown type, and an accessible
unsupported-renderer state. It MAY offer an ephemeral read-only Grid fallback
without changing saved type or layout. Unrelated View edits preserve the
unknown type and layout exactly in logical content.

When `ViewDescriptor.queryStatus="unsupported"`, the View remains present in
every View tab, menu, and navigation surface. UI shows an accessible
update-required state and MUST NOT issue `queryRows`, `groupRows`, aggregate,
or export requests using the `{}` query placeholder. Filter and Sort are
disabled. Rename, reorder, and layout-only patches MAY remain available if
they omit `query`. Replacing the query requires explicit user confirmation
that the newer query will be removed.

An unknown renderer and an unsupported query are independent. The UI reports
query incompatibility first because a Grid fallback would otherwise show an
incorrect row set.

## 4. Grid

### 4.1 Layout

| Key             | Type                             | Read default               | Meaning                                                               |
| --------------- | -------------------------------- | -------------------------- | --------------------------------------------------------------------- |
| `fieldWidths`   | Field-ID to number map           | `{}`; missing entry is `1` | preferred dimensionless relative width in `0.25..8`                   |
| `rowDensity`    | `compact\|standard\|comfortable` | `standard`                 | semantic row-density hint                                             |
| `freezeColumns` | non-negative integer             | `1`                        | count of leading visible Fields kept frozen, clamped to visible count |
| `columnStats`   | Field-ID to `{type}` map         | `{}`                       | per-column aggregate footer request                                   |

Grid renders visible Fields in `fieldOrder`, followed by remaining visible
Fields in metadata order. `freezeColumns` is evaluated after visibility and
ordering. Width and density tokens do not mandate pixels, a grid library, a
breakpoint, or a rendering engine.

### 4.2 Column statistics

`columnStats[*].type` is exactly one of `count-all`, `count-non-null`,
`count-distinct`, `count-empty`, `percent-checked`, `percent-unchecked`, `sum`,
`average`, `min`, `max`, `relation-value-count`, `relation-row-count`, or
`relation-distinct-target-count`.

UI enables only Runtime-compatible choices for the Field, sends the
corresponding `AggregateRequest`, and displays only a matching
revision-bearing result. Aggregate results are generated state and are never
persisted.

`percent-checked` and `percent-unchecked` apply only to Checkbox Fields. Their
denominator is every row in the active Runtime query. `percent-checked` counts
canonical true values; `percent-unchecked` counts false and SQL NULL values.
An empty result is `0`; other results are numbers in `0..100`, rounded to at
most two decimal places for display.

## 5. Shared card layout

Gallery and Kanban share these keys:

| Key               | Type                   | Read default | Meaning                                                            |
| ----------------- | ---------------------- | ------------ | ------------------------------------------------------------------ |
| `cardFields`      | unique Field-ID array  | `[]`         | ordered secondary card Fields; Record Label is always the title    |
| `coverField`      | Field ID or `null`     | `null`       | File Field or image-display URL-capable scalar Field used as cover |
| `coverFit`        | `cover\|contain`       | `cover`      | semantic cover fitting hint                                        |
| `cardSize`        | `small\|medium\|large` | `medium`     | semantic card-size hint                                            |
| `hideEmptyFields` | boolean                | `true`       | omit configured secondary Field when its logical value is empty    |

`cardFields` is secondary content and the Table Record Label is the card
title. A `cardFields` member also present in `hiddenFields` is omitted.

A `coverField` is eligible when it is a File Field, or a scalar URL Field or
scalar URL Formula/Lookup result whose Field settings declare
`display.kind="image"`. Missing, hidden, ineligible, NULL, empty, denied, or
unresolved cover values yield a non-persisted placeholder. Eligible URL covers
follow Eidos UI 1.0 image-display rules and never convert the URL into a File
entry.

Fields and Card configuration are a two-stage pipeline. Fields owns common
availability and `fieldOrder`; Card configuration owns only `cardFields`,
cover, fit, size, and empty-value handling. The Card chooser offers only
currently visible Fields. Hiding a Field in Fields always wins. Editing
available members preserves unknown or temporarily unavailable `cardFields`
members.

## 6. Gallery

Gallery uses the common Field layout in Section 3.2 and the shared card layout
in Section 5. It adds no version 1 layout key. Gallery remains interactive
through bounded Runtime pages and MUST NOT materialize the entire row set.

## 7. Kanban

### 7.1 Layout

| Key               | Type               | Read default | Meaning                                                                 |
| ----------------- | ------------------ | ------------ | ----------------------------------------------------------------------- |
| `groupField`      | Field ID or `null` | `null`       | grouping Field; `null` is incomplete configuration                      |
| `showEmptyGroups` | boolean            | `true`       | show zero-row groups from the grouping Field's canonical option catalog |

`groupField:null`, a missing Field, or a non-groupable Field produces an
accessible configuration-required state. UI MUST NOT invent a Field or group
value.

With `showEmptyGroups:false`, Kanban omits a catalog group only after Runtime
authoritatively reports zero rows for the active revision and saved query. The
option remains a valid move target; a successful move makes it visible.
Omission before counts resolve is provisional UI state and is not persisted.

### 7.2 Movement

A Kanban move is available only when `groupField` is a writable stored scalar
and Runtime supplies the destination's exact logical group value. The move is
one sparse `mutateRows` update under `expectedRevision`; UI never writes a
display label as the group value.

Formula, Lookup, inverse Relation, list, and read-only groups cannot accept a
move. Card order is Runtime query order. Dragging within a group is ephemeral
because version 1 has no manual row-order key.

## 8. Calendar

### 8.1 Layout and reading

| Key         | Type               | Read default | Meaning                                                                          |
| ----------- | ------------------ | ------------ | -------------------------------------------------------------------------------- |
| `dateField` | Field ID or `null` | `null`       | temporal Field used to place Records on days; `null` is incomplete configuration |

An eligible Field is Date, Datetime, a Formula or Lookup with one of those
display types, or the created/updated system Field. A missing, deleted,
non-temporal, or `null` `dateField` produces an accessible
configuration-required state. Records with an empty date are not placed.

Date uses its canonical `YYYY-MM-DD` day directly. Datetime is assigned using
the Editor's current local time zone. Visible month, today, expanded day, and
scroll position are transient UI state. Calendar reads compose the visible
range with saved filter and search rather than replacing either.

Host MAY provide a global first-weekday preference. Calendar uses it for both
weekday column order and requested visible range; the default is Monday. The
preference is not View layout and is never persisted in the Eidos File.

### 8.2 Record creation

For a writable stored Date or Datetime Field, every visible day exposes a
create action. Runtime creates the Record with that Field set to the selected
canonical day; Datetime uses local midnight encoded as a canonical instant.

For created or updated system Fields, only today exposes creation and Runtime
supplies the system timestamp. Formula and Lookup date Fields do not offer day
creation because their values are derived. After success, Editor opens the
standard Record inspector for the new Record.

## 9. Form

### 9.1 Saved representation

A Form View has `type="form"`, an empty Runtime `SavedViewQuery`, and a layout
interpreted by this section. The View type and this document's version identify
the contract; Form does not add a per-View profile marker.

| Key              | Type                      | Read default           | Meaning                                            |
| ---------------- | ------------------------- | ---------------------- | -------------------------------------------------- |
| `title`          | non-empty string          | saved View name        | respondent-facing title                            |
| `description`    | string or `null`          | `null`                 | respondent-facing introduction                     |
| `submitLabel`    | non-empty string          | `"Submit"`             | submit action label                                |
| `successMessage` | non-empty string          | `"Response recorded."` | success message for a submission-capable host      |
| `fields`         | unique Field-config array | `[]`                   | per-question presentation and validation overrides |

Form also uses common `fieldOrder` and `hiddenFields`. String limits are 512
UTF-8 bytes for `title`, 4,096 for `description`, 128 for `submitLabel`, and
1,024 for `successMessage`. An Editor trims surrounding whitespace and does
not emit an empty non-null string.

Each `fields` item has this shape:

```ts
interface FormFieldConfig {
  fieldId: UUIDv7
  label?: string
  description?: string
  placeholder?: string
  multiline?: boolean
  required: boolean
}
```

`fieldId` belongs to the Form's Table and is unique within the array. Limits
are 512 UTF-8 bytes for `label` and `placeholder`, and 2,048 for question
`description`. `multiline:true` is valid only for Text. Missing optional
strings mean “use renderer default,” not an empty display string.

### 9.2 Eligible inputs and effective questions

A Field is eligible only when it:

1. belongs to the Form View's Table;
2. is a writable stored source Field rather than a system or derived Field;
3. is not metadata-hidden; and
4. has logical input type Text, Number, Integer, Checkbox, Date, Datetime,
   File, Multi-select, Select, or URL.

An Integer with `settings.display.kind="rating"` renders as Rating but remains
Integer in canonical storage and Runtime mutations. JSON, Relation, Formula,
Lookup, row-ID, created-time, and updated-time Fields are not eligible in
version 1.

Effective questions are currently eligible Fields not present in
`hiddenFields`. They are ordered by `fieldOrder`, then Field metadata position,
then Field ID. A matching `fields` item supplies overrides. Otherwise:

- label is the current Field display name;
- description and placeholder are absent;
- multiline is `false`; and
- required is `true` for a non-null Field other than File or Multi-select,
  otherwise `false`.

`required:false` never weakens another non-null Field. File and Multi-select
remain configurable because their canonical empty value is `[]`, not SQL
`NULL`, even though their schema metadata has `nullable=0`. Unknown, deleted,
ineligible, or wrong-Table IDs are ignored while rendering and preserved until
an explicit edit touches the corresponding collection.

### 9.3 Builder

An editable Form opens in Builder mode by default. Builder is an inline
canvas, not a respondent submission surface and not a permanently visible
settings sidebar.

Builder provides:

- direct title and description editing on the canvas;
- ordered question cards with pointer and keyboard reordering;
- insertion between questions and after the final question;
- a chooser that adds an existing eligible hidden Field or creates a new
  eligible Table Field through schema preflight and mutation;
- contextual label, description, placeholder, required, and applicable
  multiline controls;
- hiding a question without deleting its Table Field; and
- Form-level submit-label and success-message options.

Creating a Form offers two explicit initial states:

- **Include existing fields**: all currently eligible Fields are visible in
  metadata order; and
- **Start from scratch**: every currently eligible Field ID is placed in
  `hiddenFields`, producing zero effective questions.

Creating or editing a Form uses ordinary revision-checked View and schema
mutations. UI serializes saves, surfaces conflicts, never writes SQLite
directly, and never silently retries `stale-revision`.

### 9.4 Preview

Builder and Preview use a compact, stable mode switch in the Form toolbar. The
active mode is transient UI state.

Preview renders effective questions with the same controls, required rules,
and presentation as a submission-capable renderer. Preview draft values,
validation errors, and completion state are transient.

Submitting local Preview validates the draft but MUST NOT call `mutateRows`,
create a Record, write File values, upload attachments, or change revision. A
host supporting real response submission exposes it as a separate capability
and interaction context; that protocol is outside this specification.

### 9.5 Schema evolution

Form references stable Field IDs. Renaming updates the default label without
breaking a question; a custom label remains unchanged.

The effective-question algorithm is re-evaluated against current schema:

- a deleted or newly ineligible Field disappears without blocking the Form;
- if the same stable ID becomes eligible again, preserved order and
  presentation configuration apply;
- a newly created eligible Field is visible by default because it is not yet
  in `hiddenFields`; and
- a newly created ineligible Field never appears in Form Fields.

Changing Text to another eligible type makes `multiline` ineffective. Editor
SHOULD remove that member on the next explicit question edit. Schema mutation
safety and revision behavior remain owned by Runtime.

An external immutable Form rendering uses the schema captured when its
artifact was created. Later local schema changes do not modify that artifact
until an explicit new artifact is produced.

## 10. Executable JSON Schema

Conformance tools validate an envelope assembled from stored View `type` and
parsed `layout`. The envelope is not stored. UTF-8 byte limits and duplicate
`fields[*].fieldId` detection are additional normative checks from Section 9.

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://spec.eidos.space/ui/1.0/standard-view-layout.schema.json",
  "title": "Eidos Standard Views 1.0 layout envelope",
  "type": "object",
  "required": ["type", "layout"],
  "properties": {
    "type": { "enum": ["grid", "gallery", "kanban", "calendar", "form"] },
    "layout": {
      "type": "object",
      "properties": {
        "fieldOrder": { "$ref": "#/$defs/fieldIdArray" },
        "hiddenFields": { "$ref": "#/$defs/fieldIdArray", "default": [] },
        "visibleSystemFields": {
          "$ref": "#/$defs/fieldIdArray",
          "default": []
        },
        "fieldWidths": {
          "type": "object",
          "propertyNames": { "$ref": "#/$defs/fieldId" },
          "additionalProperties": {
            "type": "number",
            "minimum": 0.25,
            "maximum": 8
          },
          "default": {}
        },
        "rowDensity": {
          "enum": ["compact", "standard", "comfortable"],
          "default": "standard"
        },
        "freezeColumns": {
          "type": "integer",
          "minimum": 0,
          "maximum": 2147483647,
          "default": 1
        },
        "columnStats": {
          "type": "object",
          "propertyNames": { "$ref": "#/$defs/fieldId" },
          "additionalProperties": { "$ref": "#/$defs/columnStat" },
          "default": {}
        },
        "cardFields": { "$ref": "#/$defs/fieldIdArray", "default": [] },
        "coverField": {
          "oneOf": [{ "$ref": "#/$defs/fieldId" }, { "type": "null" }],
          "default": null
        },
        "coverFit": { "enum": ["cover", "contain"], "default": "cover" },
        "cardSize": {
          "enum": ["small", "medium", "large"],
          "default": "medium"
        },
        "hideEmptyFields": { "type": "boolean", "default": true },
        "groupField": {
          "oneOf": [{ "$ref": "#/$defs/fieldId" }, { "type": "null" }],
          "default": null
        },
        "showEmptyGroups": { "type": "boolean", "default": true },
        "dateField": {
          "oneOf": [{ "$ref": "#/$defs/fieldId" }, { "type": "null" }],
          "default": null
        },
        "title": { "type": "string", "minLength": 1 },
        "description": { "type": ["string", "null"] },
        "submitLabel": { "type": "string", "minLength": 1 },
        "successMessage": { "type": "string", "minLength": 1 },
        "fields": {
          "type": "array",
          "items": { "$ref": "#/$defs/formField" }
        }
      },
      "additionalProperties": true
    }
  },
  "additionalProperties": false,
  "$defs": {
    "fieldId": {
      "type": "string",
      "pattern": "^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$"
    },
    "fieldIdArray": {
      "type": "array",
      "items": { "$ref": "#/$defs/fieldId" },
      "uniqueItems": true
    },
    "columnStat": {
      "type": "object",
      "required": ["type"],
      "properties": {
        "type": {
          "enum": [
            "count-all",
            "count-non-null",
            "count-distinct",
            "count-empty",
            "percent-checked",
            "percent-unchecked",
            "sum",
            "average",
            "min",
            "max",
            "relation-value-count",
            "relation-row-count",
            "relation-distinct-target-count"
          ]
        }
      },
      "additionalProperties": false
    },
    "formField": {
      "type": "object",
      "required": ["fieldId", "required"],
      "properties": {
        "fieldId": { "$ref": "#/$defs/fieldId" },
        "label": { "type": "string", "minLength": 1 },
        "description": { "type": "string", "minLength": 1 },
        "placeholder": { "type": "string", "minLength": 1 },
        "multiline": { "type": "boolean" },
        "required": { "type": "boolean" }
      },
      "additionalProperties": true
    }
  }
}
```

Schema annotations such as `default` do not mutate an instance. Reading
defaults in Sections 3 through 9 apply when keys are absent. Applicability is
defined by those sections; non-applicable keys remain preserved and ignored.

## 11. Accessibility and security

All standard Views inherit Eidos UI 1.0 accessibility, localization, reduced
motion, untrusted-renderer, and asset rules. Every View-specific configuration
control and state in this document has an accessible name and keyboard path.

Form question labels, descriptions, placeholders, and messages are untrusted
text. They MUST NOT grant HTML, script, URL-navigation, filesystem, or network
authority. Form File controls expose logical File values only through current
Host capabilities.

## 12. Conformance tests

Every Eidos UI conformance suite runs the applicable tests in this document.

Common tests cover:

1. all five type registrations and stable navigation;
2. common Field visibility and ordering, including zero-visible-Field recovery;
3. non-applicable and unknown-key preservation across type changes;
4. unknown type and unsupported-query behavior; and
5. no generated row, group, aggregate, resolved, or transient UI state entering layout.

Viewer and Editor tests additionally cover:

1. every type-specific key and default in Sections 4 through 9;
2. bounded Grid, Gallery, Kanban, and Calendar reads;
3. eligible cover handling and lossless fallback;
4. Kanban grouping, empty groups, writable moves, and rejected read-only moves;
5. Calendar date mapping, range composition, and eligible creation; and
6. Form effective-question filtering, stable-ID rename behavior, non-null
   scalar required behavior, array-backed optional behavior, Text-only
   multiline, and read-only Preview.

Editor tests cover pointer and keyboard ordering, Show all and Hide all for
Form Fields, default Builder mode, a stable Builder/Preview switch, local
Preview validation with no row mutation or revision change, and Form creation
with either all eligible Fields or no visible Fields.

Schema tests cover Form Field creation, deletion, type conversion, newly
eligible or ineligible Fields, invalid or duplicate question rejection, and
stale-revision no-change behavior.

## 13. References

- [Eidos File Format 1.0](/specifications/file-format-1-0/)
- [Eidos Runtime 1.0](/specifications/runtime-1-0/)
- [Eidos Adapter 1.0](/specifications/adapter-1-0/)
- [Eidos UI 1.0](/specifications/ui-1-0/)
- [RFC 2119](https://www.rfc-editor.org/rfc/rfc2119) and
  [RFC 8174](https://www.rfc-editor.org/rfc/rfc8174)
- [JSON Schema Draft 2020-12 Core](https://json-schema.org/draft/2020-12/json-schema-core)
