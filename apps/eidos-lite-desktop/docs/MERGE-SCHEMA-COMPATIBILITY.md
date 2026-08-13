# Eidos Lite merge schema compatibility matrix

Status: living product and verification contract  
Applies to: Eidos Lite reviewed merge with Graft SDK 0.3.14
Last reviewed: 2026-08-13

## Purpose and ownership

This document records which three-way SQLite and Eidos schema changes are
expected to merge automatically, become a reviewable conflict, or stop at a
later safety boundary. It exists so implementation, UI, and executable tests
can be reviewed against the same scenario IDs.

This is not a new SQLite or Eidos File specification:

- Graft owns physical SQLite comparison, supported deterministic resolvers,
  candidate construction, and generic schema/opaque conflict records.
- The [Eidos File specification](../../../docs/specs/eidos-file-1.0.md)
  owns stable Table/Field identities, physical-name mappings, metadata,
  references, and validation.
- Lite owns the reviewed merge state machine, safe materialization, Eidos
  validation, conflict presentation, recovery, and test coverage.

When Graft changes a resolver or observable conflict contract, update this
matrix and its tests in the same work. A Graft implementation detail is not a
product guarantee until the Eidos integration and UI expectations below agree
with it.

## Outcome and coverage legend

### Outcomes

| Mark       | Classifier outcome                                    | Product meaning                                                                                                                   |
| ---------- | ----------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `AUTO`     | No Graft schema conflict                              | The physical schema change may be included in the candidate. Full materialization and Eidos validation are still required.        |
| `CONFLICT` | Graft returns `kind: "schema"`                        | Lite presents Base/Local/Hosted schema detail and permits only a complete-file Local or Hosted choice.                            |
| `OPAQUE`   | Graft reports an opaque change or analysis limitation | Row/table selection is unavailable. Use complete-file choice, retry after a supported analysis, or keep separate Recovery Spaces. |
| `DOMAIN`   | Physical classification alone is insufficient         | Eidos Runtime identity or semantic validation must accept the candidate. Failure blocks continue without discarding either side.  |
| `ERROR`    | Candidate SQL or validation fails                     | The gate restores a recoverable state and surfaces the precise failure. It must not reinterpret failure as a winner.              |

`AUTO` never means “the complete merge is safe.” The same path may still have
row conflicts, semantic-key conflicts, opaque changes, materialization errors,
or Eidos validation findings.

### Coverage

| Mark | Evidence                                                                                             |
| ---- | ---------------------------------------------------------------------------------------------------- |
| `G`  | Executable Graft source/SDK evidence exists for this exact behavior family.                          |
| `U`  | Lite unit or renderer test covers the product projection/UI.                                         |
| `E`  | Real local-Graft, dual-client Lite E2E covers classification through validate/continue or recovery.  |
| `X`  | Exact executable evidence currently demonstrates a known contract gap; the scenario is not complete. |
| `-`  | Required executable evidence is missing.                                                             |

Scenario IDs are stable. Do not reuse a retired ID for different behavior.
When a row changes expectation, record the contract change in the row before
changing or adding its executable evidence.

## Current Graft classifier

The current physical classifier compares non-internal, non-empty
`sqlite_schema` entries by name. Each side is expressed relative to Base as
`added`, `deleted`, or `modified`.

The current built-in schema resolver combines compatible appended columns and
independent table/index/view/trigger additions across a directory repository.
It may use a validated table rebuild when the union cannot be expressed as a
legal `ALTER TABLE ADD COLUMN`. A modification is otherwise automatic only
when Local and Hosted have the same entry type, change kind, and exact final
SQL text. Semantic SQL equivalence is not inferred.

A compatible appended-column change must preserve all Base schema items in
their original order and append only parseable column definitions. When both
sides append columns, overlapping case-insensitive names must have the same
normalized definition. Graft then constructs the union and keeps Local's
ordering when both sides already contain the same union.

## Complete entry-level decision matrix

### Base does not contain the schema entry

Only `unchanged` and `added` are possible for that entry name.

| ID             | Local              | Hosted                                        | Expected                                             | Coverage |
| -------------- | ------------------ | --------------------------------------------- | ---------------------------------------------------- | -------- |
| `SC-ENTRY-001` | Unchanged          | Unchanged                                     | No schema event                                      | `-`      |
| `SC-ENTRY-002` | Added              | Unchanged                                     | `AUTO`: retain Local addition                        | `G/-/E`  |
| `SC-ENTRY-003` | Unchanged          | Added                                         | `AUTO`: apply Hosted addition                        | `G/-/E`  |
| `SC-ENTRY-004` | Added              | Added with exact same entry type and SQL      | `AUTO`: collapse to one entry                        | `G/-/E`  |
| `SC-ENTRY-005` | Added              | Added with same name but different SQL        | `CONFLICT`: same-name different definition           | `G/-/E`  |
| `SC-ENTRY-006` | Added              | Added with same name but different entry type | `CONFLICT`                                           | `G/-/E`  |
| `SC-ENTRY-007` | Added under name A | Added under name B                            | Evaluate both independent additions; normally `AUTO` | `G/-/E`  |

