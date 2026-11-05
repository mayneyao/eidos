import { execFile } from "node:child_process"
import { createHash, randomUUID } from "node:crypto"
import fs from "node:fs/promises"
import path from "node:path"
import { promisify } from "node:util"

const execute = promisify(execFile)
const volumes = new Map<string, Promise<string | null>>()

async function readRecord(directory: string): Promise<unknown> {
  const file = path.join(directory, "value.json")
  const record = await fs.lstat(directory)
  const contents = await fs.lstat(file).catch((error: unknown) => {
    throw new Error("Incomplete Space identity record", { cause: error })
  })
  if (record.isSymbolicLink() || contents.isSymbolicLink())
    throw new Error("Space identity records cannot be symlinks")
  return JSON.parse(await fs.readFile(file, "utf8")) as unknown
}

async function publishRecord(
  directory: string,
  value: unknown
): Promise<unknown> {
  await fs.mkdir(path.dirname(directory), { recursive: true, mode: 0o700 })
  const temporary = `${directory}.${randomUUID()}.tmp`
  await fs.mkdir(temporary, { mode: 0o700 })
  try {
    const handle = await fs.open(
      path.join(temporary, "value.json"),
      "wx",
      0o600
    )
    try {
      await handle.writeFile(JSON.stringify(value))
      await handle.sync()
    } finally {
      await handle.close()
    }
    try {
      // A committed directory is nonempty: rename cannot overwrite it. This
      // publishes a complete record atomically without requiring hardlinks.
      await fs.rename(temporary, directory)
    } catch (error) {
      if (
        !["EEXIST", "ENOTEMPTY", "EPERM"].includes(
          (error as NodeJS.ErrnoException).code ?? ""
        )
      )
        throw error
    }
    return await readRecord(directory)
  } finally {
    await fs.rm(temporary, { recursive: true, force: true })
  }
}

function volumeUuid(
  root: string,
  device: number | bigint
): Promise<string | null> {
  const key = `${device}:${root}`
  let pending = volumes.get(key)
  if (!pending) {
    pending = (async () => {
      // macOS assigns st_dev at mount time. Resolve the persistent volume UUID
      // rather than treating that device number as durable identity.
      const options = { timeout: 3000, maxBuffer: 65536 }
      const disk = (await execute("/bin/df", ["-P", root], options)).stdout
        .match(/^\/dev\/[a-zA-Z0-9]+\s/m)?.[0]
        .trim()
      if (!disk) return null
      const { stdout } = await execute(
        "/usr/sbin/diskutil",
        ["info", "-plist", disk],
        options
      )
      return (
        stdout
          .match(
            /<key>VolumeUUID<\/key>\s*<string>([a-fA-F0-9-]{36})<\/string>/
          )?.[1]
          ?.toLowerCase() ?? null
      )
    })().finally(() => volumes.delete(key))
    // Only coalesce simultaneous lookups. A later remount can reuse st_dev
    // for a different volume, so a settled device-number cache is unsafe.
    volumes.set(key, pending)
  }
  return pending
}

