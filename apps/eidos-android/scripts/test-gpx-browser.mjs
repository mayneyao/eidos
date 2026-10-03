// Desktop Chromium verification of the Android host scripts and real GPX bundle.
// This does not install an APK or claim Android WebView/device verification.
import assert from "node:assert/strict"
import { createRequire } from "node:module"
import { readFile, mkdir } from "node:fs/promises"
import { fileURLToPath } from "node:url"
import path from "node:path"
import { gunzipSync } from "node:zlib"

const root = fileURLToPath(new URL("..", import.meta.url))
const source = process.env.EIDOS_ANDROID_PLUGIN_SOURCES?.split(
  path.delimiter
)[0]
assert.ok(
  source,
  "Set EIDOS_ANDROID_PLUGIN_SOURCES to the GPX plugin source directory"
)
const require = createRequire(path.join(source, "package.json"))
const { chromium } = require("@playwright/test")
const assets = path.join(root, "app/build/plugin-assets/plugins")
const catalog = JSON.parse(
  await readFile(path.join(assets, "catalog.json"), "utf8")
)
const view = catalog.find((view) => view.id === "local.eidos-gpx-viewer/map")
assert.ok(view, "Build the GPX plugin into Android assets first")
const host = await readFile(path.join(assets, "host.js"), "utf8")
const plugin = await readFile(path.join(assets, view.asset), "utf8")
const installed = process.argv.includes("--installed")
const sourceManifest = JSON.parse(
  await readFile(path.join(source, "plugin.json"), "utf8")
)
const packageModule = installed
  ? JSON.parse(
      gunzipSync(
        await readFile(
          path.join(
            source,
            `dist/${sourceManifest.id}-${sourceManifest.version}.eidos-plugin`
          )
        )
      ).toString("utf8")
    ).modules[sourceManifest.views[0].entry]
  : null
const fixture = await readFile(path.join(source, "fixtures/waylog.gpx"))
// Exercise the exact CSP template used by the native renderer.
const screen = await readFile(
  path.join(root, "app/src/main/java/space/eidos/android/PluginFileScreen.kt"),
  "utf8"
)
const endpoint = "https://plugin.invalid/test-session/file"
const nonce = "gpx-test-nonce"
const csp = screen
  .match(/<meta http-equiv="Content-Security-Policy" content="([^"]+)">/)[1]
  .replaceAll("$nonce", nonce)
  .replaceAll("$moduleSource", installed ? "blob:" : "")
  .replaceAll("$fileUrl", endpoint)
  .replaceAll("$origins", view.networkOrigins.join(" "))
  .replaceAll("$workers", view.workers ? "blob:" : "'none'")
assert.ok(!csp.includes("$"), "Unresolved native CSP template")
const script = (code) =>
  `<script nonce="${nonce}">${code.replaceAll(/<\/script/gi, "<\\/script")}</script>`
const mountArguments = `document.getElementById('root'),${JSON.stringify({ id: "current", path: "tracks/waylog.gpx", name: "waylog.gpx" })},null,${JSON.stringify(endpoint)}`
const boot = installed
  ? script(
      `const moduleUrl=URL.createObjectURL(new Blob([${JSON.stringify(packageModule).replaceAll("<", "\\u003c")}],{type:'text/javascript'}));import(moduleUrl).then(module=>EidosPluginHost.mountSnapshot(module.default,${mountArguments})).finally(()=>URL.revokeObjectURL(moduleUrl));`
    )
  : script(plugin) +
    script(
      `EidosPluginHost.mountSnapshot(EidosPlugin.default,${mountArguments});`
    )