### Base contains the schema entry

`add-column` below means the one supported append-only table modification.
`other-modify` means every other modification.

| ID             | Local                     | Hosted                                       | Expected                                     | Coverage |
| -------------- | ------------------------- | -------------------------------------------- | -------------------------------------------- | -------- |
| `SC-ENTRY-010` | Unchanged                 | Add-column                                   | `AUTO`                                       | `G/-/E`  |
| `SC-ENTRY-011` | Add-column                | Unchanged                                    | `AUTO`                                       | `G/-/E`  |
| `SC-ENTRY-012` | Compatible add-column set | Compatible add-column set                    | `AUTO`: union                                | `G/-/E`  |
| `SC-ENTRY-013` | Add-column                | Overlapping column with different definition | `CONFLICT`                                   | `G/-/E`  |
| `SC-ENTRY-014` | Unchanged                 | Other-modify                                 | `CONFLICT`                                   | `G/-/E`  |
| `SC-ENTRY-015` | Other-modify              | Unchanged                                    | `CONFLICT`                                   | `G/-/E`  |
| `SC-ENTRY-016` | Other-modify              | Exact same other-modify                      | `AUTO`: both already produced the same entry | `G/-/E`  |
| `SC-ENTRY-017` | Other-modify              | Different other-modify                       | `CONFLICT`                                   | `G/-/E`  |
| `SC-ENTRY-018` | Add-column                | Other-modify                                 | `CONFLICT`                                   | `G/-/E`  |
| `SC-ENTRY-019` | Deleted                   | Unchanged                                    | `CONFLICT`                                   | `G/-/E`  |
| `SC-ENTRY-020` | Unchanged                 | Deleted                                      | `CONFLICT`                                   | `G/-/E`  |
| `SC-ENTRY-021` | Deleted                   | Deleted                                      | `AUTO`: both removed the same Base entry     | `G/-/E`  |
| `SC-ENTRY-022` | Deleted                   | Modified                                     | `CONFLICT`                                   | `G/-/E`  |
| `SC-ENTRY-023` | Modified                  | Deleted                                      | `CONFLICT`                                   | `G/-/E`  |

An unsupported change remains a conflict even when it exists only on Local and
Hosted changed unrelated rows or schema. “Different objects” does not make an
unsupported schema operation automatically safe; every changed entry must pass
its own resolver.

## Column scenarios

### Add column

| ID           | Scenario                                                                       | Expected                              | Product/UI expectation                                            | Coverage |
| ------------ | ------------------------------------------------------------------------------ | ------------------------------------- | ----------------------------------------------------------------- | -------- |
| `SC-COL-001` | One side appends one column                                                    | `AUTO`                                | Do not open schema resolution; validate result                    | `G/-/E`  |
| `SC-COL-002` | One side appends several columns                                               | `AUTO`                                | Same                                                              | `G/-/E`  |
| `SC-COL-003` | Both append distinct column names                                              | `AUTO`: union                         | Changes view may summarize both additions                         | `G/-/E`  |
| `SC-COL-004` | Both append the same name and equivalent normalized definition                 | `AUTO`: deduplicate                   | Show one result column                                            | `G/-/E`  |
| `SC-COL-005` | Both append the same name with different type/affinity                         | `CONFLICT`                            | Show Base absent, Local definition, Hosted definition             | `G/-/E`  |
| `SC-COL-006` | Same name differs by nullability, default, collation, constraint, or reference | `CONFLICT`                            | Show the differing clauses, not only the field name               | `G/-/E`  |
| `SC-COL-007` | One side adds A; the other adds compatible A and B                             | `AUTO`: A and B                       | Deduplicate A                                                     | `G/-/E`  |
| `SC-COL-008` | Same compatible columns are appended in different order                        | `AUTO`; candidate order follows Local | Eidos validation decides whether order is semantically acceptable | `G/-/E`  |
| `SC-COL-009` | A new column is inserted among Base items or old items are reordered           | `CONFLICT`                            | Complete-file choice                                              | `G/-/E`  |
| `SC-COL-010` | Add-column also modifies an existing column or table constraint                | `CONFLICT`                            | Present both change kinds                                         | `G/-/E`  |
| `SC-COL-011` | Compatible union cannot use legal `ALTER TABLE`, such as an added `UNIQUE`     | `AUTO` through validated rebuild      | Preserve both definitions and validate the rebuilt result         | `G/-/E`  |
| `SC-COL-012` | Added constraint is valid separately but invalid for combined rows             | `ERROR` or `DOMAIN`                   | Never claim automatic completion                                  | `G/-/E`  |

