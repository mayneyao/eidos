# Eidos Specifications

Status: Specification suite index  
Suite version: 1.0  
Canonical language: English

This directory defines Eidos as four independently implementable layers with
single-owner contracts. A tool
implements only the layers it needs and declares conformance to each one. No
implementation source, package API report, product behavior, RFC, or Chinese
translation overrides the canonical English specifications here.

## Boundary map

```text
UI ──calls──────────────► RuntimeClient
UI ──calls──────────────► HostServices
Runtime ──calls─────────► ConnectionPort / environment ports
Adapter composition ────► RuntimeHostBridge
Runtime ──interprets────► Eidos File Format
Adapter ──publishes─────► Eidos File Format
```

These arrows show call/use direction, not whole-layer dependency or rule
ownership. Runtime and Adapter deliberately meet at two injected boundaries:
Adapter provides the ports that Runtime calls, while trusted Adapter
composition calls Runtime's narrow Host bridge. This is not shared semantic
ownership: Runtime owns logical meaning and Adapter owns platform behavior.

The implementation path is therefore:

```text
File Format → Runtime → Adapter → UI
```

Semantic ownership is one-way. In particular:

- File Format never depends on Runtime APIs, platforms, or UI;
- Runtime never opens paths, requests permissions, or owns platform handles;
- Adapter never defines Field, Formula, Lookup, Relation, query, or mutation
  meaning;
- UI uses Runtime's public service for data semantics and only the Adapter's
  high-level, capability-scoped HostServices for platform work; it never
  receives a SQLite connection, native handle, generated SQL, or
  canonical-file write primitive.

## Documents

| Layer       | Canonical specification                      | Informative Chinese reference     |
| ----------- | -------------------------------------------- | --------------------------------- |
| File Format | [Eidos File Format 1.0](./eidos-file-1.0.md) | [中文](./eidos-file-1.0.zh.md)    |
| Runtime     | [Eidos Runtime 1.0](./eidos-runtime-1.0.md)  | [中文](./eidos-runtime-1.0.zh.md) |
| Adapter     | [Eidos Adapter 1.0](./eidos-adapter-1.0.md)  | [中文](./eidos-adapter-1.0.zh.md) |
| UI          | [Eidos UI 1.0](./eidos-ui-1.0.md)            | [中文](./eidos-ui-1.0.zh.md)      |

## Implementation ladder

Each completed layer has a testable product boundary:

| Step           | Implemented contract                                                                                 | Result that can ship                                                                                                |
| -------------- | ---------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| 1. File Format | SQLite identity/schema, raw encodings, references, validity, atomic Writer postconditions            | validator, inspector, canonical-data importer/exporter, or repair tool that needs no derived semantics              |
| 2. Runtime     | typed schema and values, query/evaluation, mutation, conversion, revision, validation public service | headless semantic processor, CLI, server engine, or editor core independent of browser/Desktop APIs                 |
| 3. Adapter     | ConnectionPort, host lifecycle/publication, Transport, and one platform profile                      | runnable browser or Desktop processing tool with honest durability, permission, cancellation, and recovery behavior |
| 4. UI          | exact RuntimeClient/HostServices consumption and interaction contracts                               | interoperable viewer/editor/schema editor with no SQLite or platform authority in presentation code                 |

A headless tool that evaluates Formula/Lookup/Relation meaning normally claims
`EF-Reader-1.0 ER-Reader-1.0` plus the applicable `EA-Connection-1.0` and
platform profile; it does not need a UI label. A tool that changes canonical
state adds the corresponding Writer and Host requirements. A raw File
inspector may stop after Step 1, but MUST NOT claim Runtime semantics.

The ladder is an artifact-construction order, not a circular ownership rule.
At Step 2 a Runtime can be built and tested against the Adapter specification's
in-memory/reference `ConnectionPort` harness. Step 3 supplies the real
platform implementation of that already fixed port without changing Runtime
semantics.

## Single source of truth

Every observable rule has exactly one owning specification:

| Concern                                                                                                                | Owner       |
| ---------------------------------------------------------------------------------------------------------------------- | ----------- |
| SQLite container, application ID, metadata DDL, physical names, canonical raw values, committed revision postcondition | File Format |
| Logical types, derived evaluation, query results, operation/revision concurrency and errors                            | Runtime     |
| SQLite driver behavior, file lifecycle, locking, persistence, Worker/process profiles                                  | Adapter     |
| RuntimeClient/HostServices consumption, interaction state, editing affordances, accessibility                          | UI          |

An upper-layer document may summarize a lower-layer rule but MUST link to its
owner and MUST NOT redefine it. When two texts appear to conflict, the owner in
the table above controls.

## Conformance labels

A product publishes a space-separated list of labels:

```text
EF-Reader-1.0
EF-Writer-1.0
ER-Reader-1.0
ER-Writer-1.0
EA-Connection-1.0
EA-Host-1.0
EA-Browser-1.0
EA-Desktop-1.0
EU-Viewer-1.0
EU-Editor-1.0
EU-Schema-1.0
```

Higher labels do not imply unrelated layers. For example, a headless CLI can
be `EF-Reader-1.0 ER-Reader-1.0 EA-Desktop-1.0` without UI conformance. Each
specification defines its own prerequisites and required test families.

## Interoperability criterion

The suite is successful only when independent implementations can prove:

1. the same bytes and schema have the same File validity;
2. the same valid file and Runtime request produce the same typed value,
   ordering, error, and revision effect;
3. different conforming Adapters do not change Runtime-observable semantics;
4. a conforming UI can switch between conforming Runtime transports without
   reaching into SQLite or changing canonical state rules.

Examples and implementation notes are informative. Normative JSON shapes,
SQL, algorithms, truth tables, limits, and test vectors are part of their
owning specification. Machine-readable schemas and vectors, when distributed,
MUST identify the owning specification/version and MUST NOT silently extend it.

## Change policy

Compatible clarifications may add examples and tests but cannot change an
existing valid value or observable result. A change to persisted meaning bumps
the File Format version. A change to logical results or public operations bumps
the Runtime version. A change to a port/profile bumps Adapter. A change to
required interaction behavior bumps UI.

Design and implementation records are historical evidence only. They do not
amend this suite.
