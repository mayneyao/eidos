import fs from "node:fs"
import os from "node:os"
import path from "node:path"

import { afterEach, beforeEach, describe, expect, it } from "vitest"

import {
  applyGraftConfigToEnv,
  remoteSpaceIdFromRemote,
  writeEidosGraftMergePolicyConfig,
} from "./helper"

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

  it("writes the Eidos merge policy into graft config", () => {
    const graftDir = path.join(root, ".eidos", ".graft")
    fs.mkdirSync(graftDir, { recursive: true })
    const configPath = path.join(graftDir, "config.toml")
    fs.writeFileSync(configPath, '[core]\ndefault_branch = "main"\n')

    expect(writeEidosGraftMergePolicyConfig(root)).toBe(true)
    expect(writeEidosGraftMergePolicyConfig(root)).toBe(false)

    const config = fs.readFileSync(configPath, "utf8")
    expect(config).toContain("[merge]")
    expect(config).toContain('default_semantic_keys = ["_id"]')
    expect(config).toContain("[merge.semantic_keys]")
    expect(config).toContain('"eidos__tree" = ["id"]')
    expect(config).toContain('"eidos__messages" = ["id"]')
    expect(config).toContain('"eidos__kv" = ["key"]')
    expect(config).toContain("[merge.internal_resolvers]")
    expect(config).toContain('"sqlite_sequence" = "sequence_max"')
    expect(config).toContain("[merge.schema_resolvers]")
    expect(config).toContain('"add_column" = "alter_table_add_column"')
    expect(config).toContain("[merge.generated_columns]")
    expect(config).toContain('"eidos__references" = ["self", "ref", "link"]')
    expect(config.match(/\[merge\.semantic_keys\]/g)).toHaveLength(1)
    expect(config.match(/\[merge\.internal_resolvers\]/g)).toHaveLength(1)
    expect(config.match(/\[merge\.schema_resolvers\]/g)).toHaveLength(1)
    expect(config.match(/\[merge\.generated_columns\]/g)).toHaveLength(1)
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
