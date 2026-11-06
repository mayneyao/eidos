import { mkdir, readFile, writeFile } from "node:fs/promises"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..")
const args = process.argv.slice(2)
const index = args.indexOf("--out")
const directory = resolve(
  index < 0 ? ".artifacts/release-media" : args[index + 1]
)
await mkdir(directory + "/profile", { recursive: true })
await mkdir(directory + "/Release Demo", { recursive: true })
const fixture = await readFile(
  root + "/apps/eidos-file-web/fixtures/project-tracker.eidos"
)
const target = directory + "/Release Demo/Projects.eidos"
try {
  await writeFile(target, fixture, { flag: "wx" })
} catch (error) {
  if (error.code !== "EEXIST" || !(await readFile(target)).equals(fixture))
    throw new Error(
      "Existing demo data differs; use a new --out directory, never overwrite it"
    )
}
try {
  await writeFile(
    directory + "/profile/preferences.json",
    JSON.stringify({
      appearance: "light",
      language: "en",
      uiZoom: 1,
      automaticUpdates: false,
    }) + "\n",
    { flag: "wx" }
  )
} catch (error) {
  if (error.code !== "EEXIST") throw error
}
console.log(
  JSON.stringify(
    {
      directory,
      profile: directory + "/profile",
      space: directory + "/Release Demo",
      cdpPort: 9237,
    },
    null,
    2
  )
)
