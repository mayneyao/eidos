# Eidos Flavored Markdown 1.0

Status: Draft Eidos Standard
Version: 1.0
Published: 2026-09-02
Editor and change controller: Eidos Project
Canonical language: English

## Abstract

Eidos Flavored Markdown 1.0 (EFM) defines a portable, versioned Markdown
dialect for structured-text interchange. It combines CommonMark 0.31.2, the
named GitHub Flavored Markdown extensions, YAML frontmatter, footnotes, and a
constrained LaTeX mathematics profile.

This specification defines source encoding, document profiles, parsing
precedence, syntax semantics, secure rendering requirements, serialization,
diagnostics, and conformance. It is independent of any editor framework,
storage container, filesystem layout, host application, or rendering library.

## 1. Status and normative language

This English document is normative. The
[Chinese reference](./eidos-flavored-markdown-1.0.zh.md) is informative.
Publication defines a conformance target; it does not assert that any existing
implementation conforms.

The key words **MUST**, **MUST NOT**, **REQUIRED**, **SHALL**, **SHALL NOT**,
**SHOULD**, **SHOULD NOT**, **RECOMMENDED**, **NOT RECOMMENDED**, **MAY**, and
**OPTIONAL** are interpreted as BCP 14 terms only when written in capitals.

Examples and implementation guidance marked informative are not requirements.
Grammar rules, precedence, semantic requirements, security rules, and
conformance vectors in this document are normative.

## 2. Design goals, scope, and terms

### 2.1 Design goals

EFM is designed for:

- **portability**: ordinary Markdown remains readable and useful outside any
  particular implementation;
- **determinism**: the same source has the same syntactic interpretation;
- **source readability**: extension syntax remains understandable as plain
  text;
- **safe presentation**: parsing content never grants it execution authority;
  and
- **implementation independence**: conformance depends on observable results,
  not on a parser, editor, AST library, or rendering engine.

### 2.2 Scope

This specification defines:

- the EFM source and document model;
- imported CommonMark and GFM behavior;
- YAML frontmatter, footnote, and mathematics extensions;
- parsing precedence and syntax semantics;
- minimum secure-rendering behavior;
- stable serialization requirements; and
- conformance labels, diagnostics, and tests.

This specification does not define:

- a persistence format other than EFM source text;
- a file extension, directory structure, workspace, attachment store, or base
  URL;
- document identity, block identity, backlinks, mentions, or transclusion;
- editor layout, typography, toolbar, selection, scrolling, or folding;
- a particular AST shape, HTML vocabulary, CSS theme, or accessibility tree;
- syntax highlighting algorithms; or
- complete LaTeX documents, packages, compilation, or operating-system access.

### 2.3 Terms

- **source**: a sequence of Unicode characters decoded according to Section 4.
- **document**: a complete EFM input that may include document-level
  frontmatter.
- **fragment**: an EFM body without document-level frontmatter.
- **processor**: an implementation of one or more EFM conformance profiles.
- **parser**: a processor that converts source into an implementation-defined
  structured representation while preserving EFM semantics.
- **renderer**: a processor that produces a presentation from parsed EFM.
- **serializer**: a processor that converts a parsed representation back to
  EFM source.
- **source range**: a half-open character range in the decoded source.
- **diagnostic**: a structured message about syntax, security, resources, or
  implementation limits.

## 3. Conformance profiles

A conforming implementation declares one or more labels:

| Label                | Required capability                                                                                        |
| -------------------- | ---------------------------------------------------------------------------------------------------------- |
| `EFM-Parser-1.0`     | decode and parse EFM, apply extension precedence, retain source locations, and report required diagnostics |
| `EFM-Renderer-1.0`   | all Parser requirements plus secure presentation of every EFM construct                                    |
| `EFM-Serializer-1.0` | all Parser requirements plus semantics-preserving, stable serialization of every EFM construct             |

Renderer and Serializer independently extend Parser. A processor MAY
implement both.

A conforming processor MUST publish:

1. its EFM conformance labels;
2. whether it accepts the `document`, `fragment`, or both input profiles;
3. its resource and URI policy when claiming Renderer;
4. supported mathematics features beyond the required profile; and
5. any lower size, nesting, or rendering limits.

Use of a particular parser, renderer, serializer, or editor library neither
grants nor prevents conformance.

## 4. Source and document model

### 4.1 Encoding

