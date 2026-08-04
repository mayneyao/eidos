import { describe, expect, it } from "vitest"

import { eidosLiteNewFileKind } from "./new-file"

describe("eidosLiteNewFileKind", () => {
  it.each(["Untitled.eidos", "DATA.EIDOS", "Untitled"])(
    "uses the Eidos File flow for %s",
    (name) => {
      expect(eidosLiteNewFileKind(name)).toBe("eidos")
    }
  )

  it.each(["notes.md", "config.json", "script.ts", ".gitignore"])(
    "uses the text-file flow for %s",
    (name) => {
      expect(eidosLiteNewFileKind(name)).toBe("text")
    }
  )
})