`SC-COL-011` covers shapes where Graft can safely rebuild and validate the
table. `SC-COL-012` still covers candidates whose combined data violates
`UNIQUE`, foreign-key, `CHECK`, generated-column, or other constraints.

### Rename column

| ID           | Scenario                                               | Expected                                   | Product/UI expectation                           | Coverage |
| ------------ | ------------------------------------------------------ | ------------------------------------------ | ------------------------------------------------ | -------- |
| `SC-COL-020` | Only Local renames a column                            | `CONFLICT`                                 | Base/Local/Hosted names; file choice only        | `G/-/E`  |
| `SC-COL-021` | Only Hosted renames a column                           | `CONFLICT`                                 | Same                                             | `G/-/E`  |
| `SC-COL-022` | Both perform the exact same rename and final SQL       | `AUTO`                                     | Eidos validates stable Field ID and metadata     | `G/-/E`  |
| `SC-COL-023` | Local `Status -> Resolution`; Hosted `Status -> State` | `CONFLICT`                                 | Versioned field header; disable row/table choice | `G/U/E`  |
| `SC-COL-024` | Rename versus drop                                     | `CONFLICT`                                 | Complete-file choice                             | `G/-/E`  |
| `SC-COL-025` | Rename versus type/default/constraint modification     | `CONFLICT`                                 | Complete-file choice                             | `G/-/E`  |
| `SC-COL-026` | Rename plus add-column on either side                  | `CONFLICT` unless exact final SQL is equal | Complete-file choice                             | `G/-/E`  |
| `SC-COL-027` | Each side renames a different column in the same table | `CONFLICT`                                 | Show both column-change sets                     | `G/-/E`  |

### Drop or modify column

| ID           | Scenario                                                                  | Expected                                            | Product/UI expectation                           | Coverage |
| ------------ | ------------------------------------------------------------------------- | --------------------------------------------------- | ------------------------------------------------ | -------- |
| `SC-COL-030` | One side drops a column                                                   | `CONFLICT`                                          | Complete-file choice                             | `G/-/E`  |
| `SC-COL-031` | Both drop the same column with exact final SQL                            | `AUTO`                                              | Eidos validates references and metadata deletion | `G/-/E`  |
| `SC-COL-032` | Each side drops a different column                                        | `CONFLICT`                                          | Show both drops                                  | `G/-/E`  |
| `SC-COL-033` | Drop versus edit/use of the same column                                   | `CONFLICT`; may also have row/domain findings       | Explain structural dependency                    | `G/-/E`  |
| `SC-COL-034` | One side changes type or affinity                                         | `CONFLICT`                                          | Show Base/Local/Hosted definitions               | `G/-/E`  |
| `SC-COL-035` | One side changes `NULL`/`NOT NULL`                                        | `CONFLICT`                                          | Same                                             | `G/-/E`  |
| `SC-COL-036` | One side adds/removes/changes default                                     | `CONFLICT`                                          | Same                                             | `G/-/E`  |
| `SC-COL-037` | One side changes `COLLATE`                                                | `CONFLICT`                                          | Same                                             | `G/-/E`  |
| `SC-COL-038` | One side changes column `PRIMARY KEY`, `UNIQUE`, `CHECK`, or `REFERENCES` | `CONFLICT`                                          | Same                                             | `G/-/E`  |
| `SC-COL-039` | One side changes generated expression or `VIRTUAL`/`STORED`               | `CONFLICT` for parseable generated-column SQL       | Complete-file choice; no row/table resolution    | `G/-/E`  |
| `SC-COL-040` | Both produce exact same modified table SQL                                | `AUTO`                                              | Still require Eidos validation                   | `G/-/E`  |
| `SC-COL-041` | Both make semantically equal but textually different SQL                  | `CONFLICT` unless the add-column normalizer applies | Do not guess SQL equivalence in Lite             | `G/-/E`  |

## Table scenarios

### Create, drop, and modify table

