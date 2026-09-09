import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import { mkdtempSync, writeFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { createRequire } from "node:module"
import { spawnSync } from "node:child_process"
import { fileURLToPath } from "node:url"
import { renderMarkdownToHtml } from "../dist/static.mjs"

assert.equal(typeof document, "undefined")
assert.match(renderMarkdownToHtml("# Static"), /<h1[^>]*>Static<\/h1>/)
const visited = new Set()
async function checkModule(url) {
  if (visited.has(url.href)) return
  visited.add(url.href)
  const source = await readFile(url, "utf8")
  for (const match of source.matchAll(
    /\b(?:from\s*|import\s*\(?)\s*["']([^"']+)["']/g
  )) {
    const name = match[1]
    assert(
      !/^(?:react(?:-dom)?(?:\/|$)|lexical$|@lexical\/|node:)/.test(name),
      `Static entry imports an editor or Node runtime dependency: ${name}`
    )
    if (name.startsWith("."))
      await checkModule(
        new URL(
          url.pathname.endsWith(".d.mts")
            ? name.replace(/\.mjs$/, ".d.mts")
            : name,
          url
        )
      )
  }
}
await checkModule(new URL("../dist/static.mjs", import.meta.url))
await checkModule(new URL("../dist/static.d.mts", import.meta.url))
const css = await readFile(
  new URL("../dist/static.css", import.meta.url),
  "utf8"
)
assert(!css.includes("@import"), "Static CSS must be self-contained")
assert(css.includes(".eme-static"))
const consumer = mkdtempSync(join(tmpdir(), "markdown-static-types-"))
try {
  writeFileSync(
    join(consumer, "index.mts"),
    `
    import { renderMarkdownToHtml, eidosSyntax } from ${JSON.stringify(fileURLToPath(new URL("../dist/static.mjs", import.meta.url)))};
    const html: string = renderMarkdownToHtml("$x$", { syntax: eidosSyntax });
  `
  )
  writeFileSync(
    join(consumer, "tsconfig.json"),
    JSON.stringify({
      compilerOptions: {
        strict: true,
        noEmit: true,
        target: "ES2022",
        module: "NodeNext",
        lib: ["ES2022"],
        types: [],
        skipLibCheck: false,
      },
      include: ["index.mts"],
    })
  )
  const result = spawnSync(
    process.execPath,
    [
      createRequire(import.meta.url).resolve("typescript/bin/tsc"),
      "-p",
      consumer,
    ],
    { encoding: "utf8" }
  )
  assert.equal(
    result.status,
    0,
    `Static declarations require DOM/editor types:\n${result.stdout}\n${result.stderr}`
  )
} finally {
  rmSync(consumer, { recursive: true, force: true })
}
console.log(
  `Static entry verified without DOM/editor runtime (${visited.size} modules).`
)
