import type {
  KeyboardShortcutEvent,
  MarkdownShortcutId,
} from "../shortcuts/shortcut-registry"

export const SOURCE_TEXTAREA_SHORTCUT_IDS = [
  "format.bold",
  "format.italic",
  "source-editor.copy-line-down",
  "source-editor.copy-line-up",
  "source-editor.delete-line",
  "source-editor.indent",
  "source-editor.move-line-down",
  "source-editor.move-line-up",
  "source-editor.outdent",
  "source-editor.select-line",
] as const satisfies readonly MarkdownShortcutId[]

export type SourceTextareaCommand =
  | "copy-line-down"
  | "copy-line-up"
  | "delete-line"
  | "indent"
  | "move-line-down"
  | "move-line-up"
  | "outdent"
  | "select-line"
  | "toggle-bold"
  | "toggle-italic"

export interface SourceTextareaState {
  selectionEnd: number
  selectionStart: number
  value: string
}

interface SourceLine {
  content: string
  contentEnd: number
  end: number
  ending: string
  start: number
}

interface SourceLineSelection {
  first: number
  last: number
}

const SOURCE_INDENT = "  "

const SOURCE_TEXTAREA_COMMANDS = [
  ["format.bold", "toggle-bold"],
  ["format.italic", "toggle-italic"],
  ["source-editor.copy-line-down", "copy-line-down"],
  ["source-editor.copy-line-up", "copy-line-up"],
  ["source-editor.delete-line", "delete-line"],
  ["source-editor.indent", "indent"],
  ["source-editor.move-line-down", "move-line-down"],
  ["source-editor.move-line-up", "move-line-up"],
  ["source-editor.outdent", "outdent"],
  ["source-editor.select-line", "select-line"],
] as const satisfies readonly (readonly [
  MarkdownShortcutId,
  SourceTextareaCommand,
])[]

function adjacentMarkerLength(
  value: string,
  offset: number,
  direction: -1 | 1
): number {
  let length = 0
  let index = direction < 0 ? offset - 1 : offset
  while (index >= 0 && index < value.length && value[index] === "*") {
    length += 1
    index += direction
  }
  return length
}

function toggleMarkdownInline(
  state: SourceTextareaState,
  delimiter: "*" | "**"
): SourceTextareaState {
  const { selectionEnd, selectionStart, value } = state
  const delimiterLength = delimiter.length

  if (selectionStart === selectionEnd) {
    const before = value.slice(selectionStart - delimiterLength, selectionStart)
    const after = value.slice(selectionEnd, selectionEnd + delimiterLength)
    if (before === delimiter && after === delimiter) {
      const caret = selectionStart - delimiterLength
      return {
        value: `${value.slice(0, caret)}${value.slice(selectionEnd + delimiterLength)}`,
        selectionStart: caret,
        selectionEnd: caret,
      }
    }
    const insertion = `${delimiter}${delimiter}`
    const caret = selectionStart + delimiterLength
    return {
      value: `${value.slice(0, selectionStart)}${insertion}${value.slice(selectionEnd)}`,
      selectionStart: caret,
      selectionEnd: caret,
    }
  }

  const selected = value.slice(selectionStart, selectionEnd)
  const selectedMarkersBefore = adjacentMarkerLength(selected, 0, 1)
  const selectedMarkersAfter = adjacentMarkerLength(
    selected,
    selected.length,
    -1
  )
  const selectedIsWrapped =
    delimiter === "**"
      ? selectedMarkersBefore >= 2 && selectedMarkersAfter >= 2
      : selectedMarkersBefore % 2 === 1 && selectedMarkersAfter % 2 === 1
  if (selected.length >= delimiterLength * 2 && selectedIsWrapped) {
    const unwrapped = selected.slice(delimiterLength, -delimiterLength)
    return {
      value: `${value.slice(0, selectionStart)}${unwrapped}${value.slice(selectionEnd)}`,
      selectionStart,
      selectionEnd: selectionStart + unwrapped.length,
    }
  }

  const markersBefore = adjacentMarkerLength(value, selectionStart, -1)
  const markersAfter = adjacentMarkerLength(value, selectionEnd, 1)
  const isWrapped =
    delimiter === "**"
      ? markersBefore >= 2 && markersAfter >= 2
      : markersBefore % 2 === 1 && markersAfter % 2 === 1
  if (isWrapped) {
    const start = selectionStart - delimiterLength
    return {
      value: `${value.slice(0, start)}${selected}${value.slice(selectionEnd + delimiterLength)}`,
      selectionStart: start,
      selectionEnd: selectionEnd - delimiterLength,
    }
  }

  return {
    value: `${value.slice(0, selectionStart)}${delimiter}${selected}${delimiter}${value.slice(selectionEnd)}`,
    selectionStart: selectionStart + delimiterLength,
    selectionEnd: selectionEnd + delimiterLength,
  }
}