| ID             | Scenario                                                     | Expected         | Product/UI expectation                                   | Coverage |
| -------------- | ------------------------------------------------------------ | ---------------- | -------------------------------------------------------- | -------- |
| `SC-TABLE-001` | One side creates a table                                     | `AUTO`           | Validate all table rows and Eidos metadata               | `G/-/X`  |
| `SC-TABLE-002` | Both create different table names                            | `AUTO` per table | Validate cross-table names/references                    | `G/-/X`  |
| `SC-TABLE-003` | Both create same name and exact SQL                          | `AUTO`           | Eidos must confirm whether stable Table IDs agree        | `G/-/E`  |
| `SC-TABLE-004` | Both create same name with different definitions             | `CONFLICT`       | Show complete table definitions                          | `G/-/E`  |
| `SC-TABLE-005` | Same name is created as different schema object types        | `CONFLICT`       | Show entry types                                         | `G/-/X`  |
| `SC-TABLE-006` | One side drops a table                                       | `CONFLICT`       | Complete-file choice                                     | `G/-/E`  |
| `SC-TABLE-007` | Both drop the same table                                     | `AUTO`           | Eidos validates dependent Fields/Relations/Views         | `G/-/E`  |
| `SC-TABLE-008` | Drop versus modify/add-column                                | `CONFLICT`       | Explain delete/modify conflict                           | `G/-/E`  |
| `SC-TABLE-009` | One side changes `STRICT` or `WITHOUT ROWID`                 | `CONFLICT`       | Complete-file choice                                     | `G/-/E`  |
| `SC-TABLE-010` | One side adds/removes/changes table-level PK/UNIQUE/CHECK/FK | `CONFLICT`       | Show constraint SQL                                      | `G/-/E`  |
| `SC-TABLE-011` | One side reorders columns or composite-key parts             | `CONFLICT`       | Complete-file choice                                     | `G/-/E`  |
| `SC-TABLE-012` | Both make the exact same unsupported table modification      | `AUTO`           | Validate candidate; identical does not waive Eidos rules | `G/-/E`  |

### Rename table identity caveat

Physical `sqlite_schema` comparison is name-based. A table rename is observed
as deletion of the old entry plus addition of the new entry; it is not one
stable-identity operation. Eidos must therefore use its stable Table ID to
close the following gaps.

| ID             | Scenario                                        | Physical expectation                                        | Required Eidos expectation                                                          | Coverage |
| -------------- | ----------------------------------------------- | ----------------------------------------------------------- | ----------------------------------------------------------------------------------- | -------- |
| `SC-TABLE-020` | One side renames A to B; the other is unchanged | `CONFLICT` on deletion of A                                 | Show stable Table identity and both names                                           | `G/-/E`  |
| `SC-TABLE-021` | Both rename A to B identically                  | `AUTO`                                                      | Confirm one stable Table ID and consistent metadata                                 | `G/-/E`  |
| `SC-TABLE-022` | Local A to B; Hosted A to C                     | Physical classifier may `AUTO` deletion A and additions B/C | `DOMAIN`: same Table ID has divergent names; never accept duplicate tables silently | `G/-/E`  |
| `SC-TABLE-023` | Local A to B; Hosted deletes A                  | Physical classifier may retain B without schema conflict    | `DOMAIN`: rename/delete conflict on the stable Table ID                             | `G/-/E`  |
| `SC-TABLE-024` | Rename versus modification of A                 | `CONFLICT` on A; new name may be an independent addition    | Present one coherent Table-level conflict                                           | `G/-/E`  |
| `SC-TABLE-025` | Rename changes only ASCII case                  | Depends on exact entry names/SQL                            | `DOMAIN`: enforce Eidos NOCASE uniqueness and rename rules                          | `G/-/E`  |

## Index scenarios

Explicit indexes are ordinary schema entries. Index B-tree bytes are separately
handled by Graft's default `reindex` opaque resolver. SQLite-created
`sqlite_autoindex_*` entries are internal and have no ordinary SQL entry.

| ID             | Scenario                                                    | Expected                              | Product/UI expectation                                 | Coverage |
| -------------- | ----------------------------------------------------------- | ------------------------------------- | ------------------------------------------------------ | -------- |
| `SC-INDEX-001` | One side creates an index                                   | `AUTO`                                | Validate candidate                                     | `G/-/X`  |
| `SC-INDEX-002` | Both create distinct index names                            | `AUTO`                                | Validate dependencies                                  | `G/-/E`  |
| `SC-INDEX-003` | Both create same name and exact SQL                         | `AUTO`                                | Show one result                                        | `G/-/E`  |
| `SC-INDEX-004` | Same name differs by columns/order/UNIQUE/WHERE             | `CONFLICT`                            | Show definitions                                       | `G/-/E`  |
| `SC-INDEX-005` | One side drops an index                                     | `CONFLICT`                            | Complete-file choice                                   | `G/-/E`  |
| `SC-INDEX-006` | Both drop the same index                                    | `AUTO`                                | Validate Eidos-required indexes                        | `G/-/E`  |
| `SC-INDEX-007` | One side modifies an index definition under the same name   | `CONFLICT`                            | Show old/new SQL                                       | `G/-/E`  |
| `SC-INDEX-008` | Both modify to exact same SQL                               | `AUTO`                                | Validate candidate                                     | `G/-/E`  |
| `SC-INDEX-009` | Added UNIQUE index is invalid for combined rows             | `ERROR` or `DOMAIN`                   | Keep merge recoverable; identify violated index        | `G/-/E`  |
| `SC-INDEX-010` | Index references a column renamed/dropped by the other side | `CONFLICT` or `ERROR`                 | Show dependency; no row/table choice                   | `G/-/E`  |
| `SC-INDEX-011` | Index rename represented as drop old + add new              | Apply the drop/add rows independently | Eidos identity/config validation decides acceptability | `G/-/E`  |

