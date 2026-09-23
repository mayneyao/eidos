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
  theme: { stylesheet: "./styles/theme.css" },
}

const css =
  '@font-face { font-family: "Papyrus UI"; src: url("./ui.woff2") format("woff2"); font-weight: 400; font-display: swap; }\n' +
  ':root[data-theme="light"] { --theme-surface: #fffaf5; --font-ui: "Papyrus UI", system-ui; }\n' +
  ':root[data-theme="dark"] { --theme-surface: #211d1b; --font-ui: "Papyrus UI", system-ui; }\n'

it("accepts a CSS stylesheet entry and rejects the old manifest maps", () => {
  expect(parseManifest(theme).theme).toEqual(theme.theme)
  expect(() =>
    parseManifest({
      ...theme,
      theme: {
        light: { "--theme-surface": "#fff" },
        dark: { "--theme-surface": "#111" },
      },
    })
  ).toThrow()
  expect(() => parseManifest({ ...theme, extension: "./main.ts" })).toThrow()
  expect(() =>
    parseManifest({ ...theme, browser: { workers: true } })
  ).toThrow()
  expect(() =>
    parseManifest({ ...theme, requires: { pluginApi: "1.5.0" } })
  ).toThrow()
  expect(() => encodePackage(parseManifest(theme), {})).toThrow()
})

let directory: string | undefined
afterEach(async () => {
  if (directory) await fs.rm(directory, { recursive: true, force: true })
  directory = undefined
})

it("packs CSS and a local font into a standalone offline archive", async () => {
  directory = await fs.mkdtemp(path.join(os.tmpdir(), "eidos-css-theme-"))
  await fs.mkdir(path.join(directory, "styles"))
  await fs.writeFile(path.join(directory, "plugin.json"), JSON.stringify(theme))
  await fs.writeFile(path.join(directory, "styles/theme.css"), css)
  await fs.writeFile(
    path.join(directory, "styles/ui.woff2"),
    Buffer.from("wOF2mock")
  )
  const compiled = await compilePlugin(directory)
  const packaged = decodePackage(compiled.bytes)
  expect(packaged.modules).toEqual({})
  expect(packaged.manifest.theme?.stylesheet).toContain(
    'url("data:font/woff2;base64,'
  )
  expect(packaged.manifest.theme?.stylesheet).toContain(
    ':root[data-theme="dark"]'
  )
  expect(compiled.dependencies).toContain(
    path.join(await fs.realpath(directory), "styles/ui.woff2")
  )
})

it("rejects CSS that can style arbitrary elements or load remote data", () => {
  const base =
    ':root[data-theme="light"] { --theme-surface: #fff; }\n' +
    ':root[data-theme="dark"] { --theme-surface: #111; }'
  for (const stylesheet of [
    `${base}\nbutton { display: none; }`,
    `@import url("https://example.com/theme.css");\n${base}`,
    base.replace("#fff", "url(https://example.com/x)"),
    `${base}\n@font-face { font-family: Remote; src: url("https://example.com/font.woff2"); }`,
    base.replace("--theme-surface", "--unknown"),
    base.replace("#fff", "red !important"),
  ])
    expect(() => parseManifest({ ...theme, theme: { stylesheet } })).toThrow()
})
