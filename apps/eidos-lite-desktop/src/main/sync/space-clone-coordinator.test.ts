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

  function coordinator(
    options: {
      validationError?: Error
      cloneError?: Error
      clonedBinary?: Uint8Array
      onClientClose?: () => void
    } = {}
  ) {
    return new SpaceCloneCoordinator({
      stateDirectory: state,
      remoteOrigin: origin,
      createGraftClient: () => ({
        clone: async (target, receivedRemote, token, cloneOptions) => {
          expect(receivedRemote).toBe(remoteUrl)
          expect(token).toBe("memory-only-token")
          cloneOptions?.onProgress?.({
            direction: "download",
            transferredBytes: 32,
            totalBytes: 64,
          })
          const journalFiles = await fs.readdir(
            path.join(state, "clone-operations")
          )
          const journal = await fs.readFile(
            path.join(state, "clone-operations", journalFiles[0] ?? ""),
            "utf8"
          )
          expect(journal).not.toContain("memory-only-token")
          await fs.writeFile(path.join(target, "project.eidos"), "valid")
          if (options.clonedBinary) {
            await fs.writeFile(
              path.join(target, "asset.bin"),
              options.clonedBinary
            )
          }
          if (options.cloneError) throw options.cloneError
        },
        close: async () => options.onClientClose?.(),
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
    const phases: string[] = []
    const transferredBytes: number[] = []
    await expect(
      coordinator().clone(
        target,
        remoteUrl,
        "memory-only-token",
        (phase) => {
          phases.push(phase)
        },
        (progress) => transferredBytes.push(progress.transferredBytes)
      )
    ).resolves.toBe(target)
    expect(phases).toEqual([
      "preparing",
      "cloning",
      "validating",
      "publishing",
      "published",
    ])
    expect(transferredBytes).toEqual([32])

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

  it("cleans a partial clone after a network interruption", async () => {
    const target = path.join(destinations, "Interrupted Space")
    const unrelated = path.join(destinations, "keep.txt")
    await fs.writeFile(unrelated, "user-owned sibling\n")
    const interruption = Object.assign(
      new Error("socket disconnected during clone"),
      { code: "ECONNRESET" }
    )
    let clientClosed = false

    await expect(
      coordinator({
        cloneError: interruption,
        onClientClose: () => {
          clientClosed = true
        },
      }).clone(target, remoteUrl, "memory-only-token")
    ).rejects.toMatchObject({ code: "ECONNRESET" })

    expect(clientClosed).toBe(true)
    await expect(fs.lstat(target)).rejects.toMatchObject({ code: "ENOENT" })
    await expect(fs.readFile(unrelated, "utf8")).resolves.toBe(
      "user-owned sibling\n"
    )
    expect(await fs.readdir(destinations)).toEqual(["keep.txt"])
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

  it("keeps both binary conflict versions in independent Recovery Spaces", async () => {
    const source = path.join(root, "source")
    const localTarget = path.join(destinations, "Project Local Recovery")
    const hostedTarget = path.join(destinations, "Project Hosted Recovery")
    const localBinary = Uint8Array.from([0, 255, 1, 2, 128, 64])
    const hostedBinary = Uint8Array.from([0, 255, 9, 8, 127, 63])
    await fs.mkdir(path.join(source, ".graft"), { recursive: true })
    await Promise.all([
      fs.writeFile(path.join(source, "project.eidos"), "valid"),
      fs.writeFile(path.join(source, "asset.bin"), localBinary),
      fs.writeFile(path.join(source, ".graft", "state"), "local metadata"),
    ])

    const recovery = coordinator({ clonedBinary: hostedBinary })
    await recovery.copyLocalRecovery(source, localTarget)
    await recovery.clone(hostedTarget, remoteUrl, "memory-only-token")

    await expect(fs.readFile(path.join(source, "asset.bin"))).resolves.toEqual(
      Buffer.from(localBinary)
    )
    await expect(
      fs.readFile(path.join(localTarget, "asset.bin"))
    ).resolves.toEqual(Buffer.from(localBinary))
    await expect(
      fs.readFile(path.join(hostedTarget, "asset.bin"))
    ).resolves.toEqual(Buffer.from(hostedBinary))
    await expect(
      fs.lstat(path.join(localTarget, ".graft"))
    ).rejects.toMatchObject({ code: "ENOENT" })

    const localCanonical = await canonicalizeSpaceRoot(localTarget)
    const hostedCanonical = await canonicalizeSpaceRoot(hostedTarget)
    await expect(
      new SpaceSyncStateStore(
        path.join(state, "spaces", localCanonical.id),
        origin
      ).read()
    ).resolves.toBeNull()
    await expect(
      new SpaceSyncStateStore(
        path.join(state, "spaces", hostedCanonical.id),
        origin
      ).read()
    ).resolves.toMatchObject({ remoteUrl, establishedBy: "clone" })
  })
})