## View and trigger scenarios

These rows refer to physical SQLite `CREATE VIEW` and `CREATE TRIGGER` entries.
An Eidos product View stored in `eidos__views` is a metadata row and belongs to
the Eidos-domain section instead.

| ID               | Object  | Scenario                                        | Expected                                               | Coverage |
| ---------------- | ------- | ----------------------------------------------- | ------------------------------------------------------ | -------- |
| `SC-VIEW-001`    | View    | One side creates it                             | `AUTO`, then validate dependencies                     | `G/-/E`  |
| `SC-VIEW-002`    | View    | Both create same name and exact SQL             | `AUTO`                                                 | `G/-/E`  |
| `SC-VIEW-003`    | View    | Same name, different query                      | `CONFLICT`                                             | `G/U/E`  |
| `SC-VIEW-004`    | View    | One side modifies it                            | `CONFLICT`                                             | `G/-/E`  |
| `SC-VIEW-005`    | View    | Both modify to exact same SQL                   | `AUTO`                                                 | `G/-/E`  |
| `SC-VIEW-006`    | View    | One side deletes it                             | `CONFLICT`                                             | `G/-/E`  |
| `SC-VIEW-007`    | View    | Both delete it                                  | `AUTO`                                                 | `G/-/E`  |
| `SC-VIEW-008`    | View    | Referenced table/column is changed incompatibly | `CONFLICT` or `ERROR`                                  | `G/-/E`  |
| `SC-TRIGGER-001` | Trigger | One side creates it                             | `AUTO`, then validate dependencies and Eidos allowlist | `G/-/E`  |
| `SC-TRIGGER-002` | Trigger | Both create same name and exact SQL             | `AUTO`                                                 | `G/-/E`  |
| `SC-TRIGGER-003` | Trigger | Same name, different SQL                        | `CONFLICT`                                             | `G/-/E`  |
| `SC-TRIGGER-004` | Trigger | One side modifies it                            | `CONFLICT`                                             | `G/-/E`  |
| `SC-TRIGGER-005` | Trigger | Both modify to exact same SQL                   | `AUTO`                                                 | `G/-/E`  |
| `SC-TRIGGER-006` | Trigger | One side deletes it                             | `CONFLICT`                                             | `G/-/E`  |
| `SC-TRIGGER-007` | Trigger | Both delete it                                  | `AUTO`                                                 | `G/-/E`  |
| `SC-TRIGGER-008` | Trigger | Referenced object is changed incompatibly       | `CONFLICT` or `ERROR`                                  | `G/-/E`  |

## Opaque, internal, and analysis-limited structures

| ID              | Structure/change                            | Expected                                  | Product/UI expectation                              | Coverage |
| --------------- | ------------------------------------------- | ----------------------------------------- | --------------------------------------------------- | -------- |
| `SC-OPAQUE-001` | Index B-tree bytes                          | Default `reindex` resolver                | Do not expose as a user schema choice when resolved | `G/-/X`  |
| `SC-OPAQUE-002` | `sqlite_sequence`                           | Default `sequence_max` resolver           | Validate resulting sequences                        | `G/-/X`  |
| `SC-OPAQUE-003` | `sqlite_stat1` through `sqlite_stat4`       | Default rebuild resolver                  | Do not show as user content                         | `G/-/X`  |
| `SC-OPAQUE-004` | Unknown/disabled `sqlite_*` internal change | `OPAQUE`                                  | Complete-file choice or recovery                    | `-`      |
| `SC-OPAQUE-005` | Virtual table or FTS structure              | `OPAQUE`/limitation                       | No row/table resolution                             | `G/U/E`  |
| `SC-OPAQUE-006` | FTS shadow table                            | `OPAQUE`                                  | Keep under owning virtual table                     | `G/U/E`  |
| `SC-OPAQUE-007` | Generated columns                           | Schema conflict for parseable definitions | No partial row/table resolution                     | `G/-/E`  |
| `SC-OPAQUE-008` | UTF-16 database                             | Analysis limitation                       | Complete-file/manual path                           | `G/-/E`  |
| `SC-OPAQUE-009` | Malformed or unsupported SQLite snapshot    | Whole-path conflict or analysis error     | Preserve all versions; never guess                  | `G/-/E`  |

