# Eidos System Metadata Merge 1.0

Status: Draft Eidos Standard
Version: 1.0
Published: 2026-08-13
Editor and change controller: Eidos Project
Canonical language: English

## Abstract

This specification defines deterministic three-way merge semantics for the
eight canonical `eidos__*` metadata tables in an
[Eidos File Format 1.0](./eidos-file-1.0.md) database. It is an optional Eidos
Runtime profile named `ER-System-Merge-1.0`.

The profile removes implementation-only conflicts such as the
`eidos__meta.revision` singleton conflict, preserves independent metadata
edits, applies last-write-wins only where a canonical object clock and a safe
atomic group exist, and reports remaining failures as Eidos Table, Field,
View, Feature, or dependency conflicts rather than raw SQLite row conflicts.

The profile does not define synchronization, history storage, remote
publication, physical-file replacement, or user-row merge. A version manager
may provide immutable Base/Ours/Theirs snapshots and stable version keys, but
Eidos Runtime owns the logical result and post-merge validation.

## Status of This Document

The key words **MUST**, **MUST NOT**, **REQUIRED**, **SHALL**, **SHALL NOT**,
**SHOULD**, **SHOULD NOT**, **RECOMMENDED**, **NOT RECOMMENDED**, **MAY**, and
**OPTIONAL** are interpreted as BCP 14 terms only when written in capitals.

English is normative. The Chinese document is an informative, section-aligned
reference. This document is a draft: implementations MUST NOT claim
`ER-System-Merge-1.0` until the status becomes Final and the required vectors
are published.

## 1. Position, Scope, and Ownership

This profile supplements [Eidos Runtime 1.0](./eidos-runtime-1.0.md):

```text
Version manager / Sync host
        |
        | immutable Base, Ours, Theirs + stable version keys
        v
Eidos Runtime system merge    logical metadata merge and validation
        |
        v
Eidos File Format             canonical schema, IDs, references, raw values
        |
        v
Eidos Adapter                 handles, candidate publication, recovery
```

Ownership remains unchanged:

- Eidos File Format owns the persisted metadata schema and validity rules.
- This Runtime profile owns logical merge identity, automatic resolution,
  conflict classification, and semantic post-merge validation.
- Eidos Adapter owns opening snapshots, leases, candidate durability,
  replacement, cancellation, and recovery.
- A version manager owns commit graphs, immutable version keys, transfer, and
  remote reference publication. It MUST NOT infer Eidos semantics from table
  names on its own.

This profile covers exactly:

1. `eidos__meta`;
2. `eidos__tables`;
3. `eidos__fields`;
4. `eidos__features`;
5. `eidos__relation_fields`;
6. `eidos__formula_fields`;
7. `eidos__lookup_fields`;
8. `eidos__views`;
9. physical Table/Field schema and generated objects only where required to
   prove that a metadata result is executable and valid.

It does not define merge semantics for user-table rows, attachment files,
ordinary files, unknown extension state, or host-private indexes. Those inputs
may independently prevent the enclosing whole-file merge from completing.

System merge has an analysis stage and a finalization stage. Analysis fixes the
system metadata decisions and final schema. Finalization additionally requires
one resolved non-system content projection: either the non-system state was
identical, or a separate row/file merge resolved it under that exact final
schema. This profile does not define that projection's merge policy and MUST
NOT return a publishable candidate while it remains unresolved.

## 2. Terminology and Input Contract

- **Base**, **Ours**, and **Theirs**: three immutable Eidos File snapshots.
- **side key**: a stable version-manager identity for Ours or Theirs, such as a
  commit object ID. A side key is 1..128 lowercase ASCII characters matching
  `[a-z0-9._~-]+`.
- **metadata object**: one stable-ID object represented by one system row, or
  by an owning `eidos__fields` row and its subtype row.
- **Field aggregate**: an `eidos__fields` row, its zero-or-one Relation,
  Formula, or Lookup subtype row, and its required physical schema effects.
- **atomic group**: columns and dependent effects that must be selected and
  validated together.
- **object clock**: the canonical `updated_at` of the metadata object used for
  last-write ordering.
- **write rank**: the ordered pair `(object clock, side key)`.
- **domain conflict**: an unresolved logical conflict described using Eidos
  objects, not a raw SQLite row or page conflict.
