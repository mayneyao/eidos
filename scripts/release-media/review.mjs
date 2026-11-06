import { createHash } from "node:crypto"
import { readFile, writeFile } from "node:fs/promises"
import { resolve } from "node:path"

const args = process.argv.slice(2)
const directory = args.includes("--dir")
  ? args[args.indexOf("--dir") + 1]
  : null
if (!directory || !args.includes("--approve"))
  throw new Error(
    "After viewing the video and poster: node scripts/release-media/review.mjs --dir <capture> --approve"
  )
const manifestPath = resolve(directory, "source.manifest.json")
const manifest = JSON.parse(await readFile(manifestPath, "utf8"))
if (
  !manifest.assertions?.length ||
  manifest.assertions.some((a) => a.passed !== true) ||
  manifest.dataOrigin !== "synthetic" ||
  manifest.fixtureUnchanged !== true
)
  throw new Error(
    "Capture assertions and synthetic-data provenance must pass before review"
  )
manifest.reviewedFiles = {}
for (const name of ["demo.mp4", "poster.webp"])
  manifest.reviewedFiles[name] = createHash("sha256")
    .update(await readFile(resolve(directory, name)))
    .digest("hex")
manifest.editorialReview = "approved"
manifest.reviewedAt = new Date().toISOString()
await writeFile(manifestPath, JSON.stringify(manifest, null, 2) + "\n")
console.log(
  "Recorded approval of the exact video/poster hashes; no upload performed."
)
