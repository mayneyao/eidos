import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { openEidosFile } from "@eidos.space/eidos-file/better-sqlite3"
import { afterAll, beforeAll, describe, expect, it } from "vitest"

import { EIDOS_LITE_SERVICE_ENVIRONMENTS } from "../../shared/service-environment"
import { classifySyncFailure } from "../sync/sync-failure"
import { GraftClient } from "./graft-client"
import { GraftInProcessTransport } from "./graft-in-process-transport"

const staging = process.env.EIDOS_LITE_RUN_STAGING === "1"
const describeStaging = staging ? describe : describe.skip
const appRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../.."
)
const repositoryRoot = path.resolve(appRoot, "../..")

describeStaging("official Hosted Remote staging gate", () => {
  let temporaryRoot = ""

  beforeAll(async () => {
    temporaryRoot = await fs.mkdtemp(
      path.join(os.tmpdir(), "eidos-lite-staging-")
    )
  })

  afterAll(async () => {
    if (temporaryRoot) {
      await fs.rm(temporaryRoot, { recursive: true, force: true })
    }
  })

  it("pushes and clones an entire real Space through the staging Remote", async () => {
    const remoteUrl = process.env.EIDOS_LITE_STAGING_REMOTE_URL
    const remoteToken = process.env.EIDOS_LITE_STAGING_REMOTE_TOKEN
    if (!remoteUrl || !remoteToken) {
      throw new Error(
        "Set EIDOS_LITE_STAGING_REMOTE_URL and EIDOS_LITE_STAGING_REMOTE_TOKEN"
      )
    }

    const source = path.join(temporaryRoot, "source")
    const clone = path.join(temporaryRoot, "clone")
    await fs.mkdir(source)
    await fs.mkdir(clone)
    await Promise.all([
      fs.copyFile(
        path.join(
          repositoryRoot,
          "apps/eidos-file-web/fixtures/project-tracker.eidos"
        ),
        path.join(source, "project-tracker.eidos")
      ),
      fs.copyFile(
        path.join(
          repositoryRoot,
          "apps/eidos-file-web/fixtures/content-calendar.eidos"
        ),
        path.join(source, "content-calendar.eidos")
      ),
      fs.writeFile(path.join(source, "README.md"), "staging gate\n"),
    ])

    const staging = EIDOS_LITE_SERVICE_ENVIRONMENTS.staging
    expect(new URL(remoteUrl).origin).toBe(staging.syncRemoteOrigin)
    const graft = new GraftClient({
      sdkTransport: new GraftInProcessTransport(),
      syncRemoteOrigin: staging.syncRemoteOrigin,
    })
    try {
      await graft.open(source)
      await graft.initialize(source)
      await graft.stageAll(source)
      await graft.commit(source, "Eidos Lite staging gate")
      await graft.configureOfficialRemote(source, remoteUrl, remoteToken)
      await graft.push(source, remoteToken)
      await graft.clone(clone, remoteUrl, remoteToken)

      const clonedFiles = (await fs.readdir(clone)).sort()
      expect(clonedFiles).toContain("README.md")
      expect(clonedFiles).toContain("content-calendar.eidos")
      expect(clonedFiles).toContain("project-tracker.eidos")
      for (const name of ["content-calendar.eidos", "project-tracker.eidos"]) {
        const runtime = openEidosFile(path.join(clone, name), {
          readonly: true,
        })
        try {
          expect(runtime.listTables().length).toBeGreaterThan(0)
        } finally {
          runtime.close()
        }
      }
    } finally {
      await graft.close()
    }
  }, 180_000)

  it("classifies a real missing Hosted Remote without materializing", async () => {
    const remoteUrl = process.env.EIDOS_LITE_STAGING_MISSING_REMOTE_URL
    const remoteToken = process.env.EIDOS_LITE_STAGING_REMOTE_TOKEN
    if (!remoteUrl || !remoteToken) {
      throw new Error(
        "Set EIDOS_LITE_STAGING_MISSING_REMOTE_URL and EIDOS_LITE_STAGING_REMOTE_TOKEN"
      )
    }

    const root = path.join(temporaryRoot, "missing-remote")
    await fs.mkdir(root)
    await fs.writeFile(path.join(root, "README.md"), "missing Remote gate\n")

    const staging = EIDOS_LITE_SERVICE_ENVIRONMENTS.staging
    expect(new URL(remoteUrl).origin).toBe(staging.syncRemoteOrigin)
    const graft = new GraftClient({
      sdkTransport: new GraftInProcessTransport(),
      syncRemoteOrigin: staging.syncRemoteOrigin,
    })
    try {
      await graft.open(root)
      await graft.initialize(root)
      await graft.configureOfficialRemote(root, remoteUrl, remoteToken)
      let fetchError: unknown
      try {
        await graft.fetch(root)
      } catch (error) {
        fetchError = error
      }
      expect(fetchError).toBeDefined()
      const diagnostic =
        fetchError instanceof Error
          ? JSON.stringify({
              name: fetchError.name,
              code: (fetchError as Error & { code?: string }).code,
              message: fetchError.message.split(remoteToken).join("[redacted]"),
            })
          : String(fetchError)
      expect(
        classifySyncFailure(fetchError, "fetch"),
        diagnostic
      ).toMatchObject({
        code: "remote-not-found",
        localSafe: true,
      })
      expect(await fs.readFile(path.join(root, "README.md"), "utf8")).toBe(
        "missing Remote gate\n"
      )
    } finally {
      await graft.close()
    }
  }, 60_000)
})