- **automatic resolution record**: non-blocking audit data explaining an
  automatically selected atomic group.

The merge request is logically:

```ts
interface EidosSystemMergeInput {
  base: EidosSnapshot
  ours: EidosSnapshot
  theirs: EidosSnapshot
  oursKey: string
  theirsKey: string
  operationInstant: string
}
```

`oursKey` and `theirsKey` MUST be distinct and MUST continue to identify the
same snapshots when the merge is retried on another device. `operationInstant`
MUST be the one canonical instant obtained from Runtime's injected
`clock.nowInstant()` and frozen in the merge plan before its first canonical
mutation. `ours` and `theirs` are roles in this invocation only; no tie-break
rule may prefer the role name.

Before analysis, all three snapshots MUST pass Eidos File identity and
structural validation. They MUST have the same `file_id`, `format_major`, and
`format_minor`. `operationInstant` MUST be later than every `updated_at` in the
three input system metadata sets. A malformed snapshot is
`invalid-merge-input`; a non-advancing Runtime clock is
`clock-not-after-input`. Neither is a user-resolvable domain conflict.

## 3. Determinism and Last-Write Ordering

### 3.1 Write rank

Canonical instants compare as their normalized 24-octet UTC spellings. A later
instant has the greater rank. Equal instants compare side keys by unsigned
ASCII byte order; the greater side key wins. This tie-break is deterministic,
not a claim about real-world time.

Swapping Ours and Theirs while preserving each snapshot's side key and the
frozen operation instant MUST produce the same logical merged state, conflict
set, and automatic-resolution set.

### 3.2 Object clocks

| Object          | Object clock                      |
| --------------- | --------------------------------- |
| File metadata   | `eidos__meta.updated_at`          |
| Table           | `eidos__tables.updated_at`        |
| Field aggregate | owning `eidos__fields.updated_at` |
| View            | `eidos__views.updated_at`         |
| Feature         | none                              |

Relation, Formula, and Lookup subtype rows MUST NOT be ranked independently.
Their owner Field clock controls the complete Field aggregate. A conforming
Writer already updates the owner Field clock whenever its subtype definition
changes.

`eidos__features` has no canonical object clock. This profile therefore never
uses last-write-wins for concurrent changes to the same Feature.

### 3.3 Meaning of last-write-wins

Last-write-wins applies only when both sides changed the same atomic group
from Base to different values. One-sided changes are preserved. Changes to
different atomic groups of the same object are combined. LWW MUST NOT replace
the whole object merely because one side has a later clock.

An implementation MUST NOT simulate LWW by setting only `updated_at` to its
maximum, by always selecting Ours, by using remote arrival order, or by using
the local device role as a tie-break.

`revision` and `updated_at` do not by themselves constitute a substantive
object update. They are merge-control columns. Input object clocks select
concurrent values; after selection, every inserted or substantively updated
Table, Field aggregate, or View receives the one `operationInstant`. An equal
object that differs only by clock collapses without a conflict.

## 4. Generic Three-Way Change Matrix

This matrix applies to every stable-identity metadata object unless a later
section is stricter.

| Base    | Ours                                 | Theirs                               | Required result                          |
| ------- | ------------------------------------ | ------------------------------------ | ---------------------------------------- |
| absent  | absent                               | absent                               | absent                                   |
| absent  | inserted                             | absent                               | include Ours, subject to validation      |
| absent  | absent                               | inserted                             | include Theirs, subject to validation    |
| absent  | identical insert                     | identical insert                     | include one equal object                 |
| absent  | different insert with same stable ID | different insert with same stable ID | `identity-collision`                     |
| present | unchanged                            | unchanged                            | preserve Base                            |
| present | updated                              | unchanged                            | apply Ours                               |
| present | unchanged                            | updated                              | apply Theirs                             |
| present | identical update                     | identical update                     | apply the equal update                   |
| present | disjoint atomic-group updates        | disjoint atomic-group updates        | combine groups                           |
| present | different update to one LWW group    | different update to one LWW group    | choose greater write rank                |
| present | deleted                              | unchanged                            | delete, subject to dependency validation |
| present | unchanged                            | deleted                              | delete, subject to dependency validation |
| present | deleted                              | deleted                              | delete                                   |
| present | deleted                              | updated                              | `delete-update`                          |
| present | updated                              | deleted                              | `delete-update`                          |