function sourceLines(value: string): SourceLine[] {
  const lines: SourceLine[] = []
  let start = 0
  while (start < value.length) {
    let contentEnd = start
    while (
      contentEnd < value.length &&
      value[contentEnd] !== "\n" &&
      value[contentEnd] !== "\r"
    ) {
      contentEnd += 1
    }
    let end = contentEnd
    if (value[end] === "\r" && value[end + 1] === "\n") end += 2
    else if (value[end] === "\r" || value[end] === "\n") end += 1
    lines.push({
      content: value.slice(start, contentEnd),
      contentEnd,
      end,
      ending: value.slice(contentEnd, end),
      start,
    })
    start = end
  }
  if (lines.length === 0 || (start === value.length && lines.at(-1)?.ending)) {
    lines.push({
      content: "",
      contentEnd: value.length,
      end: value.length,
      ending: "",
      start: value.length,
    })
  }
  return lines
}

function lineIndexAt(lines: readonly SourceLine[], offset: number): number {
  const clamped = Math.max(0, offset)
  for (let index = 1; index < lines.length; index += 1) {
    if (clamped < lines[index].start) return index - 1
  }
  return lines.length - 1
}

function selectedLines(
  lines: readonly SourceLine[],
  selectionStart: number,
  selectionEnd: number
): SourceLineSelection {
  const first = lineIndexAt(lines, selectionStart)
  let last = lineIndexAt(lines, selectionEnd)
  if (
    selectionEnd > selectionStart &&
    last > first &&
    selectionEnd === lines[last].start
  ) {
    last -= 1
  }
  return { first, last }
}

function rebuildLines(
  lines: readonly SourceLine[],
  contents: readonly string[]
): string {
  return contents
    .map((content, index) => `${content}${lines[index].ending}`)
    .join("")
}

function lineEnding(lines: readonly SourceLine[]): string {
  return lines.find(({ ending }) => ending.length > 0)?.ending ?? "\n"
}

function pointOffset(
  lines: readonly SourceLine[],
  lineIndex: number,
  column: number
): number {
  if (lineIndex >= lines.length) return lines.at(-1)?.end ?? 0
  const line = lines[Math.max(0, lineIndex)]
  return line.start + Math.min(column, line.content.length)
}

function pointColumn(line: SourceLine, offset: number): number {
  return Math.max(0, Math.min(line.content.length, offset - line.start))
}

function indentSource(
  state: SourceTextareaState,
  lines: readonly SourceLine[],
  selection: SourceLineSelection
): SourceTextareaState {
  if (state.selectionStart === state.selectionEnd) {
    const value = `${state.value.slice(0, state.selectionStart)}${SOURCE_INDENT}${state.value.slice(state.selectionEnd)}`
    const caret = state.selectionStart + SOURCE_INDENT.length
    return { value, selectionStart: caret, selectionEnd: caret }
  }

  const starts = lines
    .slice(selection.first, selection.last + 1)
    .map(({ start }) => start)
  const contents = lines.map(({ content }, index) =>
    index >= selection.first && index <= selection.last
      ? `${SOURCE_INDENT}${content}`
      : content
  )
  const selectionStart =
    state.selectionStart +
    starts.filter((start) => start <= state.selectionStart).length *
      SOURCE_INDENT.length
  const selectionEnd =
    state.selectionEnd +
    starts.filter((start) => start < state.selectionEnd).length *
      SOURCE_INDENT.length
  return {
    value: rebuildLines(lines, contents),
    selectionStart,
    selectionEnd,
  }
}

function adjustedAfterRemovals(
  offset: number,
  removals: readonly { length: number; start: number }[]
): number {
  let removedBefore = 0
  for (const removal of removals) {
    if (offset <= removal.start) break
    if (offset < removal.start + removal.length) {
      return removal.start - removedBefore
    }
    removedBefore += removal.length
  }
  return offset - removedBefore
}

function outdentSource(
  state: SourceTextareaState,
  lines: readonly SourceLine[],
  selection: SourceLineSelection
): SourceTextareaState {
  const removals = lines
    .slice(selection.first, selection.last + 1)
    .flatMap((line) => {
      if (line.content.startsWith("\t")) {
        return [{ start: line.start, length: 1 }]
      }
      const spaces = line.content.match(/^ {1,2}/u)?.[0].length ?? 0
      return spaces > 0 ? [{ start: line.start, length: spaces }] : []
    })
  if (removals.length === 0) return state

  let value = state.value
  for (const removal of [...removals].reverse()) {
    value = `${value.slice(0, removal.start)}${value.slice(removal.start + removal.length)}`
  }
  return {
    value,
    selectionStart: adjustedAfterRemovals(state.selectionStart, removals),
    selectionEnd: adjustedAfterRemovals(state.selectionEnd, removals),
  }
}

