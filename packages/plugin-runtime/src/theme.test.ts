import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { afterEach, expect, it } from "vitest"
import { compilePlugin } from "./compiler"
import { parseManifest } from "./manifest"
import { decodePackage, encodePackage } from "./package"

const theme = {
  apiVersion: 1,
  kind: "theme" as const,
  id: "example.papyrus",
  name: "Papyrus",
  version: "1.0.0",
  requires: { pluginApi: "1.6.0" },
  theme: {
    light: {
      "--theme-surface": "#fffaf5",
      "--font-ui": "Papyrus UI, system-ui",
      "--control-radius": "8px",
    },
    dark: {
      "--theme-surface": "#211d1b",
      "--font-ui": "Papyrus UI, system-ui",
      "--control-radius": "8px",
    },
  },
}

it("accepts a standalone data-only theme and rejects host CSS or executable code", () => {
  expect(parseManifest(theme).theme).toEqual(theme.theme)
  expect(
    decodePackage(encodePackage(parseManifest(theme), {})).modules
  ).toEqual({})
  for (const change of [
    { light: { "--unknown": "red" } },
    { light: { "--theme-surface": "url(https://example.com/x)" } },
    { light: { "--theme-surface": "red; display: none" } },
    { light: { "--control-radius": "999px" } },
  ])
    expect(() =>
      parseManifest({ ...theme, theme: { ...theme.theme, ...change } })
    ).toThrow()
  expect(() => parseManifest({ ...theme, extension: "./main.ts" })).toThrow()
  expect(() =>
    parseManifest({ ...theme, browser: { workers: true } })
  ).toThrow()
  expect(() =>
    parseManifest({ ...theme, requires: { pluginApi: "1.5.0" } })
  ).toThrow()
  expect(() =>
    encodePackage(
      {
        ...parseManifest(theme),
        theme: {
          ...theme.theme,
          fonts: [{ family: "Papyrus UI", source: "./ui.woff2" }],
        },
      },
      {}
    )
  ).toThrow("embedded")
})

let directory: string | undefined
afterEach(async () => {
  if (directory) await fs.rm(directory, { recursive: true, force: true })
  directory = undefined
})

it("packs a local font into a standalone offline theme archive", async () => {
  directory = await fs.mkdtemp(path.join(os.tmpdir(), "eidos-theme-"))
  await fs.writeFile(
    path.join(directory, "plugin.json"),
    JSON.stringify({
      ...theme,
      theme: {
        ...theme.theme,
        fonts: [{ family: "Papyrus UI", source: "./ui.woff2" }],
      },
    })
  )
  await fs.writeFile(path.join(directory, "ui.woff2"), Buffer.from("wOF2mock"))
  const compiled = await compilePlugin(directory)
  expect(compiled.program.modules).toEqual({})
  expect(compiled.program.manifest.theme?.fonts?.[0].source).toMatch(
    /^data:font\/woff2;base64,/
  )
  expect(decodePackage(compiled.bytes).manifest.theme?.fonts).toHaveLength(1)
  expect(compiled.dependencies).toContain(
    path.join(await fs.realpath(directory), "ui.woff2")
  )
})
