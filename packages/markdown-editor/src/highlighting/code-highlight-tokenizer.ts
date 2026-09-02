export const CODE_HIGHLIGHT_KINDS = [
  "comment",
  "keyword",
  "operator",
  "string",
  "number",
  "function",
  "type",
  "variable",
  "property",
  "tag",
  "selector",
  "inserted",
  "deleted",
] as const

export type CodeHighlightKind = (typeof CODE_HIGHLIGHT_KINDS)[number]

export interface CodeHighlightToken {
  start: number
  end: number
  kind: CodeHighlightKind
}

export type CodeHighlightTokenizer = (
  code: string,
  language: string
) => readonly CodeHighlightToken[] | Promise<readonly CodeHighlightToken[]>

interface TokenRule {
  kind: CodeHighlightKind
  expression: RegExp
}

const LANGUAGE_ALIASES: Readonly<Record<string, string>> = {
  cjs: "javascript",
  gql: "graphql",
  js: "javascript",
  jsx: "javascript",
  md: "markdown",
  mjs: "javascript",
  py: "python",
  rb: "ruby",
  rs: "rust",
  sh: "bash",
  shell: "bash",
  ts: "typescript",
  tsx: "typescript",
  yml: "yaml",
  zsh: "bash",
}

const KEYWORDS: Readonly<Record<string, readonly string[]>> = {
  bash: [
    "case",
    "do",
    "done",
    "elif",
    "else",
    "esac",
    "fi",
    "for",
    "function",
    "if",
    "in",
    "select",
    "then",
    "time",
    "until",
    "while",
  ],
  c: [
    "auto",
    "break",
    "case",
    "char",
    "const",
    "continue",
    "default",
    "do",
    "double",
    "else",
    "enum",
    "extern",
    "float",
    "for",
    "goto",
    "if",
    "inline",
    "int",
    "long",
    "register",
    "return",
    "short",
    "signed",
    "sizeof",
    "static",
    "struct",
    "switch",
    "typedef",
    "union",
    "unsigned",
    "void",
    "volatile",
    "while",
  ],
  cpp: [
    "alignas",
    "alignof",
    "auto",
    "break",
    "case",
    "catch",
    "class",
    "concept",
    "const",
    "constexpr",
    "continue",
    "default",
    "delete",
    "do",
    "else",
    "enum",
    "explicit",
    "export",
    "extern",
    "for",
    "friend",
    "if",
    "import",
    "inline",
    "namespace",
    "new",
    "noexcept",
    "operator",
    "private",
    "protected",
    "public",
    "requires",
    "return",
    "sizeof",
    "static",
    "struct",
    "switch",
    "template",
    "this",
    "throw",
    "try",
    "typedef",
    "typename",
    "union",
    "using",
    "virtual",
    "while",
  ],
  csharp: [
    "abstract",
    "as",
    "async",
    "await",
    "base",
    "break",
    "case",
    "catch",
    "class",
    "const",
    "continue",
    "default",
    "delegate",
    "do",
    "else",
    "enum",
    "event",
    "explicit",
    "extern",
    "finally",
    "for",
    "foreach",
    "if",
    "implicit",
    "in",
    "interface",
    "internal",
    "is",
    "lock",
    "namespace",
    "new",
    "operator",
    "out",
    "override",
    "params",
    "private",
    "protected",
    "public",
    "readonly",
    "record",
    "ref",
    "return",
    "sealed",
    "static",
    "struct",
    "switch",
    "this",
    "throw",
    "try",
    "typeof",
    "using",
    "virtual",
    "while",
  ],
  go: [
    "break",
    "case",
    "chan",
    "const",
    "continue",
    "default",
    "defer",
    "else",
    "fallthrough",
    "for",
    "func",
    "go",
    "goto",
    "if",
    "import",
    "interface",
    "map",
    "package",
    "range",
    "return",
    "select",
    "struct",
    "switch",
    "type",
    "var",
  ],
  java: [
    "abstract",
    "assert",
    "break",
    "case",
    "catch",
    "class",
    "const",
    "continue",
    "default",
    "do",
    "else",
    "enum",
    "extends",
    "final",
    "finally",
    "for",
    "if",
    "implements",
    "import",
    "instanceof",
    "interface",
    "native",
    "new",
    "package",
    "private",
    "protected",
    "public",
    "record",
    "return",
    "sealed",
    "static",
    "strictfp",
    "super",
    "switch",
    "synchronized",
    "this",
    "throw",
    "throws",
    "transient",
    "try",
    "volatile",
    "while",
  ],
  javascript: [
    "as",
    "async",
    "await",
    "break",
    "case",
    "catch",
    "class",
    "const",
    "continue",
    "debugger",
    "default",
    "delete",
    "do",
    "else",
    "export",
    "extends",
    "finally",
    "for",
    "from",
    "function",
    "get",
    "if",
    "import",
    "in",
    "instanceof",
    "let",
    "new",
    "of",
    "return",
    "set",
    "static",
    "super",
    "switch",
    "this",
    "throw",
    "try",
    "typeof",
    "var",
    "void",
    "while",
    "with",
    "yield",
  ],
  python: [
    "and",
    "as",
    "assert",
    "async",
    "await",
    "break",
    "case",
    "class",
    "continue",
    "def",
    "del",
    "elif",
    "else",
    "except",
    "finally",
    "for",
    "from",
    "global",
    "if",
    "import",
    "in",
    "is",
    "lambda",
    "match",
    "nonlocal",
    "not",
    "or",
    "pass",
    "raise",
    "return",
    "try",
    "while",
    "with",
    "yield",
  ],
  ruby: [
    "alias",
    "and",
    "begin",
    "break",
    "case",
    "class",
    "def",
    "defined",
    "do",
    "else",
    "elsif",
    "end",
    "ensure",
    "for",
    "if",
    "in",
    "module",
    "next",
    "not",
    "or",
    "redo",
    "rescue",
    "retry",
    "return",
    "self",
    "super",
    "then",
    "undef",
    "unless",
    "until",
    "when",
    "while",
    "yield",
  ],
  rust: [
    "as",
    "async",
    "await",
    "break",
    "const",
    "continue",
    "crate",
    "dyn",
    "else",
    "enum",
    "extern",
    "fn",
    "for",
    "if",
    "impl",
    "in",
    "let",
    "loop",
    "match",
    "mod",
    "move",
    "mut",
    "pub",
    "ref",
    "return",
    "self",
    "static",
    "struct",
    "super",
    "trait",
    "type",
    "union",
    "unsafe",
    "use",
    "where",
    "while",
  ],
  sql: [
    "add",
    "all",
    "alter",
    "and",
    "as",
    "asc",
    "begin",
    "between",
    "by",
    "case",
    "check",
    "column",
    "commit",
    "constraint",
    "create",
    "cross",
    "database",
    "default",
    "delete",
    "desc",
    "distinct",
    "drop",
    "else",
    "end",
    "exists",
    "foreign",
    "from",
    "full",
    "group",
    "having",
    "in",
    "index",
    "inner",
    "insert",
    "into",
    "is",
    "join",
    "left",
    "like",
    "limit",
    "not",
    "null",
    "on",
    "or",
    "order",
    "outer",
    "primary",
    "references",
    "right",
    "rollback",
    "select",
    "set",
    "table",
    "then",
    "union",
    "unique",
    "update",
    "values",
    "view",
    "when",
    "where",
    "with",
  ],
  typescript: [
    "abstract",
    "any",
    "as",
    "asserts",
    "async",
    "await",
    "boolean",
    "break",
    "case",
    "catch",
    "class",
    "const",
    "continue",
    "debugger",
    "declare",
    "default",
    "delete",
    "do",
    "else",
    "enum",
    "export",
    "extends",
    "finally",
    "for",
    "from",
    "function",
    "get",
    "if",
    "implements",
    "import",
    "in",
    "infer",
    "instanceof",
    "interface",
    "is",
    "keyof",
    "let",
    "module",
    "namespace",
    "never",
    "new",
    "number",
    "object",
    "of",
    "private",
    "protected",
    "public",
    "readonly",
    "return",
    "set",
    "static",
    "string",
    "super",
    "switch",
    "symbol",
    "this",
    "throw",
    "try",
    "type",
    "typeof",
    "undefined",
    "unknown",
    "var",
    "void",
    "while",
    "with",
    "yield",
  ],
}

