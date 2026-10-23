import { useEffect, useRef, useState } from "react"
import {
  decodeEidosFileValues,
  type EidosFileRowPage,
  type FileEntry,
} from "@eidos.space/eidos-file"
import { EidosFileEntrySurface } from "./eidos-file-entry-surface"
import { rowFromWindow, type EidosFileRowWindow } from "./eidos-file-row-window"

/** Keep one preview mounted while traversing the Gallery's filtered row order. */
export function EidosFileGalleryPreview({
  initial,
  rowWindow,
  coverColumn,
  loadPage,
  onClose,
  onError,
}: {
  initial: { entry: FileEntry; index: number }
  rowWindow: EidosFileRowWindow
  coverColumn: string
  loadPage: (
    offset: number,
    limit: number,
    totalHint?: number
  ) => Promise<EidosFileRowPage>
  onClose: () => void
  onError?: (error: unknown) => void
}) {
  const [current, setCurrent] = useState(initial)
  const [unavailable, setUnavailable] = useState({
    previous: false,
    next: false,
  })
  const generation = useRef(0)
  const position = useRef(initial.index)
  useEffect(
    () => () => {
      generation.current += 1
    },
    []
  )
  const close = () => {
    generation.current += 1
    onClose()
  }
  const navigate = async (direction: -1 | 1) => {
    const request = ++generation.current
    let index = position.current + direction
    position.current = index
    try {
      while (index >= 0 && index < rowWindow.total) {
        const cached = rowFromWindow(rowWindow, index)
        const offset = cached
          ? index
          : direction > 0
            ? index
            : Math.max(0, index - 31)
        const rows = cached
          ? [cached]
          : (
              await loadPage(
                offset,
                Math.min(32, rowWindow.total - offset),
                rowWindow.total
              )
            ).rows
        if (request !== generation.current) return
        const candidates = rows
          .map((row, at) => ({ row, index: offset + at }))
          .filter((candidate) =>
            direction > 0 ? candidate.index >= index : candidate.index <= index
          )
        if (direction < 0) candidates.reverse()
        for (const candidate of candidates) {
          const entry = decodeEidosFileValues(candidate.row[coverColumn]).at(0)
          if (!entry) continue
          position.current = candidate.index
          setCurrent({ entry, index: candidate.index })
          setUnavailable({ previous: false, next: false })
          return
        }
        if (rows.length === 0) break
        index = direction > 0 ? offset + rows.length : offset - 1
      }
      if (request === generation.current) {
        position.current = current.index
        setUnavailable((value) => ({
          ...value,
          [direction < 0 ? "previous" : "next"]: true,
        }))
      }
    } catch (error) {
      if (request !== generation.current) return
      position.current = current.index
      onError?.(error)
    }
  }
  return (
    <EidosFileEntrySurface
      entry={current.entry}
      presentation="preview"
      onPreviewClose={close}
      onPrevious={
        current.index > 0 && !unavailable.previous
          ? () => void navigate(-1)
          : undefined
      }
      onNext={
        current.index + 1 < rowWindow.total && !unavailable.next
          ? () => void navigate(1)
          : undefined
      }
    />
  )
}
