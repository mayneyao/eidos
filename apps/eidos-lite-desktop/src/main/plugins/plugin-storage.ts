import fs from "node:fs/promises"
import path from "node:path"
import { randomUUID } from "node:crypto"
import { PluginError, object } from "@eidos.space/plugin-runtime/rpc"

const LIMIT = 4 * 1024 * 1024
/** Keys are opaque object names, never filesystem paths supplied by guests. */
export class PluginStorage {
  private queue: Promise<unknown> = Promise.resolve()
  private sizes: Map<string, number> | undefined
  constructor(private readonly directory: string) {}
  request(
    method: string,
    params: unknown,
    quota: number,
    assertActive: () => void
  ): Promise<unknown> {
    const run = this.queue
      .catch(() => {})
      .then(async () => {
        assertActive()
        const p = object(params)
        const key = method === "storage.list" ? p.prefix : p.key
        if (
          typeof key !== "string" ||
          key.length > 100 ||
          !/^[a-zA-Z0-9._/@-]*$/.test(key) ||
          (!key && method !== "storage.list")
        )
          throw new PluginError("INVALID_REQUEST", "Invalid storage key")
        const allowed =
          method === "storage.list"
            ? ["prefix"]
            : method === "storage.write"
              ? ["key", "data"]
              : ["key"]
        if (Object.keys(p).some((name) => !allowed.includes(name)))
          throw new PluginError("INVALID_REQUEST", "Invalid storage parameters")
        await fs.mkdir(this.directory, { recursive: true, mode: 0o700 })
        if (!this.sizes) {
          const sizes = new Map<string, number>()
          for (const file of await fs.readdir(this.directory)) {
            if (!/^[a-f0-9]+\.blob$/.test(file)) continue
            const stat = await fs.lstat(path.join(this.directory, file))
            if (!stat.isFile() || stat.isSymbolicLink()) continue
            sizes.set(
              Buffer.from(file.slice(0, -5), "hex").toString("utf8"),
              stat.size
            )
          }
          this.sizes = sizes
        }
        assertActive()
        const sizes = this.sizes
        const filename = path.join(
          this.directory,
          `${Buffer.from(key).toString("hex")}.blob`
        )
        if (method === "storage.list")
          return [...sizes]
            .filter(([name]) => name.startsWith(key))
            .map(([key, size]) => ({ key, size }))
        if (method === "storage.read") {
          if (!sizes.has(key)) return null
          const stat = await fs.lstat(filename)
          if (!stat.isFile() || stat.isSymbolicLink() || stat.size > LIMIT)
            throw new PluginError("IO_ERROR", "Invalid storage object")
          return (await fs.readFile(filename)).toString("base64")
        }
        if (method === "storage.remove") {
          await fs.rm(filename, { force: true })
          sizes.delete(key)
          return null
        }
        if (
          method !== "storage.write" ||
          typeof p.data !== "string" ||
          p.data.length > Math.ceil(LIMIT / 3) * 4
        )
          throw new PluginError("INVALID_REQUEST", "Invalid storage object")
        const bytes = Buffer.from(p.data, "base64")
        if (bytes.length > LIMIT || bytes.toString("base64") !== p.data)
          throw new PluginError("INVALID_REQUEST", "Invalid storage encoding")
        const total =
          [...sizes.values()].reduce((a, b) => a + b, 0) -
          (sizes.get(key) ?? 0) +
          bytes.length
        if (total > quota || (!sizes.has(key) && sizes.size >= 25000))
          throw new PluginError(
            "IO_ERROR",
            "Plugin storage quota exceeded; remove unused offline data"
          )
        const temporary = path.join(this.directory, `${randomUUID()}.tmp`)
        try {
          await fs.writeFile(temporary, bytes, { flag: "wx", mode: 0o600 })
          assertActive()
          await fs.rename(temporary, filename)
          sizes.set(key, bytes.length)
        } finally {
          await fs.rm(temporary, { force: true })
        }
        return null
      })
    this.queue = run
    return run
  }
}
