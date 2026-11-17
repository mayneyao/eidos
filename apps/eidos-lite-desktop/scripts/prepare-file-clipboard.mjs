import { execFileSync } from "node:child_process"
import { createHash } from "node:crypto"
import fs from "node:fs/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"

if (process.platform !== "darwin") process.exit(0)
const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const source = path.join(appRoot, "native/file-clipboard.m")
const directory = path.join(appRoot, "resources/file-clipboard")
const binary = path.join(directory, "eidos-file-clipboard")
const manifest = path.join(directory, "source.json")
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex")
const sourceHash = sha256(await fs.readFile(source))
try {
  const previous = JSON.parse(await fs.readFile(manifest, "utf8"))
  if (
    previous.source === sourceHash &&
    previous.arch === "universal" &&
    previous.binary === sha256(await fs.readFile(binary))
  )
    process.exit(0)
} catch {}
await fs.mkdir(directory, { recursive: true })
const temporary = `${binary}.${process.pid}.tmp`
try {
  execFileSync(
    "/usr/bin/xcrun",
    [
      "clang",
      "-fobjc-arc",
      "-O2",
      "-Wall",
      "-Wextra",
      "-Werror",
      "-arch",
      "arm64",
      "-arch",
      "x86_64",
      "-mmacosx-version-min=12.0",
      source,
      "-framework",
      "AppKit",
      "-framework",
      "ImageIO",
      "-o",
      temporary,
    ],
    { stdio: "inherit" }
  )
  execFileSync("/usr/bin/codesign", ["--force", "--sign", "-", temporary], {
    stdio: "inherit",
  })
  await fs.rename(temporary, binary)
  await fs.writeFile(
    manifest,
    JSON.stringify({
      source: sourceHash,
      arch: "universal",
      binary: sha256(await fs.readFile(binary)),
    }) + "\n"
  )
} finally {
  await fs.rm(temporary, { force: true })
}
