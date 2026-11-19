import assert from "node:assert/strict"
import { readFile, mkdir, writeFile } from "node:fs/promises"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import { parseArgs } from "node:util"
import { createRequire } from "node:module"
import {
  demoLocales,
  demoMarkdown,
  demoSectionEnd,
  isReleaseDemo,
} from "../../apps/eidos-lite-desktop/src/shared/release-demos.ts"

const lite = new URL("../../apps/eidos-lite-desktop/", import.meta.url)
const { marked } = createRequire(new URL("package.json", lite))("marked")
const manifests = {
  en: "RELEASE_NOTES.md",
  zh: "RELEASE_NOTES.zh-CN.md",
}
const demosFile = "release-demos.json"
const readJson = async (path) => JSON.parse(await readFile(path, "utf8"))
const json = (value) => JSON.stringify(value, null, 2) + "\n"

function validateDemos(demos, tag) {
  assert.ok(Array.isArray(demos), "Expected an array of Lite demo receipts")
  const scenarios = new Set()
  for (const demo of demos) {
    assert.ok(
      isReleaseDemo(demo, tag),
      `Invalid demo for ${tag}: ${demo?.scenarioId}`
    )
    assert.ok(
      !scenarios.has(demo.scenarioId),
      `Duplicate demo: ${demo.scenarioId}`
    )
    scenarios.add(demo.scenarioId)
    assert.ok(
      demo.schemaVersion === 1 &&
        demo.uploaded === true &&
        Number.isFinite(Date.parse(demo.verifiedAt)) &&
        demo.checks?.range?.status === 206,
      `Use the verified published-media.json for ${demo.scenarioId}`
    )
    for (const [url, mime] of [
      [demo.media.src, "video/mp4"],
      [demo.media.poster, "image/webp"],
    ]) {
      const file = demo.files?.find((file) => file.url === url)
      const check = demo.checks.files?.find((check) => check.url === url)
      assert.ok(
        file?.type === mime &&
          /^[a-f0-9]{64}$/.test(file.sha256) &&
          check?.status === 200 &&
          check.sha256 === file.sha256 &&
          check.contentType?.split(";")[0] === mime &&
          check.cacheControl?.includes("immutable"),
        `Missing upload verification: ${url}`
      )
    }
  }
}

function placements(tokens, demos, locale) {
  const byEnd = new Map()
  for (const demo of demos) {
    const heading = demo.afterSection[locale]
    const end = demoSectionEnd(tokens, heading)
    assert.notEqual(
      end,
      undefined,
      `${locale}: expected one ### ${heading} for ${demo.scenarioId}`
    )
    const group = byEnd.get(end) ?? []
    group.push(demo)
    byEnd.set(end, group)
  }
  return byEnd
}

function composeNotes(markdown, demos, locale) {
  if (!demos.length) return markdown
  const notes = markdown.replaceAll("\r\n", "\n")
  const tokens = marked.lexer(notes)
  const insertions = []
  let offset = 0
  const byEnd = placements(tokens, demos, locale)
  for (const [index, token] of tokens.entries()) {
    // Locate headings in the original source to preserve reference definitions
    // and the exact text of the editorial draft.
    const at = notes.indexOf(token.raw, offset)
    assert.ok(
      at >= 0,
      `${locale}: could not locate Markdown block in the draft`
    )
    offset = at + token.raw.length
    const group = byEnd.get(index)
    if (group) insertions.push([at, group])
  }
  if (byEnd.has(tokens.length))
    insertions.push([notes.length, byEnd.get(tokens.length)])
  let result = notes
  for (const [at, group] of insertions.reverse()) {
    const block = group.map((demo) => demoMarkdown(demo, locale)).join("\n\n")
    const rest = result.slice(at)
    result =
      result.slice(0, at).trimEnd() +
      "\n\n" +
      block +
      (rest ? "\n\n" + rest : "\n")
  }
  return result
}

function checkNotes(markdown, demos, locale) {
  const tokens = marked.lexer(markdown)
  const expected = new Set(demos.map((demo) => demoMarkdown(demo, locale)))
  const found = []
  for (const token of tokens) {
    if (token.type !== "paragraph") continue
    const paragraph = token.raw.trimEnd()
    // Identify generated covers even if someone edited their label or URL.
    if (
      expected.has(paragraph) ||
      (paragraph.startsWith("[![") &&
        paragraph.includes("https://media.eidos.space/releases/lite/"))
    )
      found.push(paragraph)
  }
  assert.equal(
    found.length,
    expected.size,
    `${locale}: missing or unexpected demo cover`
  )
  for (const [end, group] of placements(tokens, demos, locale)) {
    const finalBlocks = tokens
      .slice(0, end)
      .filter((token) => token.type !== "space")
      .slice(-group.length)
    assert.deepEqual(
      finalBlocks.map(
        (token) => token.type === "paragraph" && token.raw.trimEnd()
      ),
      group.map((demo) => demoMarkdown(demo, locale)),
      `${locale}: demo cover, playback URL or placement differs for ${group.map((demo) => demo.scenarioId).join(", ")}`
    )
  }
}

