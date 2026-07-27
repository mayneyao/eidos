import fs from "node:fs"
import os from "node:os"
import path from "node:path"

import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { writeEidosGraftMergePolicyConfig } from "./helper"

describe("graft sync helpers", () => {
  let root: string

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "eidos-local-graft-"))
  })

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true })
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
})