EFM source MUST be valid UTF-8 when represented as bytes. A Parser MAY accept
and ignore one leading UTF-8 byte-order mark. A Serializer MUST NOT emit a
byte-order mark.

A Parser MUST accept LF, CRLF, and CR line endings as defined by CommonMark. A
Serializer SHOULD emit LF. Line-ending normalization alone does not change EFM
syntax semantics.

An implementation MAY impose documented resource limits. A limit failure MUST
produce a diagnostic and MUST NOT produce a partial successful result.

### 4.2 Input profiles

The **document profile** accepts one complete EFM document. It MAY begin with
the YAML frontmatter envelope defined in Section 7.1.

The **fragment profile** accepts an EFM body. It MUST NOT recognize
frontmatter. An initial `---` in a fragment is interpreted by ordinary
Markdown rules.

Except for frontmatter recognition, both profiles use the same syntax and
semantics.

### 4.3 Character and position model

Character, whitespace, line, and tab behavior follows CommonMark unless this
document explicitly states otherwise. Diagnostics MUST use one-based line and
column positions. A Parser SHOULD retain source ranges for parsed constructs.

## 5. Dialect composition and precedence

### 5.1 Imported specifications

Except where this document explicitly extends or overrides it, EFM body syntax
conforms to [CommonMark 0.31.2](https://spec.commonmark.org/0.31.2/).

EFM additionally incorporates these extension productions from
[GitHub Flavored Markdown 0.29-gfm](https://github.github.com/gfm/):

- tables;
- task list items;
- strikethrough;
- extended autolinks; and
- disallowed raw HTML tag filtering.

For a conflict outside an incorporated GFM extension production, CommonMark
0.31.2 controls.

Images, reference-style links and images, fenced code blocks, block quotes,
headings, lists, and raw HTML are CommonMark features. A processor MUST NOT
classify them as optional GFM or EFM extensions.

### 5.2 Precedence

A Parser MUST apply syntax in this order:

1. in the document profile only, recognize a frontmatter envelope at source
   offset zero;
2. recognize CommonMark block structure, including indented and fenced code;
3. in Markdown text outside code and raw HTML, recognize EFM footnotes and
   mathematics;
4. apply the incorporated GFM block and inline extensions; and
5. apply remaining CommonMark inline parsing.

Code spans, indented code blocks, and fenced code blocks other than a `math`
fence suppress footnote and mathematics recognition. Raw HTML content does not
recursively parse Markdown.

## 6. CommonMark and GFM requirements

Every EFM Parser MUST support all CommonMark syntax families and the
incorporated GFM extensions, including:

- paragraphs, blank lines, thematic breaks, and ATX and Setext headings;
- block quotes, ordered lists, bullet lists, nested lists, and task lists;
- indented and fenced code blocks with preserved info strings;
- emphasis, strong emphasis, strikethrough, code spans, and escapes;
- inline links, autolinks, reference links, images, and image references;
- hard and soft line breaks, character references, and raw HTML; and
- GFM tables with optional column alignment.

The following example is representative, not exhaustive:

```md
# Heading

Paragraph with **strong**, _emphasis_, ~~deleted text~~, `code`, and
[a link](https://eidos.space).

- bullet
- [x] completed task
- [ ] incomplete task

| Name  | State |
| :---- | ----: |
| Eidos | Ready |

![Alternative text](./assets/image.png "Optional title")

[reference]: https://eidos.space
```

### 6.1 Task lists

`[x]` and `[X]` mark a completed task. `[ ]` marks an incomplete task. A
Serializer SHOULD emit lowercase `[x]` for a completed task.

Task interactivity is presentation behavior and is not part of EFM syntax.
Changing task state changes the corresponding source marker.

### 6.2 Tables

Table recognition, delimiter rows, escaped pipes, and alignment follow GFM.
Alignment is syntax semantics; column width and visual layout are not.

### 6.3 Code info strings

The first whitespace-delimited word of a fenced code info string is the
language identifier. A Renderer MAY use it for syntax highlighting. It MUST
preserve code content, and highlighting MUST NOT change EFM semantics. An
unknown language renders as unhighlighted code.

## 7. EFM extensions

### 7.1 YAML frontmatter

YAML frontmatter is recognized only by the document profile.

A frontmatter envelope:

- MUST begin at source offset zero, after an optional accepted byte-order mark;
- MUST start with a line containing exactly `---`;
- MUST end with a later line containing exactly `---`;
- MUST contain a YAML 1.2 mapping or be empty; and
- MUST be followed by end of input or a line ending.

Example:

```md
---
title: Portable Markdown
tags:
  - eidos
  - markdown
draft: false
---

# Document body
```

Duplicate mapping keys are invalid and MUST produce a diagnostic. Frontmatter
does not create Markdown body nodes.

An opening `---` without a matching valid closing delimiter is interpreted by
ordinary Markdown rules. It does not consume the remainder of the input as
frontmatter.

### 7.2 Footnotes

EFM footnotes use reference and definition syntax compatible with GitHub:

```md
This statement has a footnote[^source]. A reference may repeat[^source].

[^source]: The footnote body may contain inline Markdown.
```

A footnote reference is `[^` followed by a non-empty label and `]`. A footnote
definition begins with the same label followed by `:`. Labels use CommonMark
reference-label normalization. The first definition for a normalized label
controls; a later duplicate MUST produce a diagnostic.

Continuation blocks belong to a definition when indented as a continuation of
that definition under CommonMark container rules. Definitions MAY occur before
or after references. An undefined reference remains literal source and SHOULD
produce a diagnostic.

A Renderer numbers footnotes in order of first reference, presents definitions
after the body, and provides a return target for each reference. Display
numbers are derived presentation and MUST NOT replace source labels.

### 7.3 LaTeX mathematics

#### 7.3.1 Scope

EFM supports LaTeX-style mathematics source. It does not support complete
LaTeX documents, arbitrary packages, file inclusion, shell escape, writes, or
other operating-system effects.

A mathematics renderer MAY use MathJax, KaTeX, or another compatible engine.
Renderer-specific output is derived presentation, not EFM source.

#### 7.3.2 Inline mathematics

Inline mathematics uses one unescaped dollar sign on each side:

```md
Euler wrote $e^{i\pi} + 1 = 0$.
```

An opening `$` MUST NOT be followed by Unicode whitespace. A closing `$` MUST
NOT be preceded by Unicode whitespace and MUST NOT be followed immediately by
an ASCII digit. Opening and closing delimiters MUST occur on the same line.
`\$` is a literal dollar sign.

These restrictions prevent common currency text such as `$5 and $10` from
being interpreted as mathematics.

#### 7.3.3 Display mathematics

Display mathematics uses opening and closing delimiter lines containing `$$`,
with up to three leading spaces:

```md
$$
\int_0^1 x^2\,dx = \frac{1}{3}
$$
```

Each delimiter MUST occupy its own line. Content between the delimiters is
mathematics source and is not parsed as Markdown.

A fenced code block whose language identifier is exactly `math` is an
equivalent display-mathematics form:

````md
```math
\sum_{i=1}^{n} i = \frac{n(n+1)}{2}
```
````

A Serializer MAY preserve either recognized input form. When generating a new
display-mathematics node, it SHOULD use `$$` delimiter lines.

#### 7.3.4 Errors

Unknown commands or unsupported renderer features do not make the EFM document
syntactically invalid. A Renderer MUST present a safe source fallback and
SHOULD report a diagnostic.

## 8. Rendering and resources

### 8.1 Rendering model

EFM specifies semantic presentation requirements, not a required output
format. A Renderer MAY produce HTML, native UI, terminal output, a document
format, or another accessible representation.

A Renderer MUST preserve the structural distinction between headings,
paragraphs, lists, task states, quotations, code, tables, links, images,
footnotes, and mathematics. Visual styling is implementation-defined.

### 8.2 Raw HTML

Raw HTML retains its CommonMark/GFM parsing meaning. Parsing raw HTML does not
grant it execution authority.

An EFM Renderer:

- MUST apply the incorporated GFM disallowed-tag filtering;
- MUST additionally sanitize or escape untrusted raw HTML;
- MUST NOT execute scripts, event attributes, active embeds, or unsafe styles;
- MUST NOT recursively parse Markdown inside raw HTML; and
- MUST provide readable fallback content when an element is denied.

A processor MAY expose a separately named trusted-HTML extension, but that
extension is not part of `EFM-Renderer-1.0`.

### 8.3 URIs and resources

Parsing a URI and authorizing a resource are separate operations. A Parser
retains the URI as content. A Renderer applies an implementation-defined,
published resource policy.

A default resource policy MAY activate:

- same-document fragments;
- relative references resolved against a declared base URI;
- `https:` and `http:` links;
- `mailto:` links; and
- image sources explicitly allowed by the policy.

A Renderer MUST NOT activate `javascript:`, `vbscript:`, executable `data:`
content, or an unapproved `file:` URI. An unsupported link presents its label
without an active destination. An unsupported image presents alternative text
or an accessible unresolved-resource placeholder.

When no base URI is declared, relative resources remain unresolved. Resource
resolution MUST remain within the authority declared by the processor.

## 9. Serialization

An `EFM-Serializer-1.0` implementation MUST serialize every EFM construct
without dropping or changing its syntax semantics.

Byte-for-byte reproduction is not required unless separately claimed. A
Serializer MUST reach a stable representation:

```text
serialize(parse(serialize(parse(source))))
  = serialize(parse(source))
```

The equality above is character equality after the Serializer's declared
line-ending normalization. A Serializer MUST preserve:

- textual content and code content;
- heading levels and list nesting;
- task states;
- link and image destinations, labels, titles, and reference relationships;
- table cells and alignment;
- frontmatter data;
- footnote labels, references, and definitions; and
- mathematics source and inline/display distinction.

When generating new source, a Serializer SHOULD use:

- ATX headings with one space after the marker;
- `-` for bullet list markers;
- `1.` for the first marker of a new ordered list;
- lowercase `[x]` for completed tasks;
- `**` for strong emphasis, `_` for emphasis, and `~~` for strikethrough;
- backtick fenced code blocks;
- `---` for thematic breaks;
- pipe-delimited GFM tables; and
- `$$` delimiter lines for display mathematics.

These recommendations do not restrict Parser input.

## 10. Diagnostics

A diagnostic MUST contain at least:

```ts
interface EfmDiagnostic {
  code: string
  severity: "info" | "warning" | "error"
  message: string
  start: { line: number; column: number }
  end?: { line: number; column: number }
}
```

Required diagnostic families include:

- malformed frontmatter and duplicate mapping keys;
- duplicate and undefined footnote labels;
- unterminated display mathematics;
- denied or unresolved resources;
- unsafe raw HTML and URI schemes; and
- processor resource-limit failures.

A diagnostic does not authorize changing the input source.

## 11. Exclusions and extension mechanism

EFM 1.0 assigns no special syntax meaning to:

- Wikilinks such as `[[Note]]`;
- transclusion such as `![[Note]]`;
- block identifiers such as `^block-id`;
- highlight delimiters such as `==text==`;
- percent comments such as `%%comment%%`;
- callouts such as `> [!note]`;
- directives such as `:::details`; or
- MDX, JSX, template expressions, or executable code cells.

Such text follows the imported CommonMark/GFM rules. A processor MAY implement
additional syntax under a separately named and versioned extension profile. It
MUST NOT claim that behavior as EFM 1.0 or silently enable it while testing EFM
conformance.

Folding headings or list items is presentation state over ordinary EFM
structure and is not EFM syntax.

## 12. Conformance tests

An EFM conformance suite MUST include:

1. the applicable CommonMark 0.31.2 examples;
2. every incorporated GFM 0.29-gfm extension example;
3. document-versus-fragment frontmatter vectors;
4. footnote definition, repetition, continuation, duplicate, and undefined
   vectors;
5. inline math, currency, escaping, code suppression, display math, and
   unterminated math vectors;
6. raw HTML and dangerous-URI security vectors;
7. relative-resource behavior with and without a declared base URI;
8. Serializer stability and semantic round-trip vectors; and
9. declared resource-limit vectors.

Implementations MAY use different libraries. They conform only when the shared
vectors produce equivalent syntax semantics, diagnostics, secure presentation,
and serialization effects.

## 13. Change policy

Compatible clarifications may add examples, diagnostics, or tests without
changing the interpretation of an existing valid document. Adding syntax that
previously parsed as ordinary text, changing delimiter precedence, or changing
document semantics requires a new EFM version.

An optional extension profile MUST use its own name and version and MUST NOT
silently amend EFM 1.0.

## Appendix A. Source-preserving editors (informative)

A source-preserving editor can support only a visual subset of EFM while still
protecting documents it cannot model. A robust implementation typically does
one of the following for each construct:

1. represents and serializes it semantically;
2. retains its original source range in an opaque node; or
3. keeps the affected content in source mode.

Selection, caret, scroll, folding, syntax highlighting, and active editing mode
are presentation state. They should not be serialized as EFM or cause content
to appear modified. Copy, export, and serialization should include content
hidden only by presentation state.
