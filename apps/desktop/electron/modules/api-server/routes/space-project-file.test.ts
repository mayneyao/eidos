// @vitest-environment node

import { mkdtemp, realpath, rm, symlink, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import {
  getSpaceProjectFileErrorResponse,
  resolveSpaceProjectFilePath,
} from "./space-project-file"

describe("Space project file paths", () => {
  let root: string
  let outside: string

  beforeEach(async () => {
    root = await mkdtemp(path.join(tmpdir(), "eidos-space-route-"))
    outside = await mkdtemp(path.join(tmpdir(), "eidos-space-outside-"))
  })

  afterEach(async () => {
    await rm(root, { recursive: true, force: true })
    await rm(outside, { recursive: true, force: true })
  })

  it("resolves encoded files within the Space", async () => {
    const filePath = path.join(root, "hello world.md")
    await writeFile(filePath, "hello")

    await expect(
      resolveSpaceProjectFilePath(root, "hello%20world.md")
    ).resolves.toBe(await realpath(filePath))
  })

  it("rejects lexical path escapes", async () => {
    const error = await resolveSpaceProjectFilePath(
      root,
      "..%2Fsecret.md"
    ).catch((caught) => caught)

    expect(error).toMatchObject({ code: "path-outside-space" })
    expect(getSpaceProjectFileErrorResponse(error)).toEqual({
      message: "Access denied",
      status: 403,
    })
  })

  it("rejects symbolic-link path escapes", async () => {
    const secretPath = path.join(outside, "secret.md")
    await writeFile(secretPath, "secret")
    await symlink(secretPath, path.join(root, "alias.md"))

    await expect(
      resolveSpaceProjectFilePath(root, "alias.md")
    ).rejects.toMatchObject({ code: "path-outside-space" })
  })

  it("rejects malformed path encoding", async () => {
    await expect(
      resolveSpaceProjectFilePath(root, "broken%path.md")
    ).rejects.toMatchObject({ code: "invalid-path" })
  })
})