The profile has no deletion tombstone or deletion clock. It MUST NOT silently
resolve delete/update using a surviving row's timestamp, commit arrival order,
or a side-role preference.

A cascade caused solely by a one-sided Table or Field deletion is attributed
to that parent deletion, not reported again as independent child-row deletes.
If the other side substantively changed any cascaded child or a surviving
object still refers to it, the parent operation becomes `delete-update` or
`dependency-conflict`.

Different stable IDs that violate a final uniqueness rule, including
case-insensitive Table, Field, or View names in their File-defined uniqueness
scope, produce `name-collision`; LWW does not apply because the objects do not
share identity.

## 5. `eidos__meta`

### 5.1 Purpose

`eidos__meta` is required technical File state. Ordinary divergence in this
singleton MUST NOT appear as a blocking conflict. In particular,
`revision` and `updated_at` differences are expected whenever both devices
made valid changes.

### 5.2 Column rules

| Columns                                                              | Rule                                                                                            |
| -------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| `singleton`, `format_major`, `format_minor`, `file_id`, `created_at` | immutable; all snapshots MUST agree                                                             |
| `title`                                                              | independent LWW group using the File metadata write rank                                        |
| `default_table_id`                                                   | independent LWW group using the File metadata write rank; final reference MUST exist or be NULL |
| `revision`                                                           | merge finalization, never a conflict                                                            |
| `updated_at`                                                         | merge finalization, never a conflict                                                            |

After every other system merge decision succeeds:

1. `revision = max(base.revision, ours.revision, theirs.revision) + 1`;
2. `updated_at = operationInstant`;
3. integer overflow produces `revision-exhausted`;
4. the same `operationInstant` is assigned to every Table, Field aggregate,
   and View substantively inserted or updated by the logical merge.

An automatic `title`, `default_table_id`, revision, or timestamp decision MAY
appear in audit/history details but MUST NOT be returned in the domain conflict
array and MUST NOT require user acknowledgement.

## 6. `eidos__tables`

### 6.1 Identity and groups

One Table object is identified by `id`.

| Atomic group      | Columns/effects                                     | Concurrent rule                                                        |
| ----------------- | --------------------------------------------------- | ---------------------------------------------------------------------- |
| identity          | `id`, `created_at`                                  | immutable                                                              |
| physical identity | `name`, `physical_name`, physical SQLite table name | equal result collapses; different concurrent renames conflict          |
| record label      | `label_field_id`                                    | LWW, then reference/type validation                                    |
| order             | `position`                                          | LWW                                                                    |
| settings          | `settings_json`                                     | LWW over the complete JCS object                                       |
| clock             | `updated_at`                                        | input rank only; merged substantive change receives `operationInstant` |

### 6.2 Enumerated changes

- **Create Table**: one-sided creation is automatic when its name, physical
  schema, required system Fields, and label Field remain valid.
- **Concurrent same-ID creation**: unequal inserts are `identity-collision`.
- **Concurrent different-ID same-name creation**: `name-collision`.
- **Rename on one side**: automatic only when the physical table rename and
  all metadata references can be projected without another collision.
- **Different concurrent renames of the same Table**:
  `table-rename-conflict`; a timestamp MUST NOT silently select physical DDL.
- **Record Label changes**: different valid targets use LWW. A missing,
  Lookup, or wrong-Table target is `dependency-conflict`.
- **Reorder or settings edits**: same-group differences use LWW; independent
  groups combine.
- **Delete on one side, unchanged on the other**: automatic only when cascade
  effects and surviving references validate.
- **Delete versus any edit/use**: `delete-update` or `dependency-conflict`.

The physical SQLite table is a projection of the final Table and Field
aggregates. A merge MUST NOT separately choose a metadata name and an unrelated
physical table name.

## 7. `eidos__fields` and Field Aggregates

### 7.1 Aggregate boundary

One Field aggregate is identified by `eidos__fields.id` and contains:

- the owning `eidos__fields` row;
- exactly the subtype row required by its type, if any;
- its physical column or deliberate absence of one;
- required Formula rewrites, Relation triggers, and generated indexes;
- option-catalog row and View rewrites attributable to a supported option
  operation.

Subtype rows MUST NOT be merged independently from their owner Field.

### 7.2 Atomic groups