## Eidos-domain schema scenarios

Stored Eidos Fields are real SQLite columns, while stable identity and many
schema semantics live in metadata rows. Formula, Lookup, inverse Relation,
product View, label-field selection, settings, and ordering may have no
physical schema entry at all. Graft's physical result must therefore be
followed by Eidos Runtime validation.

| ID             | Eidos operation                                                      | Physical expectation                            | Required product expectation                                                | Coverage |
| -------------- | -------------------------------------------------------------------- | ----------------------------------------------- | --------------------------------------------------------------------------- | -------- |
| `SC-EIDOS-001` | One side creates a Table                                             | Usually `AUTO` table addition and metadata rows | Validate stable ID, name uniqueness, required Fields, and mappings          | `G/-/E`  |
| `SC-EIDOS-002` | Both independently create different Tables                           | Usually `AUTO`                                  | Validate names and cross-references                                         | `G/-/E`  |
| `SC-EIDOS-003` | Both independently create same display Table name with different IDs | Physical SQL may be identical or conflicting    | `DOMAIN`: never collapse different stable IDs silently                      | `G/-/X`  |
| `SC-EIDOS-004` | One side deletes a Table                                             | Physical `CONFLICT`                             | Include metadata delete/update and dependent objects in review              | `G/-/E`  |
| `SC-EIDOS-005` | Same Table ID renamed differently                                    | Physical schema plus metadata conflicts         | Present one stable-identity Table conflict                                  | `G/-/E`  |
| `SC-EIDOS-006` | Rename Table versus delete Table                                     | Physical classifier may miss identity intent    | `DOMAIN`: update/delete conflict                                            | `G/-/E`  |
| `SC-EIDOS-010` | One side creates a stored Field                                      | Usually compatible add-column                   | Validate Field row, physical mapping, type, and auxiliary rows              | `G/-/E`  |
| `SC-EIDOS-011` | Both create different stored Fields                                  | Usually `AUTO` column union                     | Validate ordering, names, IDs, and dependencies                             | `G/-/E`  |
| `SC-EIDOS-012` | Both independently create same display Field name with different IDs | Physical add-column may deduplicate             | `DOMAIN`: NOCASE uniqueness and stable identity must fail or require review | `G/-/X`  |
| `SC-EIDOS-013` | Same Field ID renamed differently                                    | Physical `CONFLICT` and metadata row conflict   | Versioned field names; complete-file choice                                 | `G/U/E`  |
| `SC-EIDOS-014` | One side deletes a stored Field                                      | Physical `CONFLICT`                             | Validate Formula/View/Lookup/Relation dependencies                          | `G/-/E`  |
| `SC-EIDOS-015` | Field delete versus edit/use                                         | Physical/row conflict                           | Show structural dependency and block continue                               | `G/-/E`  |
| `SC-EIDOS-016` | Stored Field type/nullability conversion                             | Physical `CONFLICT` unless exact on both        | Runtime owns value conversion and validation                                | `G/-/E`  |
| `SC-EIDOS-020` | Formula source/result type changes                                   | Usually metadata-only                           | Row conflict on same stable definition; compile and dependency validation   | `G/-/E`  |
| `SC-EIDOS-021` | Lookup definition changes                                            | Metadata-only                                   | Validate Relation/target Field IDs and aggregate rules                      | `G/-/E`  |
| `SC-EIDOS-022` | Relation target/on-delete changes                                    | Metadata and possibly required Trigger changes  | Treat trigger plus metadata as one domain operation                         | `G/-/E`  |
| `SC-EIDOS-023` | Record Label Field changes                                           | Metadata-only                                   | Conflict on same Table row; validate label eligibility                      | `G/-/E`  |
| `SC-EIDOS-024` | Select options or Field settings change                              | Metadata-only                                   | Row conflict for same Field; validate canonical JSON                        | `G/-/E`  |
| `SC-EIDOS-025` | Product View filter/sort/layout changes                              | `eidos__views` rows, not SQLite View schema     | Row conflict for same stable View ID; validate references                   | `G/-/E`  |
| `SC-EIDOS-026` | Table/Field/View reorder                                             | Metadata-only                                   | Merge independent identities; conflict on same position row if incompatible | `G/-/E`  |
| `SC-EIDOS-027` | Add a Field index                                                    | Usually `AUTO` explicit-index addition          | Validate exact Eidos index shape and combined data                          | `-/-/X`  |
| `SC-EIDOS-028` | Delete a Field index                                                 | Physical `CONFLICT` unless both delete          | Validate whether index is required                                          | `-/-/X`  |
| `SC-EIDOS-029` | Two physical schemas merge but metadata-to-column mapping disagrees  | Physical result may be `AUTO`                   | `DOMAIN`: `file-physical-schema-invalid`; block continue                    | `G/-/E`  |

