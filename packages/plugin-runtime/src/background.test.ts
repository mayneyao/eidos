import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { expect, it } from "vitest"
import { parseManifest } from "./manifest"
import { compilePlugin } from "./compiler"
import { decodePackage, encodePackage } from "./package"
import { checkPluginCompatibility } from "./compatibility"

const manifest = {
  apiVersion: 1 as const,
  id: "test.background",
  name: "Background",
  version: "1.0.0",
  requires: { pluginApi: "3.4.0" },
  background: {
    entry: "./background.ts",
    networkOrigins: ["wss://example.com"],
  },
}
it("validates declarative automatic startup", () => {
  const input = {
    ...manifest,
    requires: { pluginApi: "3.6.0" },
    background: { entry: "./background.ts", autoStart: true },
  }
  expect(parseManifest(input).background?.autoStart).toBe(true)
  expect(() =>
    parseManifest({ ...input, requires: { pluginApi: "3.5.0" } })
  ).toThrow("3.6.0")
  expect(() =>
    parseManifest({
      ...input,
      background: { ...input.background, autoStart: false },
    })
  ).toThrow("autoStart")
})
it("requires API 3.6 and an explicit file history grant", () => {
  const history = {
    ...manifest,
    requires: { pluginApi: "3.6.0" },
    background: { entry: "./background.ts", fileHistory: true },
  }
  expect(parseManifest(history).background?.fileHistory).toBe(true)
  expect(
    checkPluginCompatibility(parseManifest(history), "eidos-lite").compatible
  ).toBe(true)
  expect(
    checkPluginCompatibility(parseManifest(history), "eidos-cli")
      .missingFeatures
  ).toContain("background.fileHistory")
  expect(() =>
    parseManifest({ ...history, requires: { pluginApi: "3.5.0" } })
  ).toThrow("3.6.0")
  expect(() =>
    parseManifest({
      ...history,
      background: { ...history.background, fileHistory: false },
    })
  ).toThrow("fileHistory")
})
it("validates background declarations and denies unknown or unsafe grants", () => {
  expect(parseManifest(manifest).background).toEqual(manifest.background)
  expect(
    parseManifest({
      ...manifest,
      background: {
        ...manifest.background,
        networkOrigins: ["ws://127.0.0.1:8787"],
      },
    }).background?.networkOrigins
  ).toEqual(["ws://127.0.0.1:8787"])
  for (const background of [
    { entry: "../escape.ts" },
    { entry: "./worker.ts", networkOrigins: ["https://example.com/path"] },
    { entry: "./worker.ts", networkOrigins: ["ws://localhost"] },
    { entry: "./worker.ts", networkOrigins: ["ws://192.168.1.2:8787"] },
    { entry: "./worker.ts", networkOrigins: ["ws://example.com"] },
    { entry: "./worker.ts", allowPrivateAddresses: true },
  ])
    expect(() => parseManifest({ ...manifest, background })).toThrow()
  expect(checkPluginCompatibility(manifest, "eidos-lite").compatible).toBe(true)
  expect(
    checkPluginCompatibility(manifest, "eidos-cli").missingFeatures
  ).toContain("background")
  expect(() => encodePackage(manifest, {})).toThrow()
})
it("accepts public network and selected-device grants with optional restrictions", () => {
  for (const bluetooth of [true, { services: [{ uuid: "battery_service" }] }]) {
    const value = {
      ...manifest,
      requires: { pluginApi: "3.5.0" },
      browser: { network: true },
      background: { entry: "./background.ts", network: true, bluetooth },
    }
    expect(parseManifest(value).background?.bluetooth).toEqual(bluetooth)
    expect(
      checkPluginCompatibility(parseManifest(value), "eidos-cli")
        .missingFeatures
    ).toContain("network.public")
  }
  expect(() =>
    parseManifest({ ...manifest, browser: { network: true } })
  ).toThrow(/3.5/)
  for (const network of [false, "*", 1])
    expect(() =>
      parseManifest({
        ...manifest,
        background: { ...manifest.background, network },
      })
    ).toThrow()
  expect(() =>
    parseManifest({
      ...manifest,
      background: { ...manifest.background, bluetooth: false },
    })
  ).toThrow()
})

it("accepts service operations but never manifest-supplied device grants", () => {
  const bluetooth = {
    services: [{ uuid: "battery_service", read: true, notify: true }],
  }
  expect(
    parseManifest({
      ...manifest,
      background: { ...manifest.background, bluetooth },
    }).background?.bluetooth
  ).toEqual(bluetooth)
  for (const bad of [
    { devices: ["forged-id"], ...bluetooth },
    { services: [] },
    { services: [{ uuid: "*", read: true }] },
    { services: [{ uuid: "battery_service", write: "yes" }] },
    {
      services: [
        { uuid: "battery_service", read: true },
        { uuid: "battery_service", write: true },
      ],
    },
  ])
    expect(() =>
      parseManifest({
        ...manifest,
        background: { ...manifest.background, bluetooth: bad },
      })
    ).toThrow()
})
it("compiles a side-effect Worker entry and includes it in the archive", async () => {
  const directory = await fs.mkdtemp(
    path.join(os.tmpdir(), "background-compiler-")
  )
  try {
    await fs.writeFile(
      path.join(directory, "plugin.json"),
      JSON.stringify(manifest)
    )
    await fs.writeFile(
      path.join(directory, "background.ts"),
      "globalThis.onmessage = (event: MessageEvent) => { postMessage(event.data) }; export {}"
    )
    const compiled = await compilePlugin(directory)
    expect(decodePackage(compiled.bytes).modules["./background.ts"]).toContain(
      "postMessage"
    )
  } finally {
    await fs.rm(directory, { recursive: true, force: true })
  }
})