| Atomic group   | Columns/effects                                                              | Concurrent rule                                                            |
| -------------- | ---------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| identity/owner | `id`, `table_id`, `created_at`                                               | immutable; moving a Field is unsupported                                   |
| name/mapping   | `name`, `physical_name`, physical-column rename, affected Formula source     | equal result collapses; different concurrent renames conflict              |
| shape          | `type`, `system_role`, `nullable`, subtype kind, physical storage/conversion | equal result collapses; incompatible concurrent conversion conflicts       |
| definition     | `settings_json` plus subtype row where semantically coupled                  | Sections 7.3–7.7                                                           |
| order          | `position`                                                                   | LWW                                                                        |
| clock          | `updated_at`                                                                 | controls input rank; merged substantive change receives `operationInstant` |

### 7.3 Common Field changes

- **Create Field**: one-sided creation is automatic when metadata, physical
  storage, and subtype definition are complete and valid.
- **Different IDs with the same case-insensitive name or physical name**:
  `name-collision`.
- **Rename on one side**: automatic only when the physical column and every
  affected Formula can be rewritten and validated.
- **Different concurrent renames**: `field-rename-conflict`.
- **Reorder**: LWW.
- **Non-Select settings**: complete-object LWW when the Field shape is
  otherwise unchanged.
- **Same target type conversion with the same canonical result**: collapse.
- **Different target types, different conversion parameters, or conversion
  concurrent with edits whose reapplication is not proven lossless**:
  `field-conversion-conflict`.
- **Delete versus edit, row use, label use, View use, Formula use, Relation
  use, or Lookup use**: `delete-update` or `dependency-conflict`.

`system_role` and the required `_id`, `_created_at`, and `_updated_at` Fields
MUST satisfy File invariants after merge. Their identity or role MUST NOT be
selected by LWW.

### 7.4 Select and Multi-select catalogs

Option names are canonical values and are not stable option IDs. Therefore:

- identical catalog changes collapse;
- a one-sided catalog change MAY merge only when all attributable source-row
  and View rewrites are present and semantic validation succeeds;
- different concurrent changes to the option catalog are
  `option-catalog-conflict` unless the Runtime can prove that they affect
  disjoint option names and produce no coalescing or reference ambiguity;
- LWW over the complete `settings_json` MUST NOT silently discard or invent
  cell-value rewrites.

### 7.5 `eidos__relation_fields`

The complete subtype row is one definition group controlled by the owner Field
clock. Concurrent edits to direction, target Table, cardinality, inverse Field,
or delete policy use LWW only when the owner Field shape is unchanged and the
winning definition passes all forward/inverse, target, cardinality, and cycle
checks. Otherwise the result is `dependency-conflict`.

Generated Relation triggers are rebuilt from the winning definition and never
participate as canonical conflicts.

### 7.6 `eidos__formula_fields`

`source_text` and `result_type` are one definition group controlled by the
owner Field clock. A concurrent definition difference uses LWW, then the
winning Formula MUST parse, resolve every reference exactly once, agree with
its declared type, and remain acyclic.

Formula source rewrites caused by a Field rename belong to the renamed Field's
name/mapping operation. They MUST NOT independently defeat a user Formula edit.
If both cannot be replayed into one valid source, the result is
`dependency-conflict` or `field-rename-conflict`.

### 7.7 `eidos__lookup_fields`

`relation_field_id`, `target_field_id`, `aggregate`, and `distinct_values` are
one definition group controlled by the owner Field clock. Concurrent
definition differences use LWW only when the final Relation owner, target
Table, target Field, aggregate/type rules, and file-wide dependency graph all
validate. Otherwise the result is `dependency-conflict`.

## 8. `eidos__views`

One View is identified by `id`.

| Atomic group   | Columns                        | Concurrent rule                                                        |
| -------------- | ------------------------------ | ---------------------------------------------------------------------- |
| identity/owner | `id`, `table_id`, `created_at` | immutable                                                              |
| name           | `name`                         | LWW, then case-insensitive per-Table uniqueness validation             |
| query          | `query_json`                   | LWW over the complete Query document                                   |
| presentation   | `type`, `layout_json`          | LWW as one complete presentation definition                            |
| order          | `position`                     | LWW                                                                    |
| clock          | `updated_at`                   | input rank only; merged substantive change receives `operationInstant` |

