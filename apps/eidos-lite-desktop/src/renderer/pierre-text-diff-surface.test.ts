import { createElement, type ReactNode } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import type { FileDiffMetadata } from "@pierre/diffs"
import { beforeEach, describe, expect, it, vi } from "vitest"

const fileDiffOptions = vi.hoisted(() => vi.fn())

vi.mock("@pierre/diffs/react", () => ({
  Virtualizer: ({ children }: { children: ReactNode }) => children,
  FileDiff: ({ options }: { options: { themeType: "light" | "dark" } }) => {
    fileDiffOptions(options)
    return null
  },
}))

import PierreTextDiffSurface from "./pierre-text-diff-surface"

describe("PierreTextDiffSurface", () => {
  beforeEach(() => fileDiffOptions.mockClear())

  it.each(["light", "dark"] as const)(
    "synchronizes the %s application theme to Pierre",
    (theme) => {
      renderToStaticMarkup(
        createElement(PierreTextDiffSurface, {
          diff: {} as FileDiffMetadata,
          layout: "unified",
          theme,
        })
      )

      expect(fileDiffOptions).toHaveBeenCalledWith(
        expect.objectContaining({ themeType: theme })
      )
    }
  )
})
