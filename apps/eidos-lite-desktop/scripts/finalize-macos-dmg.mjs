import { execFile } from "node:child_process"
import { mkdtemp, rename, rm } from "node:fs/promises"
import { createRequire } from "node:module"
import path from "node:path"
import { promisify } from "node:util"

const exec = promisify(execFile)
const require = createRequire(import.meta.url)

export async function finalizeDmg(file, attest, run = exec) {
  const temporary = await mkdtemp(path.join(path.dirname(file), ".ulmo-"))
  try {
    const image = path.join(temporary, path.basename(file))
    console.log(`Compressing macOS disk image as ULMO: ${path.basename(file)}`)
    await run("hdiutil", ["convert", file, "-format", "ULMO", "-o", image])
    await attest(image)
    const { stdout } = await run("hdiutil", ["imageinfo", image, "-format"])
    if (stdout.trim() !== "ULMO")
      throw new Error(`Expected ULMO disk image: ${file}`)
    await run("hdiutil", ["verify", image])
    await rename(image, file)
  } finally {
    await rm(temporary, { recursive: true, force: true })
  }
}

export async function artifactBuildCompleted(event) {
  const { file, target, packager, safeArtifactName } = event
  if (target?.name !== "dmg" || !file?.endsWith(".dmg")) return

  // Resolve the helpers from the same locked builder that owns this hook.
  const builderRequire = createRequire(
    require.resolve("electron-builder/package.json")
  )
  const { findIdentity } = builderRequire(
    "app-builder-lib/out/codeSign/macCodeSign"
  )
  const { createBlockmap } = builderRequire(
    "app-builder-lib/out/targets/differentialUpdateInfoBuilder"
  )
  const { keychainFile } = await packager.codeSigningInfo.value
  const identity = await findIdentity(
    "Developer ID Application",
    packager.platformSpecificBuildOptions.identity,
    keychainFile
  )
  if (!identity)
    throw new Error("Missing Developer ID Application identity for macOS DMG")

  await finalizeDmg(file, async (image) => {
    const args = ["--sign", identity.hash, "--timestamp"]
    if (keychainFile) args.push("--keychain", keychainFile)
    await exec("codesign", [...args, image])
    await packager.helper.notarizeIfProvided(image)
    await exec("xcrun", ["stapler", "validate", image])
    await exec("codesign", ["--verify", "--strict", image])
  })

  // The builder emits artifactCreated after this hook. Its updater metadata
  // therefore sees the final, stapled bytes. The ZIP uses the normal builder path.
  event.updateInfo = await createBlockmap(
    file,
    target,
    packager,
    safeArtifactName
  )
  event.isWriteUpdateInfo = true
}