One-sided create, edit, reorder, and delete follow Section 4. A concurrent
Query edit and presentation edit combine. Different IDs belonging to the same
Table with the same final name produce `name-collision`. Delete/update remains
a domain conflict because there is no View deletion clock.

The winning definition MUST preserve unknown View types and unknown JSON
members as required by File Format. Runtime MUST validate stable Field
references and Query meaning; a UI profile MAY additionally validate standard
layout meaning before publication.

## 9. `eidos__features`

A Feature is identified by `name`. Its `version`, `required`, and
`config_json` form one atomic capability declaration.

- one-sided insert, update, or removal is applied subject to whole-file
  validation;
- identical concurrent declarations collapse;
- different concurrent declarations for the same name produce
  `feature-conflict`;
- delete/update produces `delete-update`;
- `required=1` MUST NOT win merely because Boolean one is numerically greater;
- versions MUST NOT be ordered as SemVer unless a future Feature-specific
  contract explicitly requires it;
- `config_json` MUST NOT be deep-merged by generic JSON rules.

The absence of `updated_at` is intentional evidence that generic LWW is not
available for this table.

## 10. Physical Schema, Generated State, and User Data

The Runtime MUST derive a candidate physical schema from the final logical
Table and Field aggregates. It MUST reject a candidate in which:

- a registered Table or stored Field lacks its required physical object;
- a physical name differs from canonical metadata;
- a virtual Field has forbidden physical storage;
- a type conversion lacks its required canonical value conversion;
- a Table/Field uniqueness, CHECK, foreign-key, or system-role invariant fails;
- a Formula, Lookup, or Relation dependency is unresolved or cyclic;
- a user-row value is invalid under the selected final Field shape.

Generated triggers, indexes, compiled Formula SQL, dependency caches, and
statistics MUST be rebuilt and MUST NOT be treated as user conflicts.

This profile does not merge ordinary user-row conflicts. If user-row merge and
system merge are composed, system analysis MUST fix the final schema first,
row merge MUST interpret values under that exact schema, and system
finalization MUST validate the combined private candidate. A system decision
that makes a pending row change ambiguous produces
`field-conversion-conflict` or `dependency-conflict` rather than silently
dropping the row change.

## 11. Candidate Construction and Validation

All automatic decisions MUST be applied to a private candidate. The candidate
MUST NOT replace a worktree or source until all required checks succeed.

The required order is:

1. validate all three input identities and structures;
2. compute stable-object and atomic-group diffs from Base;
3. emit domain conflicts for non-automatic cases;
4. if conflicts exist, return without constructing a publishable result;
5. apply automatic logical decisions to a private candidate;
6. reconstruct required physical schema and generated state;
7. apply the frozen `operationInstant` to every substantively changed clocked
   metadata object and finalize `eidos__meta` as specified in Section 5;
8. run full Eidos File validation;
9. run Eidos Runtime semantic validation;
10. return the candidate, automatic-resolution records, and validation proof.

If automatic decisions produce an invalid candidate, Runtime MUST return
`validation-failed` with the narrowest attributable Eidos objects. It MUST NOT
fall back to a raw `eidos__meta` revision conflict, expose an invalid candidate
as resolved, or mutate any input snapshot.

## 12. Result and Conflict Vocabulary

The logical outcome after analysis and, when required, finalization is one of
the following. Implementations MAY expose analysis and finalization as two
separate bounded operations without changing these semantics.

```ts
type EidosSystemMergeResult =
  | {
      outcome: "merged"
      candidate: EidosSnapshot
      automaticResolutions: AutomaticResolution[]
      validation: ValidationProof
    }
  | {
      outcome: "conflict"
      conflicts: DomainConflict[]
      automaticResolutions: AutomaticResolution[]
    }
  | {
      outcome: "invalid-input"
      issues: MergeInputIssue[]
    }
  | {
      outcome: "failed"
      code: "clock-not-after-input" | "revision-exhausted"
    }
```

Required domain conflict codes are:

