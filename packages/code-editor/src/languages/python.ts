import type * as monaco from "monaco-editor"

/**
 * Python language configuration
 */
export function configurePythonLanguage(monacoInstance: typeof monaco): void {
  // Register Python language
  monacoInstance.languages.register({ id: "python" })

  // Set Python syntax highlighting
  monacoInstance.languages.setMonarchTokensProvider("python", {
    keywords: [
      "False",
      "None", 
      "True",
      "and",
      "as",
      "assert",
      "async",
      "await",
      "break",
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
    tokenizer: {
      root: [
        [
          /[a-zA-Z_]\w*/,
          {
            cases: {
              "@keywords": "keyword",
              "@default": "identifier",
            },
          },
        ],
        [/#.*$/, "comment"],
        [/".*?"/, "string"],
        [/'.*?'/, "string"],
        [/\d+/, "number"],
      ],
    },
  })
}

/**
 * Get Python editor default options
 */
export function getPythonEditorOptions(): monaco.editor.IStandaloneEditorConstructionOptions {
  return {
    minimap: { enabled: false },
    wordWrap: "on",
    scrollBeyondLastLine: false,
    automaticLayout: true,
  }
}
