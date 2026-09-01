import type { EditorThemeClasses } from "lexical"

export const MARKDOWN_EDITOR_THEME: EditorThemeClasses = {
  code: "eme-code-block",
  heading: {
    h1: "eme-heading eme-heading-h1",
    h2: "eme-heading eme-heading-h2",
    h3: "eme-heading eme-heading-h3",
    h4: "eme-heading eme-heading-h4",
    h5: "eme-heading eme-heading-h5",
    h6: "eme-heading eme-heading-h6",
  },
  link: "eme-link",
  list: {
    checklist: "eme-check-list",
    listitem: "eme-list-item",
    listitemChecked: "eme-list-item-checked",
    listitemUnchecked: "eme-list-item-unchecked",
    nested: { listitem: "eme-nested-list-item" },
    ol: "eme-list eme-list-ordered",
    ul: "eme-list eme-list-unordered",
  },
  paragraph: "eme-paragraph",
  quote: "eme-quote",
  table: "eme-table",
  tableCell: "eme-table-cell",
  tableCellHeader: "eme-table-cell-header",
  tableCellSelected: "eme-table-cell-selected",
  tableRow: "eme-table-row",
  text: {
    bold: "eme-text-bold",
    code: "eme-inline-code",
    italic: "eme-text-italic",
    strikethrough: "eme-text-strikethrough",
  },
}
