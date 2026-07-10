const IMAGE_EXTENSIONS = new Set([
  "avif",
  "gif",
  "jpeg",
  "jpg",
  "png",
  "svg",
  "webp",
])

interface MarkdownNode {
  type: string
  value?: string
  url?: string
  alt?: string
  children?: MarkdownNode[]
}

function extensionOf(target: string): string {
  const path = target.split(/[?#]/, 1)[0]
  return path.split(".").pop()?.toLowerCase() ?? ""
}

function noteTarget(target: string): string {
  if (!target || target.startsWith("#")) return target
  const hashIndex = target.indexOf("#")
  const path = hashIndex >= 0 ? target.slice(0, hashIndex) : target
  const fragment = hashIndex >= 0 ? target.slice(hashIndex) : ""
  if (/\.[^/]+$/.test(path)) return target
  return `${path}.md${fragment}`
}

function displayLabel(target: string, alias?: string): string {
  if (alias) return alias
  const withoutHeading = target.split("#", 1)[0]
  const name = withoutHeading.split("/").pop() || target.replace(/^#/, "")
  return name.replace(/\.md$/i, "")
}

export function expandObsidianLinks(value: string): MarkdownNode[] | null {
  const pattern = /(!?)\[\[([^\]\n]+)\]\]/g
  const nodes: MarkdownNode[] = []
  let cursor = 0
  let matched = false

  for (const match of value.matchAll(pattern)) {
    matched = true
    const index = match.index ?? 0
    if (index > cursor) {
      nodes.push({ type: "text", value: value.slice(cursor, index) })
    }

    const embedded = match[1] === "!"
    const [rawTarget, ...aliasParts] = match[2].split("|")
    const target = rawTarget.trim()
    const alias = aliasParts.join("|").trim() || undefined

    if (embedded && IMAGE_EXTENSIONS.has(extensionOf(target))) {
      nodes.push({
        type: "image",
        url: target,
        alt: alias && !/^\d+(?:x\d+)?$/.test(alias) ? alias : "",
      })
    } else {
      nodes.push({
        type: "link",
        url: noteTarget(target),
        children: [
          { type: "text", value: displayLabel(target, alias) || target },
        ],
      })
    }
    cursor = index + match[0].length
  }

  if (!matched) return null
  if (cursor < value.length) {
    nodes.push({ type: "text", value: value.slice(cursor) })
  }
  return nodes
}

export function remarkObsidianLinks() {
  return (tree: unknown) => {
    if (!isMarkdownNode(tree)) return
    transformNode(tree)
  }
}

function isMarkdownNode(value: unknown): value is MarkdownNode {
  return (
    typeof value === "object" &&
    value !== null &&
    "type" in value &&
    typeof value.type === "string"
  )
}

function transformNode(node: MarkdownNode): void {
  if (!node.children || node.type === "link" || node.type === "linkReference") {
    return
  }

  for (let index = 0; index < node.children.length; index += 1) {
    const child = node.children[index]
    if (child.type === "text") {
      const replacement = expandObsidianLinks(child.value ?? "")
      if (replacement) {
        node.children.splice(index, 1, ...replacement)
        index += replacement.length - 1
      }
    } else {
      transformNode(child)
    }
  }
}
