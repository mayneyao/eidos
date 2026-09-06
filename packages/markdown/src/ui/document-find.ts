export interface TextMatch {
  start: number
  end: number
}

export function findLiteralText(
  text: string,
  query: string,
  limit = 2000
): { matches: TextMatch[]; limited: boolean } {
  if (!query) return { matches: [], limited: false }
  const pattern = new RegExp(
    query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
    "giu"
  )
  const matches: TextMatch[] = []
  for (const match of text.matchAll(pattern)) {
    if (matches.length === limit) return { matches, limited: true }
    matches.push({ start: match.index, end: match.index + match[0].length })
  }
  return { matches, limited: false }
}

/** Collect rendered text without changing Lexical nodes or native selection. */
export function findDocumentRanges(
  root: HTMLElement,
  query: string
): { ranges: Range[]; limited: boolean } {
  const parts: { node: Text; start: number; end: number }[] = []
  let text = ""
  let previousBlock: Element | null = null
  const walker = root.ownerDocument.createTreeWalker(root, NodeFilter.SHOW_TEXT)
  let next: Node | null
  while ((next = walker.nextNode())) {
    const node = next as Text
    const parent = node.parentElement
    if (
      !parent ||
      parent.closest(
        'button,textarea,input,select,script,style,[hidden],[aria-hidden="true"]'
      )
    )
      continue
    let hidden = false
    for (
      let element: HTMLElement | null = parent;
      element && element !== root;
      element = element.parentElement
    ) {
      const style = getComputedStyle(element)
      if (style.display === "none" || style.visibility === "hidden") {
        hidden = true
        break
      }
    }
    if (hidden) continue
    const block = parent.closest("p,li,h1,h2,h3,h4,h5,h6,pre,td,th,blockquote")
    if (parts.length && block !== previousBlock) text += "\n"
    previousBlock = block
    const start = text.length
    text += node.data
    if (node.length) parts.push({ node, start, end: text.length })
  }
  const found = findLiteralText(text, query)
  const ranges: Range[] = []
  let cursor = 0
  for (const match of found.matches) {
    while (cursor < parts.length && parts[cursor]!.end <= match.start) cursor++
    const first = parts[cursor]
    let endCursor = cursor
    while (endCursor < parts.length && parts[endCursor]!.end < match.end)
      endCursor++
    const last = parts[endCursor]
    if (!first || !last || first.start > match.start || last.start > match.end)
      continue
    const range = root.ownerDocument.createRange()
    range.setStart(first.node, match.start - first.start)
    range.setEnd(last.node, match.end - last.start)
    ranges.push(range)
  }
  return { ranges, limited: found.limited }
}

export function revealTextMatch(range: Range): void {
  const element = range.startContainer.parentElement
  const scroll = element?.closest<HTMLElement>(".eme-editor-stage")
  const rectangle = range.getBoundingClientRect()
  if (scroll && rectangle.height) {
    const bounds = scroll.getBoundingClientRect()
    scroll.scrollTop += rectangle.top - bounds.top - bounds.height / 2
  } else element?.scrollIntoView({ block: "center", inline: "nearest" })
}