const LANGUAGE_FAMILIES: Readonly<Record<string, string>> = {
  dart: "java",
  kotlin: "java",
  objectivec: "c",
  swift: "java",
}

const cachedRules = new Map<string, readonly TokenRule[]>()

function normalizeLanguage(language: string): string {
  const normalized = language
    .trim()
    .toLowerCase()
    .replace(/^language-/u, "")
  return LANGUAGE_ALIASES[normalized] ?? normalized
}

function wordsExpression(words: readonly string[]): RegExp {
  return new RegExp(`\\b(?:${words.join("|")})\\b`, "gimu")
}

function rule(
  kind: CodeHighlightKind,
  source: string,
  flags = "gmu"
): TokenRule {
  return { kind, expression: new RegExp(source, flags) }
}

function rulesForLanguage(language: string): readonly TokenRule[] {
  const normalized = normalizeLanguage(language)
  const cached = cachedRules.get(normalized)
  if (cached) return cached

  const family = LANGUAGE_FAMILIES[normalized] ?? normalized
  const rules: TokenRule[] = []

  if (normalized === "diff" || normalized === "git-diff") {
    rules.push(
      rule("inserted", "^\\+.*$"),
      rule("deleted", "^-.*$"),
      rule("keyword", "^(?:@@|diff\\b|index\\b).*$", "gimu")
    )
  }

  if (["html", "xml", "svg", "markdown"].includes(normalized)) {
    rules.push(rule("comment", "<!--[\\s\\S]*?-->", "gu"))
  } else if (["bash", "python", "ruby", "yaml"].includes(normalized)) {
    rules.push(rule("comment", "#[^\\n]*"))
  } else if (normalized === "sql") {
    rules.push(rule("comment", "(?:--[^\\n]*|/\\*[\\s\\S]*?\\*/)", "gu"))
  } else if (normalized !== "json") {
    rules.push(rule("comment", "(?://[^\\n]*|/\\*[\\s\\S]*?\\*/)", "gu"))
  }

  if (["json", "yaml", "toml"].includes(normalized)) {
    rules.push(
      rule(
        "property",
        '(?:"(?:\\\\.|[^"\\\\])*"|[A-Za-z_][\\w.-]*)(?=\\s*[:=])',
        "gu"
      )
    )
  }

  rules.push(
    rule(
      "string",
      "(?:`(?:\\\\[\\s\\S]|[^`\\\\])*`|\"(?:\\\\[\\s\\S]|[^\"\\\\])*\"|'(?:\\\\[\\s\\S]|[^'\\\\])*')",
      "gu"
    )
  )

  if (["html", "xml", "svg"].includes(normalized)) {
    rules.push(
      rule("tag", "</?[A-Za-z][\\w:-]*", "gu"),
      rule("property", "\\b[A-Za-z_:][\\w:.-]*(?=\\s*=)", "gu")
    )
  }

  if (["css", "scss"].includes(normalized)) {
    rules.push(
      rule("property", "--?[A-Za-z_][\\w-]*(?=\\s*:)", "gu"),
      rule("selector", "[.#]?-?[A-Za-z_][\\w-]*(?=\\s*(?:[,{]))", "gu"),
      rule("keyword", "@[A-Za-z-]+", "gu")
    )
  }

  if (normalized === "markdown") {
    rules.push(
      rule("keyword", "^#{1,6}(?=\\s)"),
      rule("string", "!?\\[[^\\]\\n]+\\]\\([^\\s)]+\\)", "gu"),
      rule("operator", "(?:\\*\\*|__|~~|`+)", "gu")
    )
  }

  const keywords = KEYWORDS[family]
  if (keywords)
    rules.push({ kind: "keyword", expression: wordsExpression(keywords) })

  rules.push(
    rule(
      "keyword",
      "\\b(?:false|null|true|undefined|None|False|True|nil)\\b",
      "gimu"
    ),
    rule("function", "\\b[A-Za-z_$][\\w$]*(?=\\s*\\()", "gu"),
    rule("type", "\\b[A-Z][A-Za-z0-9_$]*\\b", "gu"),
    rule(
      "number",
      "\\b(?:0[xob][0-9a-f_]+|\\d(?:[\\d_]*\\.?[\\d_]*)(?:e[+-]?\\d+)?)\\b",
      "gimu"
    ),
    rule("variable", "\\$[A-Za-z_][\\w]*", "gu"),
    rule(
      "operator",
      "(?:=>|===?|!==?|\\?\\?|\\?\\.|\\+\\+|--|&&|\\|\\||<<|>>>?|[-+*/%&|^~?:]=?|[<>]=?)",
      "gu"
    )
  )

  cachedRules.set(normalized, rules)
  return rules
}

/**
 * A compact, dependency-free tokenizer for common fenced-code languages.
 * It deliberately emits semantic ranges rather than DOM nodes so rendering
 * can use the CSS Custom Highlight API without changing Lexical's document.
 */
export const tokenizeCodeLightweight: CodeHighlightTokenizer = (
  code,
  language
) => {
  if (!code || !language || /^(?:plain|plaintext|text|txt)$/iu.test(language)) {
    return []
  }

  const rules = rulesForLanguage(language)
  const tokens: CodeHighlightToken[] = []
  let cursor = 0

  while (cursor < code.length) {
    let winner:
      | {
          start: number
          end: number
          kind: CodeHighlightKind
          priority: number
        }
      | undefined

    rules.forEach((candidate, priority) => {
      candidate.expression.lastIndex = cursor
      const match = candidate.expression.exec(code)
      if (!match) return
      const start = match.index
      const end = start + match[0].length
      if (
        end > start &&
        (!winner ||
          start < winner.start ||
          (start === winner.start && priority < winner.priority))
      ) {
        winner = { start, end, kind: candidate.kind, priority }
      }
    })

    if (!winner) break
    tokens.push({ start: winner.start, end: winner.end, kind: winner.kind })
    cursor = winner.end
  }

  return tokens
}
