import fs from "node:fs/promises"
import { constants } from "node:fs"
import path from "node:path"
import { isMap, isScalar, isSeq, parseDocument } from "yaml"
import { resolveSpaceDirectory } from "./space-paths"

const HEADER_BYTES = 64 * 1024

export function markdownNoteAliases(source: string): string[] {
  const header =
    /^\uFEFF?---[^\S\r\n]*\r?\n([\s\S]*?)\r?\n(?:---|\.\.\.)[^\S\r\n]*(?:\r?\n|$)/u.exec(
      source
    )
  if (!header) return []
  const document = parseDocument(header[1], { strict: true, uniqueKeys: true })
  if (document.errors.length || !isMap(document.contents)) return []
  const aliases = document.get("aliases", true) ?? document.get("alias", true)
  const values = isSeq(aliases) ? aliases.items : [aliases]
  return [
    ...new Set(
      values.flatMap((value) => {
        const alias =
          isScalar(value) && typeof value.value === "string"
            ? value.value.trim()
            : ""
        return alias && alias.length <= 512 && !/[\[\]\r\n]/u.test(alias)
          ? [alias]
          : []
      })
    ),
  ].slice(0, 128)
}

/** Bounded prefix reads; never follow a Markdown-file symlink or leave the Space. */
export async function readMarkdownNoteAliases(
  root: string,
  relativePath: string
): Promise<string[]> {
  let handle: fs.FileHandle | undefined
  try {
    const parts = relativePath.split("/")
    const name = parts.pop()!
    const directory = await resolveSpaceDirectory(root, parts.join("/") || null)
    handle = await fs.open(
      path.join(directory, name),
      constants.O_RDONLY | constants.O_NOFOLLOW
    )
    const stat = await handle.stat()
    if (!stat.isFile()) return []
    const bytes = Buffer.alloc(Math.min(HEADER_BYTES, stat.size))
    const { bytesRead } = await handle.read(bytes, 0, bytes.length, 0)
    const prefix = bytes.subarray(0, bytesRead)
    const encoding =
      prefix[0] === 0xff && prefix[1] === 0xfe
        ? "utf-16le"
        : prefix[0] === 0xfe && prefix[1] === 0xff
          ? "utf-16be"
          : "utf-8"
    return markdownNoteAliases(
      new TextDecoder(encoding, { fatal: true }).decode(prefix, {
        stream: stat.size > bytesRead,
      })
    )
  } catch {
    return []
  } finally {
    await handle?.close()
  }
}
