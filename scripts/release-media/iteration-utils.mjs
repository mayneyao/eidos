import { createHash } from "node:crypto"
import { readFile, readdir, lstat } from "node:fs/promises"
import { resolve, relative, isAbsolute, sep } from "node:path"

export const sha256 = (data) => createHash("sha256").update(data).digest("hex")
export const readJson = async (path) => JSON.parse(await readFile(path, "utf8"))
export const hashFile = async (path) => sha256(await readFile(path))

export function options(argv, accepted) {
  const result = {}
  for (let i = 0; i < argv.length; i++) {
    const name = argv[i]
    if (!(name in accepted)) throw Error("Unknown option: " + name)
    if (accepted[name] === "boolean") result[name] = true
    else {
      const value = argv[++i]
      if (!value || value.startsWith("--"))
        throw Error("Missing value: " + name)
      result[name] = value
    }
  }
  return result
}

export function within(root, path) {
  const rel = relative(resolve(root), resolve(path))
  return (
    rel !== "" &&
    !rel.startsWith(".." + sep) &&
    rel !== ".." &&
    !isAbsolute(rel)
  )
}

export function safeRelative(path) {
  // The release fixture may contain this one intentional root-level dotfile.
  if (path === ".gitignore") return path
  if (
    typeof path !== "string" ||
    !path ||
    path.includes("\\") ||
    path.includes("\0") ||
    isAbsolute(path) ||
    path
      .split("/")
      .some((p) => !p || p === "." || p === ".." || p.startsWith("."))
  )
    throw Error("Unsafe fixture path: " + path)
  return path
}

export async function snapshotFiles(root, paths) {
  const files = []
  for (const path of [...paths].sort()) {
    safeRelative(path)
    const full = resolve(root, path)
    if (!within(root, full)) throw Error("File escaped fixture")
    const stat = await lstat(full)
    if (!stat.isFile() || stat.isSymbolicLink())
      throw Error("Expected ordinary fixture file: " + path)
    files.push({
      path,
      bytes: stat.size,
      sha256: await hashFile(full),
      mtimeMs: stat.mtimeMs,
    })
  }
  return files
}

export function sameFiles(expected, actual) {
  return (
    expected.length === actual.length &&
    expected.every(
      (file, i) =>
        file.path === actual[i].path &&
        file.bytes === actual[i].bytes &&
        file.sha256 === actual[i].sha256 &&
        Math.abs(file.mtimeMs - actual[i].mtimeMs) <= 1
    )
  )
}

export async function freezeSource(root) {
  const files = []
  const visit = async (directory, prefix = "") => {
    for (const entry of (
      await readdir(directory, { withFileTypes: true })
    ).sort((a, b) => a.name.localeCompare(b.name))) {
      if ([".git", "node_modules", "dist", ".DS_Store"].includes(entry.name))
        continue
      const path = prefix + entry.name
      const full = resolve(directory, entry.name)
      if (entry.isSymbolicLink())
        throw Error("Plugin source contains symlink: " + path)
      if (entry.isDirectory()) await visit(full, path + "/")
      else if (entry.isFile())
        files.push({
          path,
          bytes: (await lstat(full)).size,
          sha256: await hashFile(full),
        })
      else throw Error("Plugin source contains special file: " + path)
    }
  }
  await visit(resolve(root))
  return {
    sourceDirectory: resolve(root),
    files,
    treeSha256: sha256(JSON.stringify(files)),
  }
}
