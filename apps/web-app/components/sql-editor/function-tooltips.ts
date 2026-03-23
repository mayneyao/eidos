import type { Tooltip } from "@codemirror/view"
import { showTooltip, EditorView } from "@codemirror/view"
import type { EditorState } from "@codemirror/state"
import { StateField } from "@codemirror/state"
import { syntaxTree } from "@codemirror/language"

export type TooltipDirectionary = Record<
  string,
  { syntax: string; description: string }
>

function getCursorTooltips(
  state: EditorState,
  dict: TooltipDirectionary
): readonly Tooltip[] {
  const tree = syntaxTree(state)
  const pos = state.selection.main.head
  const node = tree.resolveInner(state.selection.main.head, -1)

  const parent = node.parent
  if (!parent) return []
  if (parent.type.name !== "Parens") return []

  if (!parent.prevSibling) return []
  if (!["Keyword", "Type"].includes(parent.prevSibling.type.name)) return []

  const keywordString = state.doc
    .slice(parent.prevSibling.from, parent.prevSibling.to)
    .toString()
    .toLowerCase()

  const dictItem = dict[keywordString]

  if (dictItem) {
    return [
      {
        pos: pos,
        above: true,
        arrow: true,
        create: () => {
          const dom = document.createElement("div")
          dom.className = "cm-tooltip-cursor"
          dom.innerHTML = `
            <div style="max-width:700px; padding:5px; font-size:14px;">
              <p style='font-size:16px;'><strong>${dictItem.syntax}</strong></p>
              <div class="code-tooltip">${dictItem.description}</div>
            </div>
            `
          return { dom }
        },
      },
    ]
  }

  return []
}

const functionTooltipField = (dict: TooltipDirectionary) => {
  return StateField.define<readonly Tooltip[]>({
    create(state) {
      return getCursorTooltips(state, dict)
    },

    update(tooltips, tr) {
      if (!tr.docChanged && !tr.selection) return tooltips
      return getCursorTooltips(tr.state, dict)
    },

    provide: (f) => showTooltip.computeN([f], (state) => state.field(f)),
  })
}

const functionTooltipBaseTheme = EditorView.baseTheme({
  ".cm-tooltip.cm-tooltip-cursor": {
    backgroundColor: "var(--popover)",
    color: "var(--popover-foreground)",
    border: "1px solid var(--border)",
    padding: "2px 7px",
    borderRadius: "4px",
    boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
    "& .cm-tooltip-arrow:before": {
      borderTopColor: "var(--border)",
    },
    "& .cm-tooltip-arrow:after": {
      borderTopColor: "var(--popover)",
    },
  },
  ".code-tooltip a": {
    color: "var(--primary)",
    textDecoration: "underline",
  },
  ".code-tooltip a:hover": {
    color: "var(--primary)",
    textDecoration: "none",
  },
})

export function functionTooltip(dict: TooltipDirectionary) {
  return [functionTooltipField(dict), functionTooltipBaseTheme]
}
