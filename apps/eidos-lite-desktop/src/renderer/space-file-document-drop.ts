import type { MarkdownFileDropHandler } from "@eidos.space/markdown"
import {
  EIDOS_LITE_SPACE_PATH_DRAG_TYPE,
  EIDOS_LITE_SPACE_ID_DRAG_TYPE,
  spacePathDragPaths,
} from "./space-path-drag"

export const spaceFileDocumentDrop: MarkdownFileDropHandler = {
  accepts: (types) =>
    types.includes(EIDOS_LITE_SPACE_PATH_DRAG_TYPE) &&
    types.includes(EIDOS_LITE_SPACE_ID_DRAG_TYPE),
  async resolve({ dataTransfer, signal }) {
    const spaceId = dataTransfer.getData(EIDOS_LITE_SPACE_ID_DRAG_TYPE)
    const paths = [...new Set(spacePathDragPaths(dataTransfer))]
    if (
      !spaceId ||
      !paths.length ||
      paths.some(
        (path) =>
          !path ||
          /[\\\u0000-\u001f]/u.test(path) ||
          path.startsWith("/") ||
          /^[A-Za-z]:/u.test(path) ||
          path
            .split("/")
            .some(
              (part) =>
                !part ||
                part === "." ||
                part === ".." ||
                [".graft", ".eidos", ".git"].includes(part.toLowerCase())
            )
      )
    )
      return []
    if (signal.aborted || (await window.eidosLite.getSpace())?.id !== spaceId)
      return []
    const hits = await Promise.all(
      paths.map(async (path) => {
        const name = path.split("/").at(-1)!
        const hit = (await window.eidosLite.searchSpacePaths(name, 200)).find(
          (hit) =>
            hit.relativePath === path &&
            (hit.kind === "file" || hit.kind === "eidos")
        )
        if (!hit) return null
        const url = `/${path.split("/").map(encodeURIComponent).join("/")}`
        return {
          title: hit.name,
          path: url,
          ...(/\.(?:png|jpe?g|gif|webp|avif|bmp|ico|svg)$/iu.test(hit.name)
            ? { imageUrl: url }
            : {}),
        }
      })
    )
    if (
      signal.aborted ||
      hits.some((hit) => !hit) ||
      (await window.eidosLite.getSpace())?.id !== spaceId
    )
      return []
    return hits.filter((hit): hit is NonNullable<typeof hit> => hit !== null)
  },
}
