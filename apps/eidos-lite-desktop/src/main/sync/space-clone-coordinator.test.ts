import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"

import { canonicalizeSpaceRoot } from "../space/space-paths"
import { SpaceSyncStateStore } from "../space/sync-state"
import { SpaceCloneCoordinator } from "./space-clone-coordinator"

const origin = "https://sync-staging.eidos.space"
const remoteUrl = `${origin}/u-alice/project-space`

describe("SpaceCloneCoordinator", () => {
  let root = ""
  let state = ""
  let destinations = ""

  beforeEach(async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), "eidos-lite-clone-"))
    state = path.join(root, "state")
    destinations = path.join(root, "destinations")
    await fs.mkdir(destinations)
  })

  afterEach(async () => {
    await fs.rm(root, { recursive: true, force: true })
  })

  function coordinator(options: { validationError?: Error } = {}) {
    return new SpaceCloneCoordinator({
      stateDirectory: state,
      remoteOrigin: origin,
      createGraftClient: () => ({
        clone: async (target, receivedRemote, token) => {
          expect(receivedRemote).toBe(remoteUrl)
          expect(token).toBe("memory-only-token")
          const journalFiles = await fs.readdir(
            path.join(state, "clone-operations")
          )
          const journal = await fs.readFile(
            path.join(state, "clone-operations", journalFiles[0] ?? ""),
            "utf8"
          )
          expect(journal).not.toContain("memory-only-token")
          await fs.writeFile(path.join(target, "project.eidos"), "valid")
        },
        close: async () => undefined,
      }),
      validateWorktree: async (target) => {
        if (options.validationError) throw options.validationError
        await expect(
          fs.readFile(path.join(target, "project.eidos"), "utf8")
        ).resolves.toBe("valid")
      },
    })
  }

  it("validates a hidden sibling and atomically publishes a normal Space", async () => {
    const target = path.join(destinations, "Project Space")
    await expect(
      coordinator().clone(target, remoteUrl, "memory-only-token")
    ).resolves.toBe(target)

    await expect(
      fs.readFile(path.join(target, "project.eidos"), "utf8")
    ).resolves.toBe("valid")
    expect(
      (await fs.readdir(destinations)).some((name) =>
        name.includes(".eidos-lite-clone-")
      )
    ).toBe(false)
    const canonical = await canonicalizeSpaceRoot(target)
    await expect(
      new SpaceSyncStateStore(
        path.join(state, "spaces", canonical.id),
        origin
      ).read()
    ).resolves.toMatchObject({
      remoteUrl,
      establishedBy: "clone",
    })
  })

  it("removes only its temporary sibling when validation fails", async () => {
    const target = path.join(destinations, "Invalid Space")
    await expect(
      coordinator({ validationError: new Error("invalid Eidos File") }).clone(
        target,
        remoteUrl,
        "memory-only-token"
      )
    ).rejects.toThrow("invalid Eidos File")
    await expect(fs.lstat(target)).rejects.toMatchObject({ code: "ENOENT" })
    expect(await fs.readdir(destinations)).toEqual([])
    await expect(
      fs.readdir(path.join(state, "clone-operations"))
    ).resolves.toEqual([])
  })

  it("finishes a clone published immediately before a crash", async () => {
    const operationId = "019fa8aa-0000-7000-8000-000000000001"
    const target = path.join(destinations, "Recovered Space")
    const staging = path.join(
      destinations,
      `.Recovered Space.eidos-lite-clone-${operationId}`
    )
    await fs.mkdir(target)
    await fs.writeFile(path.join(target, "project.eidos"), "valid")
    const journalDirectory = path.join(state, "clone-operations")
    await fs.mkdir(journalDirectory, { recursive: true })
    await fs.writeFile(
      path.join(journalDirectory, `${operationId}.json`),
      JSON.stringify({
        version: 1,
        operationId,
        phase: "publishing",
        targetPath: target,
        stagingPath: staging,
        remoteUrl,
        startedAt: "2026-07-28T06:00:00.000Z",
        updatedAt: "2026-07-28T06:00:01.000Z",
      })
    )

    await expect(coordinator().recoverInterrupted()).resolves.toMatchObject({
      completed: [target],
      cleaned: [],
      warnings: [],
    })
    const canonical = await canonicalizeSpaceRoot(target)
    await expect(
      new SpaceSyncStateStore(
        path.join(state, "spaces", canonical.id),
        origin
      ).read()
    ).resolves.toMatchObject({ establishedBy: "clone", remoteUrl })
  })

  it("copies Local files into a disconnected Recovery Space", async () => {
    const source = path.join(root, "source")
    const target = path.join(destinations, "Project Local Recovery")
    await fs.mkdir(path.join(source, ".graft"), { recursive: true })
    await Promise.all([
      fs.writeFile(path.join(source, "project.eidos"), "valid"),
      fs.writeFile(path.join(source, "notes.txt"), "local work\n"),
      fs.writeFile(
        path.join(source, ".graft", "config.toml"),
        `remote = "${remoteUrl}"\n`
      ),
    ])

    await expect(coordinator().copyLocalRecovery(source, target)).resolves.toBe(
      target
    )
    await expect(
      fs.readFile(path.join(target, "project.eidos"), "utf8")
    ).resolves.toBe("valid")
    await expect(
      fs.readFile(path.join(target, "notes.txt"), "utf8")
    ).resolves.toBe("local work\n")
    await expect(fs.lstat(path.join(target, ".graft"))).rejects.toMatchObject({
      code: "ENOENT",
    })
    const canonical = await canonicalizeSpaceRoot(target)
    await expect(
      new SpaceSyncStateStore(
        path.join(state, "spaces", canonical.id),
        origin
      ).read()
    ).resolves.toBeNull()
    expect(await fs.readdir(path.join(state, "clone-operations"))).toEqual([])
  })

  it("rejects non-portable Local Recovery input and cleans its staging path", async () => {
    const source = path.join(root, "source")
    const target = path.join(destinations, "Unsafe Recovery")
    await fs.mkdir(path.join(source, "nested", ".graft"), {
      recursive: true,
    })
    await fs.writeFile(path.join(source, "project.eidos"), "valid")
    await fs.writeFile(
      path.join(source, "nested", ".graft", "state"),
      "nested metadata"
    )

    await expect(
      coordinator().copyLocalRecovery(source, target)
    ).rejects.toThrow("Nested .graft directories cannot be recovered")
    await expect(fs.lstat(target)).rejects.toMatchObject({ code: "ENOENT" })
    expect(await fs.readdir(destinations)).toEqual([])
    await expect(
      fs.readdir(path.join(state, "clone-operations"))
    ).resolves.toEqual([])
  })

  it("finishes a published Local Recovery without connecting a Remote", async () => {
    const operationId = "019fa8dc-0000-7000-8000-000000000001"
    const source = path.join(root, "source")
    const target = path.join(destinations, "Recovered Local Space")
    const staging = path.join(
      destinations,
      `.Recovered Local Space.eidos-lite-clone-${operationId}`
    )
    await Promise.all([fs.mkdir(source), fs.mkdir(target)])
    await fs.writeFile(path.join(target, "project.eidos"), "valid")
    const journalDirectory = path.join(state, "clone-operations")
    await fs.mkdir(journalDirectory, { recursive: true })
    await fs.writeFile(
      path.join(journalDirectory, `${operationId}.json`),
      JSON.stringify({
        version: 2,
        kind: "local-recovery",
        operationId,
        phase: "published",
        targetPath: target,
        stagingPath: staging,
        sourcePath: source,
        startedAt: "2026-07-28T13:10:00.000Z",
        updatedAt: "2026-07-28T13:10:01.000Z",
      })
    )

    await expect(coordinator().recoverInterrupted()).resolves.toMatchObject({
      completed: [target],
      cleaned: [],
      warnings: [],
    })
    const canonical = await canonicalizeSpaceRoot(target)
    await expect(
      new SpaceSyncStateStore(
        path.join(state, "spaces", canonical.id),
        origin
      ).read()
    ).resolves.toBeNull()
  })
})
