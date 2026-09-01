import {
  $generateNodesFromMarkdownString,
  TEXT_FORMAT_TRANSFORMERS,
  TEXT_MATCH_TRANSFORMERS,
  type MultilineElementTransformer,
  type Transformer,
} from "@lexical/markdown"
import {
  $createTableCellNode,
  $createTableNode,
  $createTableRowNode,
  $isTableCellNode,
  $isTableNode,
  $isTableRowNode,
  TableCellHeaderStates,
  TableCellNode,
  TableNode,
  TableRowNode,
} from "@lexical/table"
import {
  $createParagraphNode,
  $isElementNode,
  type ElementFormatType,
  type ElementNode,
} from "lexical"

const TABLE_ROW = /^\s*\|?.+\|.+\|?\s*$/u
const TABLE_CELL_TRANSFORMERS: Transformer[] = [
  ...TEXT_FORMAT_TRANSFORMERS,
  ...TEXT_MATCH_TRANSFORMERS,
]

type TableAlignment = Extract<ElementFormatType, "left" | "center" | "right">

function splitTableRow(line: string): string[] {
  const trimmed = line.trim()
  const content = trimmed.replace(/^\|/u, "").replace(/(?<!\\)\|$/u, "")
  const cells: string[] = []
  let cell = ""
  let escaped = false

  for (const character of content) {
    if (character === "|" && !escaped) {
      cells.push(cell.trim())
      cell = ""
      continue
    }
    cell += character
    if (character === "\\") escaped = !escaped
    else escaped = false
  }
  cells.push(cell.trim())
  return cells
}

function readTableAlignments(line: string): (TableAlignment | null)[] | null {
  const cells = splitTableRow(line)
  if (cells.length < 2) return null
  const alignments: (TableAlignment | null)[] = []
  for (const cell of cells) {
    const marker = cell.replace(/\s/gu, "")
    if (!/^:?-{3,}:?$/u.test(marker)) return null
    alignments.push(
      marker.startsWith(":") && marker.endsWith(":")
        ? "center"
        : marker.endsWith(":")
          ? "right"
          : marker.startsWith(":")
            ? "left"
            : null
    )
  }
  return alignments
}

function createTableCell(
  markdown: string,
  header: boolean,
  alignment: TableAlignment | null
): TableCellNode {
  const cell = $createTableCellNode(
    header ? TableCellHeaderStates.ROW : TableCellHeaderStates.NO_STATUS
  )
  const nodes = $generateNodesFromMarkdownString(
    markdown,
    TABLE_CELL_TRANSFORMERS
  )
  if (nodes.length === 0) nodes.push($createParagraphNode())
  for (const node of nodes) {
    if (alignment && $isElementNode(node)) node.setFormat(alignment)
    cell.append(node)
  }
  return cell
}

function escapeTableCell(markdown: string): string {
  let escaped = ""
  let previousWasEscape = false
  for (const character of markdown.trim().replace(/\r?\n+/gu, " ")) {
    if (character === "|" && !previousWasEscape) escaped += "\\"
    escaped += character
    if (character === "\\") previousWasEscape = !previousWasEscape
    else previousWasEscape = false
  }
  return escaped
}

function tableAlignment(cell: ElementNode | undefined): TableAlignment | null {
  const firstChild = cell?.getFirstChild()
  if (!$isElementNode(firstChild)) return null
  const format = firstChild.getFormatType()
  return format === "left" || format === "center" || format === "right"
    ? format
    : null
}

function alignmentMarker(alignment: TableAlignment | null): string {
  if (alignment === "left") return ":---"
  if (alignment === "center") return ":---:"
  if (alignment === "right") return "---:"
  return "---"
}

export const TABLE: MultilineElementTransformer = {
  dependencies: [TableNode, TableRowNode, TableCellNode],
  export: (node, traverseChildren) => {
    if (!$isTableNode(node)) return null
    const rows = node.getChildren().filter($isTableRowNode)
    if (rows.length === 0) return ""
    const columnCount = Math.max(
      1,
      ...rows.map((row) => row.getChildren().filter($isTableCellNode).length)
    )
    const markdownRows = rows.map((row) => {
      const cells = row.getChildren().filter($isTableCellNode)
      const values = Array.from({ length: columnCount }, (_, index) => {
        const cell = cells[index]
        return cell ? escapeTableCell(traverseChildren(cell)) : ""
      })
      return `| ${values.join(" | ")} |`
    })
    const headerCells = rows[0].getChildren().filter($isTableCellNode)
    const separator = Array.from({ length: columnCount }, (_, index) =>
      alignmentMarker(tableAlignment(headerCells[index]))
    )
    markdownRows.splice(1, 0, `| ${separator.join(" | ")} |`)
    return markdownRows.join("\n")
  },
  regExpStart: TABLE_ROW,
  handleImportAfterStartMatch: ({ lines, rootNode, startLineIndex }) => {
    const delimiterLine = lines[startLineIndex + 1]
    if (delimiterLine === undefined) return null
    const alignments = readTableAlignments(delimiterLine)
    if (!alignments) return null

    const headerCells = splitTableRow(lines[startLineIndex])
    const columnCount = Math.max(headerCells.length, alignments.length)
    const table = $createTableNode()
    const sourceRows = [headerCells]
    let endLineIndex = startLineIndex + 2
    while (endLineIndex < lines.length && TABLE_ROW.test(lines[endLineIndex])) {
      sourceRows.push(splitTableRow(lines[endLineIndex]))
      endLineIndex += 1
    }

    sourceRows.forEach((values, rowIndex) => {
      const row = $createTableRowNode()
      for (let columnIndex = 0; columnIndex < columnCount; columnIndex += 1) {
        row.append(
          createTableCell(
            values[columnIndex] ?? "",
            rowIndex === 0,
            alignments[columnIndex] ?? null
          )
        )
      }
      table.append(row)
    })
    rootNode.append(table)
    return [true, endLineIndex - 1]
  },
  replace: () => false,
  type: "multiline-element",
}