const html = `<!doctype html><meta name="viewport" content="width=device-width, initial-scale=1"><meta http-equiv="Content-Security-Policy" content="${csp}"><style>html,body,#root{height:100%;width:100%;margin:0}body{overflow:hidden}</style><div id="notice"></div><main id="root"></main>${script(host)}${boot}`
const browser = await chromium.launch({ channel: "chrome", headless: true })
const context = await browser.newContext({
  viewport: { width: 412, height: 760 },
  deviceScaleFactor: 2,
})
const page = await context.newPage()
const errors = []
let reads = 0
let failRead = false
let offline = false
let workers = 0
let tileResponses = 0
page.on("pageerror", (error) => errors.push(error.message))
page.on("worker", () => workers++)
page.on("response", (response) => {
  if (response.ok() && /\/planet\/.*\.pbf$/.test(response.url()))
    tileResponses++
})
await context.route("https://plugin.invalid/**", async (route) => {
  if (route.request().url() === endpoint) {
    reads++
    await route.fulfill({
      status: failRead ? 403 : 200,
      contentType: "application/octet-stream",
      body: failRead ? "Denied" : fixture,
    })
  } else if (
    route.request().url() === "https://plugin.invalid/test-session/index.html"
  ) {
    await route.fulfill({ contentType: "text/html", body: html })
  } else await route.fulfill({ status: 403, body: "Blocked" })
})
await context.route("https://tiles.openfreemap.org/**", (route) =>
  offline ? route.abort() : route.continue()
)
try {
  await page.goto("https://plugin.invalid/test-session/index.html")
  await page.locator('#root[data-loaded="true"]').waitFor()
  assert.equal(await page.locator("#routes option").count(), 1)
  assert.equal(reads, 1)
  await page.locator("#scrub").fill("7")
  assert.match(await page.locator("#position").innerText(), /^8 \/ 25/)
  await page.getByRole("button", { name: "播放", exact: true }).click()
  assert.equal(await page.locator("#play").innerText(), "暂停")
  await page.locator("#play").click()
  await page.getByRole("button", { name: "详情", exact: true }).click()
  assert.equal(await page.locator("#track-details").isVisible(), true)
  await page.getByRole("button", { name: "重新读取", exact: true }).click()
  await page.waitForFunction(() =>
    document.querySelector("#position").textContent.startsWith("1 / 25")
  )
  assert.equal(reads, 2)
  failRead = true
  await page.getByRole("button", { name: "重新读取", exact: true }).click()
  await page.locator(".message").filter({ hasText: "上次成功读取" }).waitFor()
  assert.match(await page.locator("#position").innerText(), /25/)
  failRead = false
  await page.getByRole("button", { name: "重新读取", exact: true }).click()
  await page.waitForFunction(
    () =>
      !document.querySelector(".message").textContent.includes("上次成功读取")
  )
  // Real map data is best effort, but require worker creation and WebGL canvas.
  await page.locator(".maplibregl-canvas").waitFor()
  assert.ok(workers > 0)
  await page
    .waitForFunction(
      () => document.querySelector("#map").dataset.mapReady === "true",
      null,
      { timeout: 30000 }
    )
    .catch(() => {})
  assert.ok(tileResponses > 0, "No real OpenFreeMap vector tiles received")
  const output = path.join(root, "app/build/reports/gpx-browser")
  await mkdir(output, { recursive: true })
  await page.screenshot({ path: path.join(output, "gpx-mobile.png") })
  assert.equal(
    await page.evaluate(async () => {
      try {
        await fetch("https://example.com/forbidden")
        return true
      } catch {
        return false
      }
    }),
    false
  )
  offline = true
  await page.reload()
  await page.locator('#root[data-loaded="true"]').waitFor()
  await page.locator("#scrub").fill("10")
  assert.match(await page.locator("#position").innerText(), /^11 \/ 25/)
  assert.deepEqual(errors, [])
  console.log(
    JSON.stringify({
      passed: true,
      reads,
      workers,
      tileResponses,
      screenshot: path.join(output, "gpx-mobile.png"),
    })
  )
} finally {
  await page.goto("about:blank").catch(() => {})
  await context.close()
  await browser.close()
}