| Code                        | Meaning                                                               |
| --------------------------- | --------------------------------------------------------------------- |
| `identity-collision`        | same stable ID independently created with unequal content             |
| `name-collision`            | different stable IDs violate final name/physical-name uniqueness      |
| `delete-update`             | one side deleted an object changed by the other                       |
| `table-rename-conflict`     | same Table received incompatible concurrent physical names            |
| `field-rename-conflict`     | same Field received incompatible concurrent names or Formula rewrites |
| `field-conversion-conflict` | concurrent shape/conversion or row replay is not proven safe          |
| `option-catalog-conflict`   | concurrent option changes cannot be losslessly combined               |
| `dependency-conflict`       | final references, subtype rules, or dependency graph are invalid      |
| `feature-conflict`          | same Feature received unequal concurrent declarations                 |
| `unsupported-schema-change` | valid input uses a structural change outside this profile             |
| `validation-failed`         | automatic logical result fails File or Runtime validation             |

A conflict MUST identify the Eidos object kind and stable ID when available,
the atomic group, summaries of Base/Ours/Theirs, and allowed resolution scope.
Primary user-facing text MUST describe File, Table, Field, View, Feature, or
dependency meaning. Raw system table names MAY appear only in expandable
technical diagnostics.

Automatic `eidos__meta` resolution MUST NOT be converted into a conflict badge,
conflict count, or required review step.

## 13. Host and Version-Manager Requirements

A Host composing this profile MUST:

- close or quiesce writable Runtime handles before materializing a candidate;
- preserve Base, Ours, and Theirs until merge completion or explicit abort;
- pass stable snapshot keys unchanged across retries and devices and freeze the
  Runtime-supplied operation instant for one merge plan;
- publish only a candidate accompanied by successful validation proof;
- use Adapter conditional publication and surface source-token changes as
  publication conflicts, not logical metadata conflicts;
- preserve recovery data when publication or remote push fails.

A version manager MAY pre-merge ordinary files or user rows, but it MUST NOT
claim system metadata resolution based only on generic SQLite row conflict
selection. It MAY store Runtime's automatic-resolution and domain-conflict
records in history without persisting them inside the `.eidos` file.

## 14. Conformance Requirements

An `ER-System-Merge-1.0` implementation MUST also conform to
`EF-Reader-1.0`, `EF-Writer-1.0`, `ER-Reader-1.0`, and `ER-Writer-1.0`.

Required vector families are:

1. every row in the generic change matrix;
2. `eidos__meta` title/default-Table LWW, revision finalization, shared
   operation instant, immutable mismatch, clock non-advancement, and overflow;
3. Table create/delete/rename/label/order/settings and same-name collisions;
4. Field create/delete/rename/reorder/settings/type conversion and required
   system Fields;
5. Select/Multi-select catalog rewrites and collision/loss cases;
6. Relation forward/inverse/cardinality/delete-policy validation;
7. Formula source/type/rename rewrite and dependency-cycle validation;
8. Lookup Relation/target/aggregate/distinct and dependency validation;
9. View name/type/query/layout/order and unknown-member preservation;
10. Feature insert/remove/equal declaration/concurrent declaration;
11. physical DDL reconstruction, generated-object rebuild, user-row/schema
    incompatibility, full File validation, and semantic validation;
12. Ours/Theirs role reversal with stable side keys and operation instant
    producing the same logical output;
13. equal object clocks resolved by side key;
14. failed validation preserving all input snapshots and returning no
    publishable candidate;
15. conflict output containing domain identity and no blocking
    `eidos__meta.revision` conflict.

Conformance compares logical canonical state and reported records. It MUST NOT
require byte-identical SQLite page layout.

## 15. Security and Data-Loss Considerations

Automatic merge is a write authority. Implementations MUST bound snapshot,
diff, JSON, Formula, dependency, conflict, and validation work using Runtime
resource limits and MUST honor cancellation before publication.

LWW can discard one concurrent value in the same atomic group. Therefore every
LWW decision is recorded for audit even when it is non-blocking. LWW is
forbidden where the schema lacks a trustworthy object clock, where deletion
has no tombstone, where different stable identities collide, or where a
physical/data conversion cannot be proven valid.

Wall clocks can be incorrect. Runtime MUST reject, rather than backdate, a
merge whose operation instant is not later than every input system object
clock. A Host MAY retry after its trusted clock advances; it MUST NOT forge a
later timestamp outside Runtime's ClockPort contract.

No access token, remote credential, local path, host-private recovery token,
or version-manager secret may be persisted in the candidate or included in a
conflict summary.