function websiteEntry(entry, notes, demos, tag) {
  assert.equal(entry.tag, tag, "Website entry tag")
  assert.equal(
    entry.version,
    tag.slice("lite-v".length),
    "Website entry version"
  )
  for (const locale of demoLocales) {
    const body = notes[locale] ?? entry[locale]
    assert.ok(
      typeof body === "string" && body.trim(),
      `Missing website notes: ${locale}`
    )
    placements(marked.lexer(body), demos, locale)
  }
  const result = { ...entry, en: notes.en.trim(), zh: notes.zh.trim() }
  if (demos.length) {
    result.media = demos.map(
      ({
        media,
        afterSection,
        scenarioId,
        capturedAppVersion,
        sourceCommit,
      }) => ({
        ...media,
        afterSection,
        scenarioId,
        capturedAppVersion,
        sourceCommit,
      })
    )
  } else {
    delete result.media
  }
  return result
}

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    tag: { type: "string" },
    demo: { type: "string", multiple: true, default: [] },
    sections: { type: "string" },
    "notes-dir": { type: "string", default: fileURLToPath(lite) },
    "out-dir": { type: "string" },
    entry: { type: "string" },
    changelog: { type: "string" },
  },
})
const [command] = positionals
const {
  tag,
  demo,
  sections,
  entry,
  changelog,
  "notes-dir": notesDir,
  "out-dir": outDir,
} = values
assert.ok(
  positionals.length === 1 &&
    /^lite-v\d+\.\d+\.\d+(?:-(?:alpha|beta|rc)\.\d+)?$/.test(tag ?? "") &&
    ((command === "compose" &&
      outDir &&
      !changelog &&
      Boolean(sections) === Boolean(demo.length)) ||
      (command === "check" &&
        !outDir &&
        !sections &&
        !demo.length &&
        !(entry && changelog))),
  "Usage: lite-release.mjs compose --tag TAG --out-dir DIR [--notes-dir DIR] [--demo RECEIPT ... --sections HEADINGS.json] [--entry ENTRY.json]\n" +
    "       lite-release.mjs check --tag TAG [--notes-dir DIR] [--entry ENTRY.json | --changelog CHANGELOG.json]"
)
const notes = Object.fromEntries(
  await Promise.all(
    Object.entries(manifests).map(async ([locale, file]) => [
      locale,
      await readFile(join(notesDir, file), "utf8"),
    ])
  )
)
if (command === "compose") {
  const headings = sections ? await readJson(sections) : {}
  const demos = await Promise.all(
    demo.map(async (file) => {
      const receipt = await readJson(file)
      return { ...receipt, afterSection: headings[receipt.scenarioId] }
    })
  )
  validateDemos(demos, tag)
  assert.deepEqual(
    Object.keys(headings).sort(),
    demos.map((demo) => demo.scenarioId).sort(),
    "Placement keys must match the demo scenarios"
  )
  for (const locale of Object.keys(manifests)) {
    notes[locale] = composeNotes(notes[locale], demos, locale)
    checkNotes(notes[locale], demos, locale)
  }
  const site = entry && websiteEntry(await readJson(entry), notes, demos, tag)
  await mkdir(outDir, { recursive: true })
  await Promise.all([
    ...Object.entries(manifests).map(([locale, file]) =>
      writeFile(join(outDir, file), notes[locale])
    ),
    writeFile(join(outDir, demosFile), json(demos)),
    ...(site
      ? [writeFile(join(outDir, "changelog-entry.json"), json(site))]
      : []),
  ])
  console.log(`Composed ${tag} with ${demos.length} demo(s) in ${outDir}`)
} else {
  const demos = await readJson(join(notesDir, demosFile))
  validateDemos(demos, tag)
  for (const locale of Object.keys(manifests))
    checkNotes(notes[locale], demos, locale)
  if (entry || changelog) {
    const snapshot = entry
      ? await readJson(entry)
      : (await readJson(changelog)).entries.find((item) => item.tag === tag)
    assert.ok(snapshot, `Missing website entry for ${tag}`)
    assert.deepEqual(
      snapshot,
      websiteEntry(snapshot, notes, demos, tag),
      `Website notes or media differ for ${tag}`
    )
  }
  console.log(`Verified ${tag} with ${demos.length} demo(s)`)
}