## Cross-object and candidate-validation scenarios

Schema entries are classified independently, but their SQL and Eidos meanings
are not independent. These scenarios ensure `AUTO` is never mistaken for final
success.

| ID             | Scenario                                                                                        | Expected                                                                | Coverage |
| -------------- | ----------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- | -------- |
| `SC-CROSS-001` | Both sides change different tables using supported add-column operations                        | `AUTO`, then full-file validation                                       | `G/-/E`  |
| `SC-CROSS-002` | Both sides change different tables using unsupported operations                                 | Each unsupported entry remains `CONFLICT`                               | `G/-/E`  |
| `SC-CROSS-003` | One side creates an index/view/trigger that references a column the other side drops or renames | `CONFLICT` or candidate `ERROR`; never auto-complete                    | `G/-/E`  |
| `SC-CROSS-004` | Individually valid UNIQUE/CHECK/FK schema meets incompatible combined rows                      | Candidate `ERROR` or Eidos `DOMAIN` finding                             | `G/-/E`  |
| `SC-CROSS-005` | Automatic physical merge creates duplicate Eidos names or inconsistent stable IDs               | Eidos `DOMAIN` finding blocks continue                                  | `G/-/X`  |
| `SC-CROSS-006` | Schema is valid SQLite but contains undeclared/hostile Eidos objects                            | Eidos validation rejects it with handles closed                         | `G/-/E`  |
| `SC-CROSS-007` | Schema conflict exists beside row conflicts in the same table                                   | Show both, disable row/table resolution, allow complete-file choice     | `G/U/E`  |
| `SC-CROSS-008` | Conflict was partially reviewed, then the app reopens                                           | Reconstruct schema/row state from Graft journal and latest `stateToken` | `G/U/E`  |
| `SC-CROSS-009` | State becomes stale while schema detail is open                                                 | Reject without mutation; reload and reclassify                          | `G/U/E`  |
| `SC-CROSS-010` | Materialization or validation is cancelled/fails                                                | Run gate cleanup, preserve merge journal and all versions               | `G/U/E`  |

## Lite UI contract

The merge workspace must project the classifier and Eidos validator without
inventing a fourth merge engine:

1. `AUTO` changes do not appear as unresolved conflicts. They may be summarized
   as automatically combined when that information explains the result.
   A validation-required `automatic_merge_available` record remains unresolved
   until Graft exposes a successful candidate-materialization step; do not
   present its `merged` recommendation as an actionable or completed result.
2. A table-attributed schema conflict is a child of its `.eidos` file and
   table, beside row conflicts. Do not duplicate it under a generic file node.
3. The table surface shows Base, Local, and Hosted definitions. Column rename
   and definition conflicts show versioned field headers rather than placing a
   Hosted value under a Local-only column name.
4. Any schema, opaque, semantic-key, or analysis-limited conflict disables
   partial row and table resolution for that path. Complete Eidos File Local or
   Hosted selection remains available.
5. `DOMAIN` and `ERROR` findings explain the Eidos object and stable identity
   when known. They block `continueMerge` and retain the recovery/abort path.
6. Every materializing choice uses `SpaceOperationGate`, validates all `.eidos`
   files, restores resident runtimes, and publishes the latest `stateToken`.

## Current executable evidence

- [`graft-merge-schema.local.integration.test.ts`](../src/main/graft/graft-merge-schema.local.integration.test.ts)
  passes all 158 real local-Graft dual-client, Eidos Runtime, or
  repository-safety cases through
  fetch, plan, apply, the
  operation gate, conflict inspection, Local/Hosted complete-file resolution,
  Eidos validation where applicable, continue, reopen, stale rejection,
  unresolve, abort, and safe failure. Physical schema conflict families are
  exercised in both resolution directions and the final entire
  `sqlite_schema` is compared with the selected source.
- [`sync-merge-workspace.test.ts`](../src/renderer/sync-merge-workspace.test.ts)
  covers table attribution, Base/Local/Hosted versioned field headers, schema
  conflicts beside rows, disabled unsafe row/table actions, durable resolved
  detail, unresolve, and stale reload.
