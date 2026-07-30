import fs from "node:fs"
import path from "node:path"

export interface LiteWindowBounds {
  x: number
  y: number
  width: number
  height: number
}

interface PersistedWindowState {
  version: 1
  spaceBounds: LiteWindowBounds | null
}

const STATE_FILE = "window-state.json"

function finiteNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null
}

function parseBounds(value: unknown): LiteWindowBounds | null {
  if (!value || typeof value !== "object") return null
  const candidate = value as Record<string, unknown>
  const x = finiteNumber(candidate.x)
  const y = finiteNumber(candidate.y)
  const width = finiteNumber(candidate.width)
  const height = finiteNumber(candidate.height)
  if (x === null || y === null || width === null || height === null) return null
  if (width <= 0 || height <= 0) return null
  return { x, y, width, height }
}

export function centeredWindowBounds(
  size: Pick<LiteWindowBounds, "width" | "height">,
  workArea: LiteWindowBounds
): LiteWindowBounds {
  return fitWindowBounds(
    {
      x: workArea.x + (workArea.width - size.width) / 2,
      y: workArea.y + (workArea.height - size.height) / 2,
      ...size,
    },
    workArea,
    { width: 900, height: 600 }
  )
}

export function fitWindowBounds(
  requested: LiteWindowBounds,
  workArea: LiteWindowBounds,
  minimum: Pick<LiteWindowBounds, "width" | "height">
): LiteWindowBounds {
  const width = Math.min(
    workArea.width,
    Math.max(minimum.width, Math.round(requested.width))
  )
  const height = Math.min(
    workArea.height,
    Math.max(minimum.height, Math.round(requested.height))
  )
  const maximumX = workArea.x + workArea.width - width
  const maximumY = workArea.y + workArea.height - height
  return {
    x: Math.min(maximumX, Math.max(workArea.x, Math.round(requested.x))),
    y: Math.min(maximumY, Math.max(workArea.y, Math.round(requested.y))),
    width,
    height,
  }
}

export class LiteWindowStateStore {
  private readonly filePath: string
  private spaceBounds: LiteWindowBounds | null = null

  constructor(userDataPath: string) {
    this.filePath = path.join(userDataPath, STATE_FILE)
    try {
      const value = JSON.parse(fs.readFileSync(this.filePath, "utf8")) as {
        version?: unknown
        spaceBounds?: unknown
      }
      if (value.version === 1) this.spaceBounds = parseBounds(value.spaceBounds)
    } catch {
      this.spaceBounds = null
    }
  }

  getSpaceBounds(): LiteWindowBounds | null {
    return this.spaceBounds ? { ...this.spaceBounds } : null
  }

  saveSpaceBounds(bounds: LiteWindowBounds): void {
    const next = parseBounds(bounds)
    if (!next) return
    this.spaceBounds = next
    const state: PersistedWindowState = {
      version: 1,
      spaceBounds: next,
    }
    try {
      fs.mkdirSync(path.dirname(this.filePath), { recursive: true })
      const temporaryPath = `${this.filePath}.tmp`
      fs.writeFileSync(temporaryPath, `${JSON.stringify(state)}\n`, "utf8")
      fs.renameSync(temporaryPath, this.filePath)
    } catch (error) {
      console.warn("Could not save Eidos Lite window state", error)
    }
  }
}
