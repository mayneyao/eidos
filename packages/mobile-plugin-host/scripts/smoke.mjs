// Real published packages in isolated Chromium frames; canonical node:sqlite Runtime.
// Run through scripts/run-electron-node.mjs after building Android's Web assets.
import assert from "node:assert/strict"
import { createServer } from "node:http"
import { readFile, mkdtemp, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { createRequire } from "node:module"
import { gunzipSync } from "node:zlib"
import { createHash } from "node:crypto"
import { DatabaseSync } from "node:sqlite"
import { Runtime } from "../../eidos-file/dist/index.mjs"
import {
  createEidosFile,
  NodeSqliteConnectionPort,
} from "../../eidos-file/dist/node-sqlite.mjs"

const root = fileURLToPath(new URL("../../..", import.meta.url))
const packages = process.argv[2]
assert.ok(
  packages,
  "Pass directory containing registry.json and downloaded published archives"
)
const registry = JSON.parse(
  await readFile(path.join(packages, "registry.json"), "utf8")
)
const programs = new Map()
for (const entry of registry.plugins) {
  const data = await readFile(path.join(packages, entry.asset))
  assert.equal(createHash("sha256").update(data).digest("hex"), entry.sha256)
  programs.set(entry.id, JSON.parse(gunzipSync(data)))
}
const temporary = await mkdtemp(path.join(tmpdir(), "eidos-mobile-plugins-"))
const fixture = path.join(temporary, "places.eidos")
const core = createEidosFile(fixture, {
  title: "Places",
  defaultTable: {
    name: "Places",
    fields: [
      { name: "Name", type: "text", isRecordLabel: true },
      { name: "Latitude", type: "number" },
      { name: "Longitude", type: "number" },
      { name: "Amount", type: "number" },
      { name: "Category", type: "text" },
    ],
  },
})
const tableId = core.schema()[0].table.id
const physicalTable = core.schema()[0].table.rawTableName
const fields = core.schema()[0].fields
core.insertRow(tableId, {
  Name: "Shanghai",
  Latitude: 31.23,
  Longitude: 121.47,
  Amount: 12,
  Category: "Asia",
})
core.insertRow(tableId, {
  Name: "Paris",
  Latitude: 48.85,
  Longitude: 2.35,
  Amount: 20,
  Category: "Europe",
})
core.close()
const port = new NodeSqliteConnectionPort(new DatabaseSync(fixture))
const { service } = await Runtime.open(
  port,
  {
    clock: {
      nowInstant: () => new Date().toISOString(),
      nowMilliseconds: () => performance.now(),
    },
    entropy: {
      randomBytes: (length) => crypto.getRandomValues(new Uint8Array(length)),
    },
  },
  "readwrite",
  { cancellation: { cancelled: () => false, onCancel: () => () => {} } }
)
const ctx = () => ({
  requestId: crypto.randomUUID(),
  deadlineMilliseconds: 30000,
})
const config = {
  version: 1,
  actions: [
    {
      id: "score",
      title: "Fixture score",
      inputs: [fields.find((f) => f.name === "Name").id],
      outputs: [
        {
          id: "quality",
          fieldId: fields.find((f) => f.name === "Amount").id,
          instructions: "Return probability.",
          type: "noul",
        },
      ],
      connection: "typesafe-default",
      model: "jev-1.13.0",
    },
  ],
}
const initial = await service.getSnapshot({}, ctx())
const plan = await service.preflightSchema(
  {
    expectedRevision: initial.revision,
    change: {
      kind: "set-table-settings",
      tableId,
      settings: { plugins: { "eidos.smart-actions": config } },
    },
  },
  ctx()
)
await service.mutateSchema(
  {
    expectedRevision: initial.revision,
    planToken: plan.planToken,
    actionsHash: plan.actionsHash,
  },
  ctx()
)
const files = new Map([
  ["notes.md", "# Mobile\n\n## Notes\n\nA published plugin."],
  [
    "routes/Mobile.gpx",
    `<?xml version="1.0"?>
<gpx version="1.1" creator="Eidos test" xmlns="http://www.topografix.com/GPX/1/1">
  <trk><name>Test route</name><trkseg>
    <trkpt lat="31.23" lon="121.47"><ele>11</ele><time>2025-01-01T01:00:00Z</time></trkpt>
    <trkpt lat="31.24" lon="121.48"><ele>27</ele><time>2025-01-01T01:00:10Z</time></trkpt>
  </trkseg></trk>
</gpx>`,
  ],
  ["Home.dashboard", "{}"],
])
const settings = new Map()
const enabled = new Set(
  [...programs.keys()].filter((id) => !id.includes("theme"))
)
const opened = []
const native = async ({ method, params: p }) => {
  switch (method) {
    case "init":
      return { path: "places.eidos", kind: "eidos", dark: false }
    case "editor.ready":
    case "editor.tables":
    case "editor.tablesReload":
    case "editor.recordPage":
    case "editor.recordPageReload":
      return null
    case "plugin.catalog":
      return p.themeOnly
        ? []
        : [
            { ...programs.get("eidos.chart"), modules: {} },
            programs.get("eidos.chart"),
            programs.get("eidos.map"),
          ]
    case "list":
      return [...programs].map(([id, v]) => ({
        manifest: v.manifest,
        enabled: enabled.has(id),
        revision: id,
      }))
    case "package":
      return programs.get(p.id)
    case "enable":
      if (p.enabled) enabled.add(p.id)
      else enabled.delete(p.id)
      return null
    case "files":
      return [...files.keys(), "places.eidos"]
        .filter((f) => !p.path || f.startsWith(p.path + "/"))
        .map((f) => ({
          path: f,
          kind: "file",
          name: f.split("/").pop(),
          isDirectory: false,
          extension: "." + f.split(".").pop(),
        }))
    case "readText": {
      const text = files.get(p.path)
      if (text === undefined) throw Error("Missing file")
      return { text, digest: createHash("sha256").update(text).digest("hex") }
    }
    case "readBinary": {
      assert.equal(p.path, "routes/Mobile.gpx")
      return Buffer.from(files.get(p.path)).toString("base64")
    }
    case "stat":
      return files.has(p.path) ? { path: p.path, isDirectory: false } : null
    case "writeText":
      files.set(p.path, p.text)
      return null
    case "openFile":
      opened.push(p.path)
      return null
    case "settingGet":
      return settings.get(p.id + ":" + p.key) ?? null
    case "settingSet":
      settings.set(p.id + ":" + p.key, p.value)
      return null
    case "connectionStatus":
      return false
    // No paid/external inference in this regression test; the published plugin decodes this response.
    case "connectionRequest":
      return {
        model: "jev-1.13.0",
        usage: { input_tokens: 10 },
        answers: Object.fromEntries(
          Object.keys(p.body.questions).map((key) => [
            key,
            { type: "noul", noul: 0.75 },
          ])
        ),
      }
    case "runtime":
      return await service[p.method](p.request, {
        requestId: crypto.randomUUID(),
        deadlineMilliseconds: 30000,
      })
    default:
      throw Error("Unimplemented test method " + method)
  }
}
const assets = path.join(
  root,
  "apps/eidos-android/app/build/editor-assets/editor"
)
const server = createServer(async (req, res) => {
  try {
    const file = path.join(
      assets,
      new URL(req.url, "http://localhost").pathname
    )
    let data = await readFile(file)
    if (file.endsWith("index.html") || file.endsWith("plugins.html"))
      data = Buffer.from(
        data
          .toString()
          .replaceAll("__EIDOS_PLUGIN_NONCE__", crypto.randomUUID())
          .replaceAll("__EIDOS_LOCALE__", "en")
      )
    res.setHeader(
      "Content-Type",
      file.endsWith(".js")
        ? "text/javascript"
        : file.endsWith(".css")
          ? "text/css"
          : "text/html"
    )
    res.end(data)
  } catch {
    res.writeHead(404)
    res.end()
  }
})
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve))
const require = createRequire(
  path.join(root, "apps/eidos-file-web/package.json")
)
const { chromium } = require("@playwright/test")
const browser = await chromium.launch({ channel: "chrome", headless: true })
const page = await browser.newPage({
  locale: "en-US",
  viewport: { width: 412, height: 850 },
})
page.setDefaultTimeout(15000)
const errors = []
page.on("pageerror", (error) => errors.push(error.message))
await page.exposeFunction("mobileNative", native)
await page.addInitScript(() => {
  if (window !== window.parent) return
  window.eidosMobileIOS = {
    postMessage: (message) => window.mobileNative(message),
  }
  window.EidosAndroid = {
    postMessage: (raw) => {
      const message = JSON.parse(raw)
      window.mobileNative(message).then(
        (value) => window.eidosReply(message.id, { ok: true, value }),
        (error) =>
          window.eidosReply(message.id, { ok: false, error: String(error) })
      )
    },
  }
  window.addEventListener("load", () => {
    if (location.pathname.endsWith("plugins.html")) {
      const tools = new URLSearchParams(location.search).get("tools")
      window.eidosMobileStart(
        "",
        false,
        tools
          ? { id: tools, mode: "tools" }
          : location.search === "?gpx"
            ? { id: "eidos.gpx-viewer", view: "map", path: "routes/Mobile.gpx" }
            : location.search === "?dashboard"
              ? { id: "eidos.dashboard", view: "main", path: "Home.dashboard" }
              : location.search === "?file-open"
                ? { id: "eidos.markmap", view: "markmap", path: "notes.md" }
                : location.search === "?navigation"
                  ? { id: "eidos.journals", view: "overview" }
                  : undefined
      )
    } else window.eidosOpen("fixture-editor")
  })
})
const workbench = "http://127.0.0.1:" + server.address().port + "/plugins.html"
const open = async (name, id) => {
  await page.goto(workbench + "?tools=" + id)
  await page.getByRole("heading", { name, exact: true }).waitFor()
}
try {
  const diagnostic = await browser.newPage()
  await diagnostic.route("**/assets/plugins-*.js", (route) => route.abort())
  await diagnostic.goto(
    "http://127.0.0.1:" + server.address().port + "/plugins.html"
  )
  await diagnostic.getByText("插件页面未能启动", { exact: true }).waitFor()
  await diagnostic.getByText(/^脚本加载失败/).waitFor()
  await diagnostic.unroute("**/assets/plugins-*.js")
  await diagnostic.reload()
  await diagnostic.waitForFunction(
    () => typeof window.eidosMobileStart === "function"
  )
  await diagnostic.evaluate(() =>
    window.dispatchEvent(
      new ErrorEvent("error", { message: "diagnostic runtime failure" })
    )
  )
  await diagnostic.getByText(/diagnostic runtime failure/).waitFor()
  await diagnostic.close()
  console.log(
    "PASS module-load and runtime errors produce visible startup diagnostics"
  )
  await page.setViewportSize({ width: 390, height: 780 })
  // Older Journals archives declare commands only; current packages can be
  // exercised unchanged. Keep a derived fixture for the negative contract case.
  const journals = programs.get("eidos.journals")
  const navigationFixture = structuredClone(journals)
  if (
    !navigationFixture.manifest.placements.some(
      (p) => p.location === "navigation" && p.view === "overview"
    )
  )
    navigationFixture.manifest.placements.push({
      location: "navigation",
      view: "overview",
    })
  programs.set("eidos.journals", navigationFixture)
  await page.goto(
    "http://127.0.0.1:" + server.address().port + "/plugins.html?navigation"
  )
  await page
    .frameLocator("iframe")
    .getByRole("button", { name: "Today's journal" })
    .waitFor()
  assert.equal(await page.locator("select").count(), 0)
  assert.equal(
    await page.getByRole("button", { name: "返回我的插件" }).count(),
    0
  )
  console.log(
    "PASS declared navigation opens Journals directly without workbench controls"
  )
  const originalViewport = page.viewportSize()
  await page.setViewportSize({ width: 390, height: 240 })
  const frameBounds = await page.locator("iframe").boundingBox()
  assert.ok(
    frameBounds &&
      frameBounds.height <= 240 &&
      frameBounds.y + frameBounds.height <= 241
  )
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollHeight > innerHeight
    ),
    false
  )
  await page.setViewportSize(originalViewport)
  console.log(
    "PASS plugin iframe fits a keyboard-sized viewport without a minimum-height overflow"
  )
  const withoutNavigation = structuredClone(journals)
  withoutNavigation.manifest.placements =
    withoutNavigation.manifest.placements.filter(
      (p) => p.location !== "navigation"
    )
  programs.set("eidos.journals", withoutNavigation)
  await page.reload()
  await page
    .getByText("Plugin startup failed: This page has no navigation entry", {
      exact: true,
    })
    .waitFor()
  console.log(
    "PASS undeclared pages cannot be launched as navigation destinations"
  )
  programs.set("eidos.journals", journals)
  await page.goto(
    "http://127.0.0.1:" + server.address().port + "/plugins.html?file-open"
  )
  await page.frameLocator("iframe").locator("#markmap-svg").waitFor()
  assert.match(
    await page.frameLocator("iframe").locator("body").innerText(),
    /Mobile/
  )
  assert.equal(await page.locator("select").count(), 0)
  assert.equal(await page.locator("[role=status]").innerText(), "")
  console.log(
    "PASS open-with launches Markmap with current document and no second file selection"
  )
  await open("Markmap", "eidos.markmap")
  await page.getByLabel("Choose file").selectOption("notes.md")
  await page.getByRole("button", { name: "Markmap", exact: true }).click()
  await page
    .frameLocator("iframe")
    .locator("#markmap-svg")
    .waitFor({ timeout: 20000 })
  assert.match(
    await page.frameLocator("iframe").locator("body").innerText(),
    /Mobile/
  )
  console.log("PASS published Markmap renders Markdown")
  await open("Journals", "eidos.journals")
  await page
    .getByRole("button", { name: "Open today's journal", exact: true })
    .click()
  await page.waitForFunction(
    () => document.querySelectorAll("iframe").length > 0
  )
  await new Promise((resolve) => setTimeout(resolve, 1500))
  assert.ok(
    opened.some((p) =>
      /^journals\/\d{4}\/\d{2}\/\d{4}-\d{2}-\d{2}\.md$/.test(p)
    ),
    await page.locator("[role=status]").innerText()
  )
  assert.ok(files.has(opened.at(-1)))
  await open("Journals", "eidos.journals")
  await page
    .getByRole("button", { name: "Open Journals overview", exact: true })
    .click()
  await page
    .frameLocator(
      "iframe:not([style*='display: none']):not([style*='display:none'])"
    )
    .getByRole("button", { name: "Today's journal" })
    .waitFor()
  await page.waitForFunction(() =>
    [...document.querySelectorAll("button")].some(
      (b) => b.textContent === "Open Journals overview" && !b.disabled
    )
  )
  assert.equal(
    await page.getByLabel("Choose file", { exact: true }).isVisible(),
    false
  )
  assert.equal(
    await page.getByLabel("Choose table", { exact: true }).isVisible(),
    false
  )
  console.log(
    "PASS published Journals creates and opens today's file; overview renders"
  )
  for (const name of ["Chart", "Map"]) {
    await open(name, "eidos." + name.toLowerCase())
    await page.getByLabel("Choose file").selectOption("places.eidos")
    await page
      .getByLabel("Choose table")
      .locator("option")
      .first()
      .waitFor({ state: "attached" })
    await page.getByRole("button", { name, exact: true }).click()
    await page.getByText("View settings", { exact: true }).click()
    if (name === "Chart")
      await page
        .getByLabel("Group by", { exact: true })
        .selectOption({ label: "Category" })
    else {
      await page
        .getByLabel("Latitude", { exact: true })
        .selectOption({ label: "Latitude" })
      await page
        .getByLabel("Longitude", { exact: true })
        .selectOption({ label: "Longitude" })
      await page.getByLabel("Basemap", { exact: true }).selectOption("offline")
    }
    await page.getByText("View settings", { exact: true }).click()
    await page.locator("iframe").scrollIntoViewIfNeeded()
    await page.frameLocator("iframe").locator("body").waitFor()
    await new Promise((resolve) => setTimeout(resolve, 2500))
    const body = await page.frameLocator("iframe").locator("body").innerText()
    console.log(name, body.slice(0, 800))
    assert.ok(!/Unable|unavailable|未授权|无效|没有.*权限/.test(body), body)
    if (name === "Chart") {
      assert.match(body, /Category by Count/)
      assert.ok(
        await page
          .frameLocator("iframe")
          .locator("canvas")
          .evaluateAll((canvases) =>
            canvases.some((canvas) => {
              if (!canvas.width || !canvas.height) return false
              const data = canvas
                .getContext("2d")
                .getImageData(0, 0, canvas.width, canvas.height).data
              return data.some((value, index) => index % 4 === 3 && value > 0)
            })
          )
      )
    } else assert.ok(!body.includes("Location Fields Required"), body)
    await page.screenshot({ path: path.join(temporary, name + ".png") })
  }
  await open("Smart Actions", "eidos.smart-actions")
  await page.getByLabel("Choose file").selectOption("places.eidos")
  await page
    .getByLabel("Choose table")
    .locator("option")
    .first()
    .waitFor({ state: "attached" })
  await page
    .getByRole("button", { name: "Smart Actions", exact: true })
    .first()
    .click()
  await new Promise((resolve) => setTimeout(resolve, 2000))
  console.log(
    "Smart Actions",
    await page.frameLocator("iframe").locator("body").innerText()
  )
  await page
    .getByRole("button", { name: "Smart Actions", exact: true })
    .nth(1)
    .click()
  await page.getByRole("button", { name: "Fixture score", exact: true }).click()
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Allow", exact: true })
    .click()
  await page
    .getByRole("status")
    .filter({ hasText: "Action completed" })
    .waitFor()
  const reader = new DatabaseSync(fixture, { readOnly: true })
  const rows = reader
    .prepare(
      'SELECT "Amount" FROM "' + physicalTable.replaceAll('"', '""') + '"'
    )
    .all()
  assert.deepEqual(
    rows.map((row) => row.Amount),
    [0.75, 0.75]
  )
  reader.close()
  console.log(
    "PASS published Smart Actions writes through Runtime with read tokens and approval"
  )
  await page.goto(workbench + "?gpx")
  const gpx = page.frameLocator("iframe")
  await gpx.locator("[data-loaded=true]").waitFor()
  await gpx.locator("#toggle-details").evaluate((button) => button.click())
  await gpx.locator("#track-details:not([hidden])").waitFor()
  await gpx.locator("#elevation path").waitFor({ state: "attached" })
  await gpx.locator("#speed path").waitFor({ state: "attached" })
  await gpx.locator("#play").evaluate((button) => button.click())
  await gpx.getByText(/^2 \/ 2/).waitFor()
  await page.screenshot({ path: path.join(temporary, "GPX-phone.png") })
  await page.setViewportSize({ width: 1100, height: 800 })
  await page.screenshot({ path: path.join(temporary, "GPX-tablet.png") })
  console.log(
    "PASS published GPX renders a nested track with charts and playback"
  )

  await page.goto(workbench + "?dashboard")
  await page
    .frameLocator("iframe")
    .getByRole("alert")
    .filter({ hasText: "Dashboard requires Eidos Lite plugin API 3.2" })
    .waitFor()
  console.log(
    "PASS reproduced the Dashboard 0.2.0 missing resource API at mount"
  )
  await page.goto("http://127.0.0.1:" + server.address().port + "/index.html")
  await page
    .getByRole("button", { name: "Switch view: Grid", exact: true })
    .click()
  await page.getByText("Chart", { exact: true }).click()
  await page
    .frameLocator("iframe")
    .getByText("Category by Count", { exact: true })
    .waitFor()
  await page.getByRole("button", { name: "View settings", exact: true }).click()
  await page
    .getByRole("button", { name: "Layout settings", exact: true })
    .click()
  await page.getByRole("button", { name: "Group by", exact: true }).click()
  await page.getByRole("button", { name: "Name", exact: true }).click()
  await page.keyboard.press("Escape")
  await page.keyboard.press("Escape")
  await page
    .frameLocator("iframe")
    .getByText("Name by Count", { exact: true })
    .waitFor()
  await page.reload()
  await page
    .getByRole("button", { name: "Switch view: Grid", exact: true })
    .click()
  await page.getByText("Chart", { exact: true }).click()
  await page
    .frameLocator("iframe")
    .getByText("Name by Count", { exact: true })
    .waitFor()
  console.log(
    "PASS saved Chart view works beside an incompatible installed package and retains configuration after reopening"
  )
  assert.deepEqual(errors, [])
  console.log("Artifacts:", temporary)
} catch (error) {
  console.error(error)
  await page.screenshot({ path: path.join(temporary, "failure.png") })
  console.error("Screenshot:", path.join(temporary, "failure.png"))
  console.error("Host:", await page.locator("body").innerText())
  console.error("Page errors:", errors)
  for (const frame of page.frames().slice(1))
    console.error(
      "Guest:",
      await frame.locator("body").innerText().catch(String)
    )
  throw error
} finally {
  await browser.close()
  server.close()
  await Promise.race([
    service.close({ requestId: "close", deadlineMilliseconds: 30000 }),
    new Promise((resolve) => setTimeout(resolve, 2000)),
  ])
  port.close()
}