- [`graft-merge.local.integration.test.ts`](../src/main/graft/graft-merge.local.integration.test.ts)
  retains the cross-format text, binary, SQLite row, reopen, abort,
  cancellation, validation, two-parent commit, and publication path.

`E` records a passing retained behavior or passing safe-recovery assertion.
`X` records an executable reproduction that intentionally fails the desired
product contract and therefore remains a release blocker for that scenario.

## Known executable gaps

### `GRAFT-SCHEMA-GAP-001`: validation-required candidates lack a standalone materialization operation

Graft 0.3.14 automatically materializes compatible column/table/index/view/
trigger unions in a directory repository. For a more complex candidate that
requires application validation, such as independent data rows plus
`sqlite_sequence`/index/stat rebuild state (`SC-OPAQUE-001/002/003`), it leaves
the path unmerged and returns an explicit `automatic_merge_available` file
record with `recommended_result: "merged"` and
`recommended_action: "apply_merge"`.

The remaining API sequence is not usable safely by Lite:

- the initial `applyMerge` has already returned while the worktree still holds
  Local;
- `stageMergeSqliteResult` correctly validates and stages the current worktree,
  but therefore stages Local rather than the analyzed merged candidate;
- `continueMerge` can materialize the candidate, but immediately attempts the
  merge commit and rejects it because the index is unresolved. Lite must not
  depend on a failed command's worktree side effect as an API contract.

Graft needs a state-token-guarded operation that materializes the analyzed
candidate without staging or committing it, returns the latest merge state,
and declares `operationMaterializesWorktree = true`. Lite can then close
handles, invoke it through `SpaceOperationGate`, run Eidos domain validation,
and call `stageMergeSqliteResult`. Until then, the UI retains recoverable
complete-file Local/Hosted choices for these validation-required candidates.

### Closed: `EIDOS-SCHEMA-GAP-001` raw metadata conflicts

Graft no longer asks users to choose the technical `eidos__meta.revision` row.
It persists an Eidos semantic-provider workspace, and Runtime either accepts a
validated deterministic system-metadata result or records an Eidos domain
conflict before publication. Structural Table/Field changes that the current
Draft Runtime profile does not yet merge are reported conservatively as
`unsupported-schema-change`; they remain recoverable and are never mislabeled
as successful automatic merges. The generic Graft layer still does not infer
Eidos identity or uniqueness semantics.

### `EIDOS-SCHEMA-GAP-002`: Runtime rejects a spec-permitted Field index

Eidos File 1.0 permits the exact non-unique scalar index name
`eidos__index__<field-id-hex>`, but the current Runtime validator rejects that
object first as an undeclared reserved SQLite object. Therefore
`SC-EIDOS-027/028` cannot enter a valid merge fixture. The validator's reserved
object allowlist and its later optional-index shape validation need to agree
before Lite can claim Field-index merge coverage.

### Closed: `GRAFT-SCHEMA-GAP-003` malformed tracked SQLite diagnostics

Graft 0.3.14 returns structured `path_diagnostics` for skipped, corrupt, and
analysis-failed tracked SQLite paths, including `protected_by_index`. Lite
projects the diagnostics, blocks merge planning, and preserves the worktree
file while directing the user to repair or recovery. This closes the prior
false-clean product interpretation; the malformed candidate is still not
published or silently replaced.

### Closed: `GRAFT-SCHEMA-GAP-002` table/view same-name selection

Graft 0.3.14 reports `schema_same_name_conflict` and safely completes either the
Local table or Hosted view complete-file choice. The real directory-repository
matrix verifies both final `sqlite_schema` object types and no longer observes
the former `Invalid page number` failure.

## Remaining matrix gates

The only behavior rows still wholly unexercised are `SC-OPAQUE-004`, for an
unknown/disabled SQLite internal object that normal SQLite APIs do not allow a
fixture to create, and `SC-ENTRY-001`, which has no merge event by definition.
Rows marked `X` have exact executable reproductions but remain incomplete
product contracts.

## Review checklist

When a schema merge behavior changes:

- identify every affected stable scenario ID;
- update the expected classifier, product action, and recovery behavior;
- confirm whether the change belongs to Graft physical merging or Eidos domain
  validation;
- add or update Graft evidence before relying on a new generic resolver;
- add Lite projection/UI evidence and a real dual-client E2E for user-visible
  behavior;
- verify stale tokens, cancellation, reopen, abort, validation failure, and
  complete-file recovery remain safe;
- run the focused Lite tests, `pnpm test:eidos-lite`, `pnpm typecheck`, and the
  published-SDK integration gate before marking `E`.
