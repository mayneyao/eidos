import fs from "node:fs"
import os from "node:os"
import path from "node:path"

import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { applyGraftConfigToEnv, remoteSpaceIdFromRemote } from "./helper"

const envKeys = [
  "GRAFT_CONFIG",
  "AWS_ACCESS_KEY_ID",
  "AWS_SECRET_ACCESS_KEY",
  "AWS_REGION",
  "AWS_ENDPOINT",
  "AWS_ENDPOINT_URL",
] as const

describe("graft sync helpers", () => {
  let root: string
  let oldEnv: Record<string, string | undefined>

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "eidos-local-graft-"))
    oldEnv = Object.fromEntries(envKeys.map((key) => [key, process.env[key]]))
    process.env.AWS_ACCESS_KEY_ID = "old-key"
    process.env.AWS_SECRET_ACCESS_KEY = "old-secret"
    process.env.AWS_REGION = "old-region"
    process.env.AWS_ENDPOINT = "https://example.invalid"
    process.env.AWS_ENDPOINT_URL = "https://example.invalid"
  })

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true })
    for (const key of envKeys) {
      const value = oldEnv[key]
      if (value === undefined) {
        delete process.env[key]
      } else {
        process.env[key] = value
      }
    }
  })

  it("writes remote sync config and exposes the endpoint env expected by Graft", () => {
    const remoteUri = applyGraftConfigToEnv(
      {
        id: "remote-space",
        name: "Remote Space",
        path: root,
        sync: {
          enabled: true,
          remote: "eidos.space/bucket/remote-space.db",
        },
      },
      {
        accessKeyId: "key",
        secretAccessKey: "secret",
        bucketName: "bucket",
        endpoint: "https://s3.example.test",
        tokenId: "token",
      }
    )

    expect(remoteUri).toBe(
      "s3_compatible://bucket/remote-space/.eidos/.graft?endpoint=https://s3.example.test"
    )
    expect(process.env.GRAFT_CONFIG).toBeUndefined()
    expect(process.env.AWS_ENDPOINT).toBe("https://s3.example.test")
    expect(process.env.AWS_ENDPOINT_URL).toBe("https://s3.example.test")
  })

  it("uses the explicit remote override when space metadata is stale", () => {
    const remoteUri = applyGraftConfigToEnv(
      {
        id: "local-space-id",
        name: "Remote Space",
        path: root,
        sync: {
          enabled: false,
          remote: "eidos.space/bucket/stale-space.db",
        },
      },
      {
        accessKeyId: "key",
        secretAccessKey: "secret",
        bucketName: "bucket",
        endpoint: "https://s3.example.test",
        tokenId: "token",
      },
      "eidos.space/bucket/live-space.db"
    )

    expect(remoteUri).toBe(
      "s3_compatible://bucket/live-space/.eidos/.graft?endpoint=https://s3.example.test"
    )
  })

  it("extracts remote space ids from Eidos remote paths and S3 URIs", () => {
    expect(remoteSpaceIdFromRemote("custom/my.bucket/live-space")).toBe(
      "live-space"
    )
    expect(remoteSpaceIdFromRemote("custom/my.bucket/live-space.db")).toBe(
      "live-space"
    )
    expect(
      remoteSpaceIdFromRemote(
        "s3_compatible://bucket/live-space/.eidos/.graft?endpoint=https://s3.example.test"
      )
    ).toBe("live-space")
  })
})
