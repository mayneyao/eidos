import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"

import { readTemporaryRevisionTextDiff } from "./temporary-object-reader"

const FROM_OID = "a".repeat(64)
const TO_OID = "b".repeat(64)
const FROM_HASH = "c".repeat(64)
const TO_HASH = "d".repeat(64)

function canonicalTextObject(content: string): Buffer {
  const data = Buffer.from(content)
  const payload = Buffer.from(
    `file-blob-v2\nkind text_file\nsize ${data.length}\nencoding base64\ndata ${data.toString("base64")}\n`
  )
  return Buffer.concat([
    Buffer.from(`graft-object 1 blob ${payload.length}\0`),
    payload,
  ])
}

async function writeObject(root: string, oid: string, content: string) {
  const directory = path.join(root, ".graft", "objects", oid.slice(0, 2))
  await fs.mkdir(directory, { recursive: true })
  await fs.writeFile(
    path.join(directory, oid.slice(2)),
    canonicalTextObject(content)
  )
}

describe("temporary Graft object reader", () => {
  it("reads bounded before and after text from one path-local SDK diff", async () => {
    const root = await fs.mkdtemp(
      path.join(os.tmpdir(), "eidos-lite-object-reader-")
    )
    try {
      await writeObject(root, FROM_OID, "before\n")
      await writeObject(root, TO_OID, "after\n")
      const diff = await readTemporaryRevisionTextDiff(
        {
          diff: async () => ({
            artifacts: [
              {
                path: "notes/readme.md",
                from: {
                  type: "file",
                  kind: "text_file",
                  oid: FROM_OID,
                  content_hash: FROM_HASH,
                  size: 7,
                },
                to: {
                  type: "file",
                  kind: "text_file",
                  oid: TO_OID,
                  content_hash: TO_HASH,
                  size: 6,
                },
              },
            ],
          }),
        },
        root,
        {
          commitId: "e".repeat(64),
          parentId: "f".repeat(64),
          path: "notes/readme.md",
          maxBytes: 1024,
        }
      )

      expect(diff).toEqual({
        path: "notes/readme.md",
        before: {
          state: "utf8",
          content: "before\n",
          size: 7,
          contentHash: FROM_HASH,
        },
        after: {
          state: "utf8",
          content: "after\n",
          size: 6,
          contentHash: TO_HASH,
        },
      })
    } finally {
      await fs.rm(root, { recursive: true, force: true })
    }
  })

  it("does not read an object after its declared text exceeds the limit", async () => {
    const root = await fs.mkdtemp(
      path.join(os.tmpdir(), "eidos-lite-object-limit-")
    )
    try {
      const result = await readTemporaryRevisionTextDiff(
        {
          diff: async () => ({
            artifacts: [
              {
                path: "large.md",
                from: null,
                to: {
                  type: "file",
                  kind: "text_file",
                  oid: TO_OID,
                  content_hash: TO_HASH,
                  size: 4096,
                },
              },
            ],
          }),
        },
        root,
        {
          commitId: "e".repeat(64),
          parentId: null,
          path: "large.md",
          maxBytes: 1024,
        }
      )

      expect(result.before).toEqual({ state: "absent" })
      expect(result.after).toEqual({
        state: "too_large",
        size: 4096,
        contentHash: TO_HASH,
      })
    } finally {
      await fs.rm(root, { recursive: true, force: true })
    }
  })

  it("rejects implementation and parent traversal paths before reading Graft", async () => {
    const repository = { diff: vi.fn(async () => ({})) }
    await expect(
      readTemporaryRevisionTextDiff(repository, "/tmp/space", {
        commitId: "e".repeat(64),
        parentId: null,
        path: ".graft/config.toml",
        maxBytes: 1024,
      })
    ).rejects.toThrow("protected")
    await expect(
      readTemporaryRevisionTextDiff(repository, "/tmp/space", {
        commitId: "e".repeat(64),
        parentId: null,
        path: "../outside.md",
        maxBytes: 1024,
      })
    ).rejects.toThrow("escapes")
    expect(repository.diff).not.toHaveBeenCalled()
  })
})
