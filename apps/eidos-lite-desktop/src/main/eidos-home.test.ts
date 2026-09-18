import fs from "node:fs"
import fsp from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { afterEach, beforeEach, expect, it, vi } from "vitest"
import {
  migrateLegacyPluginsDirectory,
  resolveEidosHome,
  type EidosHomeInputs,
} from "./eidos-home"

const inputs = (overrides: Partial<EidosHomeInputs> = {}): EidosHomeInputs => ({
  env: {},
  homeDirectory: "/Users/tester",
  userDataPath: "/Users/tester/Library/Application Support/Eidos Lite",
  defaultUserDataPath: "/Users/tester/Library/Application Support/Eidos Lite",
  ...overrides,
})

it("uses the shared Eidos home by default and remembers the legacy store", () => {
  const home = resolveEidosHome(inputs())
  expect(home).toEqual({
    home: "/Users/tester/.eidos",
    plugins: "/Users/tester/.eidos/plugins",
    source: "default",
    legacyPlugins:
      "/Users/tester/Library/Application Support/Eidos Lite/plugins",
  })
})

it("keeps redirected dev and smoke profiles isolated from the Eidos home", () => {
  const home = resolveEidosHome(
    inputs({
      userDataPath: "/tmp/eidos-dev-profile",
      defaultUserDataPath:
        "/Users/tester/Library/Application Support/Eidos Lite",
    })
  )
  expect(home).toEqual({
    home: "/tmp/eidos-dev-profile",
    plugins: "/tmp/eidos-dev-profile/plugins",
    source: "profile",
    legacyPlugins: null,
  })
})

it("honors an absolute EIDOS_HOME override", () => {
  const home = resolveEidosHome(
    inputs({ env: { EIDOS_HOME: "/shared/eidos" } })
  )
  expect(home).toEqual({
    home: "/shared/eidos",
    plugins: "/shared/eidos/plugins",
    source: "env",
    legacyPlugins: null,
  })
})

it("rejects a relative EIDOS_HOME", () => {
  expect(() =>
    resolveEidosHome(inputs({ env: { EIDOS_HOME: "relative/eidos" } }))
  ).toThrow(/absolute/)
})

it("reports when there is nothing to migrate or the target already exists", () => {
  const fsMock = {
    existsSync: vi.fn((target: string) => target === "/legacy"),
    mkdirSync: vi.fn(),
    cpSync: vi.fn(),
    renameSync: vi.fn(),
  }
  expect(migrateLegacyPluginsDirectory(fsMock, "/missing", "/target")).toBe(
    "no-legacy"
  )
  expect(fsMock.cpSync).not.toHaveBeenCalled()

  const bothExist = {
    ...fsMock,
    existsSync: vi.fn(() => true),
  }
  expect(migrateLegacyPluginsDirectory(bothExist, "/legacy", "/target")).toBe(
    "target-present"
  )
  expect(bothExist.cpSync).not.toHaveBeenCalled()
})

it("copies the legacy store into the home and retires the old directory", () => {
  const fsMock = {
    existsSync: vi.fn((target: string) => target === "/legacy"),
    mkdirSync: vi.fn(),
    cpSync: vi.fn(),
    renameSync: vi.fn(),
  }
  expect(
    migrateLegacyPluginsDirectory(fsMock, "/legacy", "/home/plugins")
  ).toBe("migrated")
  expect(fsMock.mkdirSync).toHaveBeenCalledWith("/home", {
    recursive: true,
    mode: 0o700,
  })
  expect(fsMock.cpSync).toHaveBeenCalledWith("/legacy", "/home/plugins", {
    recursive: true,
    force: false,
    errorOnExist: false,
  })
  expect(fsMock.renameSync).toHaveBeenCalledWith("/legacy", "/legacy.migrated")
})

it("removes a partial copy when migration fails so the next launch retries", () => {
  const fsMock = {
    existsSync: vi.fn((target: string) => target === "/legacy"),
    mkdirSync: vi.fn(),
    cpSync: vi.fn(() => {
      throw new Error("disk full")
    }),
    renameSync: vi.fn(),
    rmSync: vi.fn(),
  }
  expect(() =>
    migrateLegacyPluginsDirectory(fsMock, "/legacy", "/home/plugins")
  ).toThrow("disk full")
  expect(fsMock.rmSync).toHaveBeenCalledWith("/home/plugins", {
    recursive: true,
    force: true,
  })
  expect(fsMock.renameSync).not.toHaveBeenCalled()
})

let root: string
beforeEach(async () => {
  root = await fsp.mkdtemp(path.join(os.tmpdir(), "eidos-home-"))
})
afterEach(async () => {
  await fsp.rm(root, { recursive: true, force: true })
})

it("migrates a real legacy directory without touching its contents", async () => {
  const legacy = path.join(root, "user-data", "plugins")
  await fsp.mkdir(path.join(legacy, "packages"), { recursive: true })
  await fsp.writeFile(path.join(legacy, "config.json"), "{}")
  await fsp.writeFile(path.join(legacy, "packages", "a.eidos-plugin"), "hash")

  const home = path.join(root, ".eidos")
  const target = path.join(home, "plugins")
  expect(migrateLegacyPluginsDirectory(fs, legacy, target)).toBe("migrated")
  expect(fs.existsSync(legacy)).toBe(false)
  expect(fs.existsSync(path.join(legacy + ".migrated"))).toBe(true)
  await expect(
    fsp.readFile(path.join(target, "config.json"), "utf8")
  ).resolves.toBe("{}")
  await expect(
    fsp.readFile(path.join(target, "packages", "a.eidos-plugin"), "utf8")
  ).resolves.toBe("hash")
  // A second run is a no-op because the target now exists.
  expect(migrateLegacyPluginsDirectory(fs, legacy, target)).toBe("no-legacy")
})