function moveSourceLines(
  state: SourceTextareaState,
  lines: readonly SourceLine[],
  selection: SourceLineSelection,
  direction: -1 | 1
): SourceTextareaState {
  if (
    direction < 0 ? selection.first === 0 : selection.last === lines.length - 1
  ) {
    return state
  }

  const startPointLine = lineIndexAt(lines, state.selectionStart)
  const startColumn = pointColumn(lines[startPointLine], state.selectionStart)
  const endPointLine = lineIndexAt(lines, state.selectionEnd)
  const endColumn = pointColumn(lines[endPointLine], state.selectionEnd)
  const endAtFollowingLine =
    state.selectionEnd > state.selectionStart &&
    endPointLine === selection.last + 1 &&
    state.selectionEnd === lines[endPointLine].start

  const contents = lines.map(({ content }) => content)
  const moved = contents.splice(
    selection.first,
    selection.last - selection.first + 1
  )
  contents.splice(selection.first + direction, 0, ...moved)
  const value = rebuildLines(lines, contents)
  const nextLines = sourceLines(value)
  const movedFirst = selection.first + direction
  const movedLast = selection.last + direction
  return {
    value,
    selectionStart: pointOffset(
      nextLines,
      startPointLine + direction,
      startColumn
    ),
    selectionEnd: endAtFollowingLine
      ? pointOffset(nextLines, movedLast + 1, 0)
      : pointOffset(nextLines, endPointLine + direction, endColumn),
  }
}

function copySourceLines(
  state: SourceTextareaState,
  lines: readonly SourceLine[],
  selection: SourceLineSelection,
  direction: -1 | 1
): SourceTextareaState {
  const firstLine = lines[selection.first]
  const lastLine = lines[selection.last]
  const source = state.value.slice(firstLine.start, lastLine.end)
  const ending = lineEnding(lines)
  const insertion = lastLine.ending ? source : `${source}${ending}`
  if (direction < 0) {
    return {
      value: `${state.value.slice(0, firstLine.start)}${insertion}${state.value.slice(firstLine.start)}`,
      selectionStart: state.selectionStart + insertion.length,
      selectionEnd: state.selectionEnd + insertion.length,
    }
  }

  const insertAt = lastLine.end
  const copy = lastLine.ending ? source : `${ending}${source}`
  return {
    value: `${state.value.slice(0, insertAt)}${copy}${state.value.slice(insertAt)}`,
    selectionStart: state.selectionStart,
    selectionEnd: state.selectionEnd,
  }
}

function deleteSourceLines(
  state: SourceTextareaState,
  lines: readonly SourceLine[],
  selection: SourceLineSelection
): SourceTextareaState {
  let start = lines[selection.first].start
  const end = lines[selection.last].end
  if (end === state.value.length && start > 0) {
    start = lines[selection.first - 1].contentEnd
  }
  const value = `${state.value.slice(0, start)}${state.value.slice(end)}`
  const caret = Math.min(start, value.length)
  return { value, selectionStart: caret, selectionEnd: caret }
}

export function sourceTextareaCommandForEvent(
  event: KeyboardShortcutEvent,
  matches: (event: KeyboardShortcutEvent, id: MarkdownShortcutId) => boolean
): SourceTextareaCommand | null {
  for (const [id, command] of SOURCE_TEXTAREA_COMMANDS) {
    if (matches(event, id)) return command
  }
  return null
}

export function applySourceTextareaCommand(
  state: SourceTextareaState,
  command: SourceTextareaCommand
): SourceTextareaState {
  const selectionStart = Math.max(
    0,
    Math.min(state.value.length, state.selectionStart)
  )
  const selectionEnd = Math.max(
    selectionStart,
    Math.min(state.value.length, state.selectionEnd)
  )
  const normalized = { ...state, selectionStart, selectionEnd }
  const lines = sourceLines(state.value)
  const selection = selectedLines(lines, selectionStart, selectionEnd)

  switch (command) {
    case "toggle-bold":
      return toggleMarkdownInline(normalized, "**")
    case "toggle-italic":
      return toggleMarkdownInline(normalized, "*")
    case "indent":
      return indentSource(normalized, lines, selection)
    case "outdent":
      return outdentSource(normalized, lines, selection)
    case "move-line-up":
      return moveSourceLines(normalized, lines, selection, -1)
    case "move-line-down":
      return moveSourceLines(normalized, lines, selection, 1)
    case "copy-line-up":
      return copySourceLines(normalized, lines, selection, -1)
    case "copy-line-down":
      return copySourceLines(normalized, lines, selection, 1)
    case "delete-line":
      return deleteSourceLines(normalized, lines, selection)
    case "select-line": {
      return {
        ...normalized,
        selectionStart: lines[selection.first].start,
        selectionEnd: lines[selection.last].end,
      }
    }
  }
}
