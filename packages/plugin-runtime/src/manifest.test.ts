import { describe, expect, it } from "vitest"
import { gzipSync } from "node:zlib"
import { parseManifest } from "./manifest"
import { decodePackage, encodePackage } from "./package"

const manifest = () => ({
  apiVersion: 1,
  id: "local.csv",
  name: "CSV",
  version: "1.0.0",
  views: [
    {
      id: "csv",
      title: "CSV",
      entry: "./main.ts",
      context: "document",
      access: "write",
    },
  ],
  placements: [{ location: "file/open", view: "csv", extensions: [".csv"] }],
})
describe("manifest and offline envelope", () => {
  it("allows formatter-only plugins and validates provider declarations", () => {
    const value = {
      apiVersion: 1,
      id: "example.format",
      name: "Format",
      version: "1.0.0",
      extension: "./extension.ts",
      formatters: [{ id: "format", title: "Format", extensions: [".md"] }],
    }
    expect(parseManifest(value).formatters).toEqual(value.formatters)
    expect(() => parseManifest({ ...value, extension: undefined })).toThrow()
    expect(() =>
      parseManifest({
        ...value,
        formatters: [...value.formatters, ...value.formatters],
      })
    ).toThrow()
    expect(() =>
      parseManifest({
        ...value,
        formatters: [{ ...value.formatters[0], extensions: [".eidos"] }],
      })
    ).toThrow()
  })
  it("validates optional Linux shortcut overrides", () => {
    const value = {
      ...manifest(),
      extension: "./extension.ts",
      actions: [{ id: "format", title: "Format", context: "document" }],
      placements: [
        {
          location: "keybinding",
          action: "format",
          key: "Alt+Shift+F",
          linux: "Ctrl+Shift+I",
        },
      ],
    }
    expect(parseManifest(value).placements).toEqual(value.placements)
    expect(() =>
      parseManifest({
        ...value,
        placements: [{ ...value.placements[0], linux: 42 }],
      })
    ).toThrow()
  })
  it("round trips a self-contained entry without accepting prototype HTML", () => {
    const m = parseManifest(manifest())
    const bytes = encodePackage(m, {
      "./main.ts": "export default function mount() {}",
    })
    expect(decodePackage(bytes).manifest).toEqual(m)
    expect(() =>
      decodePackage(
        gzipSync(
          JSON.stringify({ format: 1, manifest: m, html: "<script></script>" })
        )
      )
    ).toThrow("envelope")
  })
  it.each([
    { extra: true },
    { apiVersion: 2 },
    { extension: "../host.ts" },
    { version: "01.0.0" },
    { placements: [{ location: "navigation", view: "csv" }] },
    {
      placements: [
        { location: "file/open", view: "csv", extensions: [".eidos"] },
      ],
    },
    { actions: [{ id: "run", title: "Run", context: "workspace" }] },
    {
      resources: {
        folder: {
          kind: "directory",
          title: "Folder",
          include: ["**/*.md"],
          access: ["write"],
        },
      },
    },
    {
      settings: {
        zoom: { type: "number", title: "Zoom", default: 2, maximum: 1 },
      },
    },
  ])("rejects malformed or mismatched declarations %j", (change) => {
    expect(() => parseManifest({ ...manifest(), ...change })).toThrow()
  })
  it("rejects duplicate keys, malformed UTF-8, and undeclared modules", () => {
    expect(() => decodePackage(gzipSync('{"format":1,"format":1}'))).toThrow(
      "Duplicate"
    )
    expect(() => decodePackage(gzipSync(Buffer.from([0xff])))).toThrow()
    expect(() =>
      encodePackage(parseManifest(manifest()), {
        "./other.ts": "export default 1",
      })
    ).toThrow("entries")
  })
  it.each([
    "import 'https://example.com/code.js'",
    "export { x } from './other.js'",
    "export default () => import('https://example.com')",
    "export default () => eval('1')",
    "export default (x: number) => x",
  ])("rejects non-self-contained or non-JS archive code", (code) => {
    expect(() =>
      encodePackage(parseManifest(manifest()), { "./main.ts": code })
    ).toThrow()
  })
})