/** Keep the first authorized namespace without rewriting plugin-owned keys. */
export async function persistentSpaceId(
  directory: string,
  identity: string,
  legacyId: string
): Promise<string> {
  if (!/^[a-f0-9]{24}$/.test(legacyId))
    throw new Error("Invalid legacy Space identity")
  const fingerprint = createHash("sha256").update(identity).digest("hex")
  const bindings = path.join(directory, "space-identities")
  const target = path.join(bindings, fingerprint)
  const read = async (file: string) => {
    const value = await readRecord(file)
    if (
      typeof value !== "object" ||
      value === null ||
      !("version" in value) ||
      value.version !== 1 ||
      !("fingerprint" in value) ||
      typeof value.fingerprint !== "string" ||
      !/^[a-f0-9]{64}$/.test(value.fingerprint) ||
      !("id" in value) ||
      typeof value.id !== "string" ||
      !/^[a-f0-9]{24}$/.test(value.id)
    )
      throw new Error("Invalid persistent Space identity")
    return { fingerprint: value.fingerprint, id: value.id }
  }
  const existing = async () => {
    const binding = await read(target)
    const claim = await read(path.join(bindings, "ids", binding.id)).catch(
      (error: unknown) => {
        throw new Error("Could not validate persistent Space identity", {
          cause: error,
        })
      }
    )
    if (
      binding.fingerprint !== fingerprint ||
      claim.fingerprint !== fingerprint ||
      claim.id !== binding.id
    )
      throw new Error("Conflicting persistent Space identity")
    return binding.id
  }
  try {
    return await existing()
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error
  }
  const writeOnce = async (file: string, id: string) => {
    await publishRecord(file, { version: 1, fingerprint, id })
    return read(file)
  }
  // Reusing st_dev and an inode on a different volume must never claim an
  // already-bound legacy namespace, even if its old path is also reused.
  let id = legacyId
  // A restart can interrupt initialization after the reverse reservation but
  // before the forward binding. Honor that already-durable choice rather than
  // reseeding it from a newly assigned device number. Multiple reservations
  // are ambiguous and must never be guessed from their data or timestamps.
  const ids = path.join(bindings, "ids")
  const reservations = new Set<string>()
  const entries = await fs
    .readdir(ids)
    .catch((error: NodeJS.ErrnoException) => {
      if (error.code !== "ENOENT") throw error
      return []
    })
  for (const name of entries) {
    if (!/^[a-f0-9]{24}$/.test(name)) continue
    const reservation = await read(path.join(ids, name))
    if (reservation.id !== name)
      throw new Error("Invalid Space namespace reservation")
    if (reservation.fingerprint === fingerprint) reservations.add(name)
  }
  if (reservations.size > 1)
    throw new Error("Conflicting incomplete Space identity bindings")
  if (reservations.size) id = reservations.values().next().value!
  let claim = await writeOnce(path.join(bindings, "ids", id), id)
  if (claim.fingerprint !== fingerprint) {
    id = fingerprint.slice(0, 24)
    claim = await writeOnce(path.join(bindings, "ids", id), id)
    if (claim.fingerprint !== fingerprint)
      throw new Error("Conflicting persistent Space identity")
  }
  await writeOnce(target, id)
  return existing()
}

