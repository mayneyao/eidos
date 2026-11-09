import fs from "node:fs/promises"
import path from "node:path"
import { createHash, randomUUID } from "node:crypto"
import { PluginError, object } from "@eidos.space/plugin-runtime/rpc"

const LIMIT = 4 * 1024 * 1024
type DirectoryState = { queue: Promise<unknown>; sizes?: Map<string, number> }
// Multiple PluginService/Storage instances can address the same profile. The
// canonical directory owns serialization and quota bookkeeping across all of them.
const directories = new Map<string, DirectoryState>()
const version = (bytes: Uint8Array | null) =>
  bytes === null ? null : createHash("sha256").update(bytes).digest("hex")
/** Keys are opaque object names, never filesystem paths supplied by guests. */
export class PluginStorage {
  private queue: Promise<unknown> = Promise.resolve()
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
        await fs.mkdir(this.directory, { recursive: true, mode: 0o700 })
        const directory = await fs.realpath(this.directory)
        let state = directories.get(directory)
        if (!state) {
          state = { queue: Promise.resolve() }
          directories.set(directory, state)
        }
        const current = state
        const locked = current.queue
          .catch(() => {})
          .then(() =>
            this.execute(
              method,
              params,
              quota,
              assertActive,
              directory,
              current
            )
          )
        current.queue = locked
        return locked
      })
    this.queue = run
    return run
  }
  private async execute(
    method: string,
    params: unknown,
    quota: number,
    assertActive: () => void,
    directory: string,
    state: DirectoryState
  ): Promise<unknown> {
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
        : method === "storage.compareAndWrite"
          ? ["key", "data", "expectedVersion"]
          : method === "storage.write"
            ? ["key", "data"]
            : ["key"]
    if (Object.keys(p).some((name) => !allowed.includes(name)))
      throw new PluginError("INVALID_REQUEST", "Invalid storage parameters")
    if (!state.sizes) {
      const sizes = new Map<string, number>()
      for (const file of await fs.readdir(directory)) {
        if (!/^[a-f0-9]+\.blob$/.test(file)) continue
        const stat = await fs.lstat(path.join(directory, file))
        if (!stat.isFile() || stat.isSymbolicLink()) continue
        sizes.set(
          Buffer.from(file.slice(0, -5), "hex").toString("utf8"),
          stat.size
        )
      }
      state.sizes = sizes
    }
    assertActive()
    const sizes = state.sizes
    const filename = path.join(
      directory,
      `${Buffer.from(key).toString("hex")}.blob`
    )
    if (method === "storage.list")
      return [...sizes]
        .filter(([name]) => name.startsWith(key))
        .map(([key, size]) => ({ key, size }))
    const read = async () => {
      if (!sizes.has(key)) return null
      const stat = await fs.lstat(filename)
      if (!stat.isFile() || stat.isSymbolicLink() || stat.size > LIMIT)
        throw new PluginError("IO_ERROR", "Invalid storage object")
      return fs.readFile(filename)
    }
    if (method === "storage.read" || method === "storage.readVersioned") {
      const bytes = await read()
      return method === "storage.read"
        ? (bytes?.toString("base64") ?? null)
        : { data: bytes?.toString("base64") ?? null, version: version(bytes) }
    }
    if (method === "storage.delete") {
      await fs.rm(filename, { force: true })
      sizes.delete(key)
      return null
    }
    if (
      !["storage.write", "storage.compareAndWrite"].includes(method) ||
      typeof p.data !== "string" ||
      p.data.length > Math.ceil(LIMIT / 3) * 4
    )
      throw new PluginError("INVALID_REQUEST", "Invalid storage object")
    const bytes = Buffer.from(p.data, "base64")
    if (bytes.length > LIMIT || bytes.toString("base64") !== p.data)
      throw new PluginError("INVALID_REQUEST", "Invalid storage encoding")
    if (method === "storage.compareAndWrite") {
      if (
        p.expectedVersion !== null &&
        (typeof p.expectedVersion !== "string" ||
          !/^[a-f0-9]{64}$/.test(p.expectedVersion))
      )
        throw new PluginError("INVALID_REQUEST", "Invalid storage version")
      const actual = version(await read())
      if (p.expectedVersion !== actual)
        return { applied: false, version: actual }
    }
    const total =
      [...sizes.values()].reduce((a, b) => a + b, 0) -
      (sizes.get(key) ?? 0) +
      bytes.length
    if (total > quota || (!sizes.has(key) && sizes.size >= 25000))
      throw new PluginError(
        "IO_ERROR",
        "Plugin storage quota exceeded; remove unused offline data"
      )
    const temporary = path.join(directory, `${randomUUID()}.tmp`)
    try {
      await fs.writeFile(temporary, bytes, { flag: "wx", mode: 0o600 })
      assertActive()
      await fs.rename(temporary, filename)
      sizes.set(key, bytes.length)
    } finally {
      await fs.rm(temporary, { force: true })
    }
    return method === "storage.compareAndWrite"
      ? { applied: true, version: version(bytes) }
      : null
  }
}
