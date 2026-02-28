import type { CompletionContext } from "@codemirror/autocomplete"
import type { LanguageSupport } from "@codemirror/language"
import { syntaxTree } from "@codemirror/language"
import type { Range } from "@codemirror/state"
import type { DecorationSet, ViewUpdate } from "@codemirror/view"
import { Decoration, EditorView, ViewPlugin } from "@codemirror/view"
import type { SyntaxNode } from "@lezer/common"

const variableMark = Decoration.mark({ class: "cm-handlebar" })

function decorateVariable(view: EditorView) {
  const decorationList: Range<Decoration>[] = []

  for (const { from, to } of view.visibleRanges) {
    const text = view.state.doc.sliceString(from, to)

    for (const match of text.matchAll(
      /(\{\{[\w\d-_]+\}\})|(\[\[[\w\d-_]+\]\])/g
    )) {
      decorationList.push(
        variableMark.range(
          from + (match.index ?? 0),
          from + (match.index ?? 0) + (match[0]?.length ?? 0)
        )
      )
    }
  }

  return Decoration.set(decorationList)
}

const variableHighlightView = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet
    constructor(view: EditorView) {
      this.decorations = decorateVariable(view)
    }
    update(update: ViewUpdate) {
      this.decorations = decorateVariable(update.view)
    }
  },
  { decorations: (v) => v.decorations }
)

const variableHighlightTheme = EditorView.baseTheme({
  ".cm-handlebar": {
    color: "#f20b97",
    "font-weight": "bold",
  },
  ".cm-handlebar span": {
    color: "#f20b97 !important",
  },
  "&dark .cm-handlebar": {
    color: "#f9bbe6",
  },
  "&dark .cm-handlebar span": {
    color: "#f9bbe6 !important",
  },
})

export function createVariableHighlightPlugin({
  variables,
  language,
}: {
  variables: string
  language: LanguageSupport
}) {
  const variableList = variables.split(",").map((v) => v.trim())

  function handlebarCompletion(context: CompletionContext) {
    const node = syntaxTree(context.state).resolveInner(context.pos)

    const ptr: SyntaxNode | null | undefined = node.parent

    if (ptr?.type.name === "Braces" || ptr?.type.name === "Brackets") {
      return {
        from: node.from + 1,
        options: variableList.map((variableName) => ({
          label: variableName,
          type: "variable",
          boost: 1000,
        })),
        filter: false,
      }
    }

    return null
  }

  const extensions = [
    variableHighlightView,
    variableHighlightTheme,
    variableList
      ? language.language.data.of({
          autocomplete: handlebarCompletion,
        })
      : undefined,
  ].filter(Boolean)

  return extensions
}
