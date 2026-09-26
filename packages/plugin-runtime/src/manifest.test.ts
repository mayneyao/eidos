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
  it("validates explicit workspace files permission", () => {
    const value = { ...manifest(), workspace: { files: true } }
    expect(parseManifest(value).workspace).toEqual({ files: true })
    expect(() =>
      parseManifest({ ...value, workspace: { files: false } })
    ).toThrow()
    expect(
      parseManifest({
        ...value,
        workspace: { files: { read: true } },
      }).workspace
    ).toEqual({ files: { read: true } })
    expect(
      parseManifest({
        ...value,
        workspace: { files: { read: true, write: true } },
      }).workspace
    ).toEqual({ files: { read: true, write: true } })
    expect(() =>
      parseManifest({
        ...value,
        workspace: { files: { read: false, write: false } },
      })
    ).toThrow()
  })
  it("accepts a writable workspace action for Space file operations", () => {
    const value = {
      apiVersion: 1,
      id: "example.journals",
      name: "Journals",
      version: "0.1.0",
      requires: { pluginApi: "1.2.0" },
      extension: "./extension.ts",
      actions: [
        { id: "today", title: "Today", context: "workspace", access: "write" },
      ],
      placements: [{ location: "command-palette", action: "today" }],
    }
    expect(parseManifest(value).actions?.[0]).toMatchObject({
      context: "workspace",
      access: "write",
    })
  })
  it("validates fixed credential endpoints and table context placement", () => {
    const value = {
      ...manifest(),
      extension: "./extension.ts",
      actions: [
        { id: "smart", title: "Smart", context: "table", access: "write" },
      ],
      placements: [{ location: "table/context", action: "smart" }],
      connections: {
        model: { title: "Model", url: "https://api.example.com/v1" },
      },
    }
    expect(parseManifest(value).connections).toEqual(value.connections)
    expect(
      parseManifest({
        ...value,
        connections: {
          model: { ...value.connections.model, configurable: true },
        },
      }).connections?.model?.configurable
    ).toBe(true)
    expect(() =>
      parseManifest({
        ...value,
        connections: {
          model: { ...value.connections.model, configurable: "yes" },
        },
      })
    ).toThrow()
    for (const url of [
      "http://api.example.com",
      "https://user:secret@api.example.com",
      "https://api.example.com?q=key",
      "https://api.example.com/#token",
    ])
      expect(() =>
        parseManifest({
          ...value,
          connections: { model: { title: "Model", url } },
        })
      ).toThrow()
    expect(() =>
      parseManifest({
        ...value,
        actions: [{ id: "smart", title: "Smart", context: "workspace" }],
      })
    ).toThrow()
  })
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
  it("supports Eidos file views without granting text editors binary access", () => {
    const value = manifest()
    const file = {
      ...value,
      views: value.views.map((v) => ({ ...v, context: "eidos" })),
      placements: [
        { location: "file/open", view: "csv", extensions: [".eidos"] },
      ],
    }
    expect(parseManifest(file).views?.[0]?.context).toBe("eidos")
    expect(() =>
      parseManifest({
        ...file,
        placements: [
          { location: "file/open", view: "csv", extensions: [".csv"] },
        ],
      })
    ).toThrow()
  })
  it("supports media views with file/open placements for media extensions", () => {
    const value = manifest()
    const media = {
      ...value,
      views: [
        {
          id: "player",
          title: "Player",
          entry: "./main.ts",
          context: "media",
          access: "read",
        },
      ],
      placements: [
        {
          location: "file/open",
          view: "player",
          extensions: [".mp4", ".webm"],
        },
      ],
    }
    expect(parseManifest(media).views?.[0]?.context).toBe("media")
    expect(() =>
      parseManifest({
        ...media,
        views: [{ ...media.views[0], access: "write" }],
      })
    ).toThrow()
    expect(() =>
      parseManifest({
        ...media,
        placements: [{ location: "navigation", view: "player" }],
      })
    ).toThrow()
  })
  it("supports file views and file actions with file/open placements", () => {
    const value = manifest()
    const filePlugin = {
      ...value,
      extension: "./ext.ts",
      views: [
        {
          id: "viewer",
          title: "Viewer",
          entry: "./main.ts",
          context: "file",
          access: "write",
        },
      ],
      actions: [
        {
          id: "inspect",
          title: "Inspect",
          context: "file",
          access: "read",
        },
      ],
      placements: [
        {
          location: "file/open",
          view: "viewer",
          extensions: [".mp4", ".pdf", ".eidos", ".custom"],
        },
        {
          location: "file/context",
          action: "inspect",
        },
      ],
    }
    const parsed = parseManifest(filePlugin)
    expect(parsed.views?.[0]?.context).toBe("file")
    expect(parsed.actions?.[0]?.context).toBe("file")
    expect(parsed.placements?.[0]?.location).toBe("file/open")
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
