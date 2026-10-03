import { readFile } from "node:fs/promises"
import { createRequire } from "node:module"
import { fileURLToPath } from "node:url"
import { gunzipSync } from "node:zlib"
import path from "node:path"
import assert from "node:assert/strict"

const root = fileURLToPath(new URL("..", import.meta.url))
const source = process.env.EIDOS_ANDROID_PLUGIN_SOURCES?.split(
  path.delimiter
)[0]
assert.ok(source, "Set EIDOS_ANDROID_PLUGIN_SOURCES to the GPX plugin source")
const require = createRequire(path.join(source, "package.json"))
const { chromium } = require("@playwright/test")
const validator = await readFile(
  path.join(root, "app/build/plugin-assets/plugins/validator.js"),
  "utf8"
)
const manifest = JSON.parse(
  await readFile(path.join(source, "plugin.json"), "utf8")
)
const archive = await readFile(
  path.join(source, `dist/${manifest.id}-${manifest.version}.eidos-plugin`)
)
const raw = gunzipSync(archive).toString("utf8")
const browser = await chromium.launch({ channel: "chrome", headless: true })
const page = await browser.newPage()
try {
  const nativeValidator = await readFile(
    path.join(
      root,
      "app/src/main/java/space/eidos/android/PluginPackageValidation.kt"
    ),
    "utf8"
  )
  const csp = nativeValidator.match(
    /<meta http-equiv="Content-Security-Policy" content="([^"]+)">/
  )[1]
  await page.route("https://package-validator.invalid/**", (route) =>
    route.fulfill({
      contentType: route.request().url().endsWith("validator.js")
        ? "text/javascript"
        : "text/html",
      body: route.request().url().endsWith("validator.js")
        ? validator
        : `<meta http-equiv="Content-Security-Policy" content="${csp}"><script src="/validator.js"></script>`,
    })
  )
  await page.goto("https://package-validator.invalid/")
  await page.waitForFunction(
    () => typeof AndroidPackageValidator !== "undefined"
  )
  assert.equal(
    await page.evaluate(
      (text) => AndroidPackageValidator.validatePackage(text).id,
      raw
    ),
    manifest.id
  )
  const minimal = {
    format: 2,
    manifest,
    modules: {
      [manifest.views[0].entry]:
        "globalThis.guestExecuted = true; export default function mount() {}",
    },
  }
  assert.equal(
    await page.evaluate(
      (text) => AndroidPackageValidator.validatePackage(text).id,
      JSON.stringify(minimal)
    ),
    manifest.id
  )
  assert.equal(await page.evaluate(() => globalThis.guestExecuted), undefined)
  const badModules = [
    'import x from "https://evil.test/x.js"; export default x',
    'export default async()=>import("./x.js")',
    'export default ()=>eval("alert(1)")',
    'export default new Function("alert(1)")',
    "export default function(x: string) {}",
    "export default ;",
  ]
  for (const code of badModules) {
    const text = JSON.stringify({
      ...minimal,
      modules: { [manifest.views[0].entry]: code },
    })
    assert.equal(
      await page.evaluate((text) => {
        try {
          AndroidPackageValidator.validatePackage(text)
          return true
        } catch {
          return false
        }
      }, text),
      false,
      code
    )
  }
  const invalid = [
    JSON.stringify(minimal).replace('"format":2', '"format":2,"format":2'),
    JSON.stringify({ ...minimal, modules: {} }),
    JSON.stringify({
      ...minimal,
      manifest: { ...manifest, workspace: { files: true } },
    }),
    JSON.stringify({
      ...minimal,
      manifest: {
        ...manifest,
        views: [{ ...manifest.views[0], access: "write" }],
      },
    }),
    JSON.stringify({
      ...minimal,
      manifest: { ...manifest, requires: { pluginApi: "1.0.0" } },
    }),
  ]
  for (const text of invalid)
    assert.equal(
      await page.evaluate((text) => {
        try {
          AndroidPackageValidator.validatePackage(text)
          return true
        } catch {
          return false
        }
      }, text),
      false
    )
  console.log(
    JSON.stringify({
      passed: true,
      validated: `${manifest.id}@${manifest.version}`,
      rejected: badModules.length + invalid.length,
      guestExecutedDuringValidation: false,
    })
  )
} finally {
  await page.close()
  await browser.close()
}
