import { mkdir, readFile, writeFile, utimes } from "node:fs/promises"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import {
  options,
  readJson,
  safeRelative,
  snapshotFiles,
  freezeSource,
  hashFile,
} from "./iteration-utils.mjs"

const here = dirname(fileURLToPath(import.meta.url))
const args = options(process.argv.slice(2), {
  "--out": "value",
  "--blueprint": "value",
  "--plugin-source": "value",
  "--help": "boolean",
})
if (args["--help"]) {
  console.log(
    "node prepare-iteration.mjs --out <fresh-private-directory> [--plugin-source <read-only-demo>]"
  )
} else {
  if (!args["--out"])
    throw Error(
      "--out is required; preparation never replaces an existing fixture"
    )
  const out = resolve(args["--out"])
  const blueprintPath = resolve(
    args["--blueprint"] ?? here + "/iteration-fixture.json"
  )
  const blueprint = await readJson(blueprintPath)
  if (!Array.isArray(blueprint.files) || blueprint.files.length === 0)
    throw Error("Empty fixture blueprint")
  const paths = blueprint.files.map((f) => safeRelative(f.path))
  if (new Set(paths).size !== paths.length)
    throw Error("Duplicate fixture paths")
  for (const file of blueprint.files) {
    if (
      typeof file.text !== "string" ||
      file.text.includes(blueprint.noResultsQuery)
    )
      throw Error("Invalid fixture text or negative query")
    if (
      file.textSearch &&
      !file.text
        .split("\n")
        [file.textSearch.line - 1]?.includes(file.textSearch.query)
    )
      throw Error("Text search line differs from blueprint")
    if (
      !Number.isInteger(file.mtime.daysAgo) ||
      file.mtime.daysAgo < 0 ||
      !Number.isInteger(file.mtime.localHour) ||
      file.mtime.localHour < 0 ||
      file.mtime.localHour > 23
    )
      throw Error("Invalid mtime blueprint")
  }
  await mkdir(out, { recursive: true })
  await writeFile(out + "/preparation.lock", new Date().toISOString() + "\n", {
    flag: "wx",
  })
  const profile = out + "/profile"
  const eidosHome = out + "/eidos-home"
  const space = out + "/Release Demo"
  await mkdir(profile, { recursive: true })
  await mkdir(eidosHome, { recursive: true })
  const now = new Date()
  for (const file of blueprint.files) {
    const path = resolve(space, file.path)
    await mkdir(dirname(path), { recursive: true })
    await writeFile(path, file.text, { flag: "wx" })
    const modified = new Date(now)
    modified.setDate(modified.getDate() - file.mtime.daysAgo)
    modified.setHours(file.mtime.localHour, 0, 0, 0)
    const effective =
      modified > now ? new Date(now.getTime() - 300_000) : modified
    await utimes(path, effective, effective)
  }
  await writeFile(
    profile + "/preferences.json",
    JSON.stringify(
      {
        appearance: "light",
        language: "en",
        uiZoom: 1,
        automaticUpdates: false,
        automaticSync: "off",
      },
      null,
      2
    ) + "\n",
    { flag: "wx" }
  )
  const manifest = {
    schemaVersion: 1,
    dataOrigin: "synthetic",
    preparedAt: now.toISOString(),
    anchorLocalDate: [
      now.getFullYear(),
      now.getMonth() + 1,
      now.getDate(),
    ].join("-"),
    systemTimeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    sourceBlueprintSha256: await hashFile(blueprintPath),
    profile,
    eidosHome,
    space,
    files: await snapshotFiles(space, paths),
    fixturePolicy:
      "Ordinary Markdown only; no SQLite writes, no app state or result injection",
    pluginSource: args["--plugin-source"]
      ? await freezeSource(args["--plugin-source"])
      : null,
    pluginPackage: null,
  }
  await writeFile(
    out + "/fixture.manifest.json",
    JSON.stringify(manifest, null, 2) + "\n",
    { flag: "wx" }
  )
  console.log(
    JSON.stringify(
      {
        prepared: true,
        fixtureManifest: out + "/fixture.manifest.json",
        files: paths.length,
        environment: {
          EIDOS_LITE_DEV_USER_DATA: profile,
          EIDOS_HOME: eidosHome,
          EIDOS_LITE_CAPTURE_CDP_PORT: "9237",
        },
        launchFromCandidateRoot: "pnpm dev:eidos-lite",
        note: "Preparation does not start an app, install plugins, modify an existing fixture or approve footage",
      },
      null,
      2
    )
  )
}