export async function spaceFileIdentity(
  root: string,
  stats: {
    dev: number | bigint
    ino: number | bigint
    birthtimeMs: number | bigint
    birthtimeNs?: bigint
  },
  platform: NodeJS.Platform = process.platform,
  allowFallback = false,
  profileDirectory?: string,
  nativeVolume = volumeUuid
): Promise<string | null> {
  const normalizedRoot = platform === "win32" ? root.toLowerCase() : root
  const pathIdentity = JSON.stringify([
    platform,
    "path",
    normalizedRoot,
    stats.ino.toString(),
    platform === "linux"
      ? "0"
      : (stats.birthtimeNs ?? stats.birthtimeMs).toString(),
  ])
  const pathRecord = profileDirectory
    ? path.join(
        profileDirectory,
        "space-identities",
        "path-files",
        createHash("sha256")
          .update(
            JSON.stringify([platform, normalizedRoot, stats.ino.toString()])
          )
          .digest("hex")
      )
    : undefined
  if (pathRecord) {
    try {
      const value = await readRecord(pathRecord)
      if (
        typeof value !== "object" ||
        value === null ||
        !("version" in value) ||
        value.version !== 1 ||
        !("mode" in value) ||
        value.mode !== "path"
      )
        throw new Error("Invalid path-scoped Space identity")
      return pathIdentity
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error
    }
  }
  let volume: string | null = null
  const knownNative = profileDirectory
    ? path.join(
        profileDirectory,
        "space-identities",
        "native-files",
        createHash("sha256")
          .update(
            JSON.stringify([
              platform,
              stats.ino.toString(),
              (stats.birthtimeNs ?? stats.birthtimeMs).toString(),
            ])
          )
          .digest("hex")
      )
    : undefined
  const readNativeMode = async () => {
    const value = await readRecord(knownNative!)
    if (
      typeof value !== "object" ||
      value === null ||
      !("version" in value) ||
      value.version !== 1
    )
      throw new Error("Invalid native Space identity mode")
  }
  // Both provider outcomes contend on the same record. Independent native/path
  // indexes cannot arbitrate first adoption across simultaneous processes.
  const modeRecord = profileDirectory
    ? path.join(
        profileDirectory,
        "space-identities",
        "file-modes",
        createHash("sha256")
          .update(
            JSON.stringify([
              platform,
              platform === "linux" ? normalizedRoot : "",
              stats.ino.toString(),
              platform === "linux"
                ? "0"
                : (stats.birthtimeNs ?? stats.birthtimeMs).toString(),
            ])
          )
          .digest("hex")
      )
    : undefined
  const parseMode = (value: unknown): "native" | "path" => {
    if (
      typeof value !== "object" ||
      value === null ||
      !("version" in value) ||
      value.version !== 1 ||
      !("mode" in value) ||
      (value.mode !== "native" && value.mode !== "path")
    )
      throw new Error("Invalid Space identity mode")
    return value.mode
  }
  const fallbackResult = async () => {
    if (pathRecord)
      await publishRecord(pathRecord, { version: 1, mode: "path" })
    return pathIdentity
  }
  let mode: "native" | "path" | undefined
  if (modeRecord) {
    try {
      mode = parseMode(await readRecord(modeRecord))
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error
    }
    if (mode === "path") return fallbackResult()
  }
  try {
    if (platform === "darwin") volume = await nativeVolume(root, stats.dev)
    else if (platform === "win32") {
      // libuv's Windows st_dev is the volume serial, not a mount-time device ID.
      if (stats.dev) volume = `serial:${stats.dev}`
    } else if (platform === "linux") {
      const options = { timeout: 3000, maxBuffer: 65536 }
      const uuid = (
        await execute(
          "findmnt",
          ["-n", "-r", "-o", "UUID", "-T", root],
          options
        )
      ).stdout.trim()
      // Node can substitute ctime for unsupported birthtime. Do not bind durable
      // authority to that changing value or to a reusable inode without btime.
      const birth = (
        await execute("stat", ["-c", "%W", "--", root], options)
      ).stdout.trim()
      if (/^[a-zA-Z0-9-]+$/.test(uuid) && Number(birth) > 0) volume = uuid
    }
  } catch (error) {
    if (!allowFallback) throw error
  }
  let previouslyNative = false
  if (!volume && knownNative) {
    try {
      await readNativeMode()
      previouslyNative = true
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error
    }
  }
  const nativeAvailable = Boolean(
    volume && stats.ino > 0 && stats.birthtimeMs > 0
  )
  if (modeRecord && !mode)
    mode = parseMode(
      await publishRecord(modeRecord, {
        version: 1,
        mode: nativeAvailable || previouslyNative ? "native" : "path",
      })
    )
  if (mode === "path") return fallbackResult()
  if ((mode === "native" || previouslyNative) && !nativeAvailable)
    throw new Error(
      "Could not verify this Space's persistent volume; existing state has not been reset"
    )
  if (nativeAvailable) {
    if (knownNative) {
      try {
        await readNativeMode()
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error
        await publishRecord(knownNative, { version: 1 })
      }
    }
    return JSON.stringify([
      platform,
      volume,
      stats.ino.toString(),
      (stats.birthtimeNs ?? stats.birthtimeMs).toString(),
    ])
  }
  if (!allowFallback) return null
  // Filesystems without persistent volume/file IDs retain their historical
  // path boundary. Never put a device marker into a versioned/synced worktree,
  // use mount-time st_dev, or infer authority from another path.
  return fallbackResult()
}
