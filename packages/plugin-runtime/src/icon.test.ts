import { expect, it } from "vitest"
import { parseManifest } from "./manifest"
const parse = (icon: unknown) =>
  parseManifest({
    apiVersion: 1,
    id: "test.icon",
    name: "Icon",
    version: "1.0.0",
    icon,
    views: [{ id: "view", title: "View", context: "page", entry: "./view.ts" }],
  })
it("accepts local path icons and rejects markup, URLs, attributes and oversized payloads", () => {
  const parsed = parse({ paths: ["M3 6l6-3 6 3 6-3v15l-6 3-6-3-6 3V6z"] }).icon
  expect(
    typeof parsed === "object" && parsed && "paths" in parsed
      ? parsed.paths
      : null
  ).toHaveLength(1)
  for (const icon of [
    { paths: [] },
    { paths: ["<svg onload='alert(1)'>"] },
    { paths: ["https://example.com/icon.svg"] },
    { paths: ["M0 0"], onLoad: "code" },
    { paths: ["M" + "0 ".repeat(1024)] },
    { paths: Array(17).fill("M0 0") },
    "https://example.com/icon.png",
    "../secret/icon.png",
    "/absolute/icon.png",
    "icon.exe",
    { file: "https://example.com/icon.svg" },
    { src: "http://example.com/icon.png" },
    {},
  ])
    expect(() => parse(icon)).toThrow()

  expect(parse("./icon.png").icon).toBe("./icon.png")
  expect(parse("assets/icon.svg").icon).toBe("assets/icon.svg")
  expect(parse({ file: "./assets/icon.webp" }).icon).toEqual({
    file: "./assets/icon.webp",
  })
  expect(
    parse({
      src: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
    }).icon
  ).toEqual({
    src: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
  })
})

it("accepts and validates view and action icons", () => {
  const manifestWithIcons = parseManifest({
    apiVersion: 1,
    id: "test.icons",
    name: "Icons Test",
    version: "1.0.0",
    icon: { paths: ["M12 2L2 7l10 5 10-5-10-5z"] },
    extension: "./ext.ts",
    views: [
      {
        id: "mindmap",
        title: "Mindmap",
        context: "document",
        entry: "./mindmap.tsx",
        icon: { paths: ["M3 6l6-3 6 3 6-3v15l-6 3-6-3-6 3V6z"] },
      },
      {
        id: "page",
        title: "Page View",
        context: "page",
        entry: "./page.tsx",
        icon: "./page-icon.png",
      },
    ],
    actions: [
      {
        id: "export",
        title: "Export Action",
        context: "document",
        icon: { file: "./export.svg" },
      },
    ],
  })

  expect(manifestWithIcons.views?.[0].icon).toEqual({
    paths: ["M3 6l6-3 6 3 6-3v15l-6 3-6-3-6 3V6z"],
  })
  expect(manifestWithIcons.views?.[1].icon).toBe("./page-icon.png")
  expect(manifestWithIcons.actions?.[0].icon).toEqual({ file: "./export.svg" })

  // Rejects invalid view icon
  expect(() =>
    parseManifest({
      apiVersion: 1,
      id: "test.icons",
      name: "Icons Test",
      version: "1.0.0",
      views: [
        {
          id: "v",
          title: "V",
          context: "page",
          entry: "./v.ts",
          icon: "https://evil.com/icon.png",
        },
      ],
    })
  ).toThrow()

  // Rejects invalid action icon
  expect(() =>
    parseManifest({
      apiVersion: 1,
      id: "test.icons",
      name: "Icons Test",
      version: "1.0.0",
      extension: "./ext.ts",
      actions: [
        {
          id: "a",
          title: "A",
          context: "workspace",
          icon: { paths: [] },
        },
      ],
    })
  ).toThrow()
})
