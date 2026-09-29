import assert from "node:assert/strict"
import fs from "node:fs/promises"
import path from "node:path"
import os from "node:os"
import http from "node:http"
import { spawn } from "node:child_process"
import { setTimeout as delay } from "node:timers/promises"
import { fileURLToPath } from "node:url"
import { DatabaseSync } from "node:sqlite"
import { build } from "esbuild"
import { NodeSqliteConnectionPort } from "@eidos.space/eidos-file/node-sqlite"
import {
  ConnectionPortEidosFileConnection,
  EidosFileRuntime,
  initializeEidosFileSchema,
  Runtime,
} from "@eidos.space/eidos-file"

// Pass the directory containing the seven registry plugin repositories. Archives
// must already exist; in particular, Map requires its own worker-aware packer.
const plugins = path.resolve(process.argv[2] ?? "../eidos-plugins")
const repository = fileURLToPath(new URL("../../../", import.meta.url))
const host = path.join(repository, "apps/eidos-lite-desktop/src")
const output = fileURLToPath(
  new URL("../dist/registry-smoke-host.mjs", import.meta.url)
)
const tableModule = await fs.readFile(
  path.join(host, "renderer/plugin-table-view.tsx"),
  "utf8"
)
// Exercise the production bridge without loading React's workbench UI in Node.
const tableBridge = tableModule.slice(
  tableModule.indexOf("export async function tableViewRequest"),
  tableModule.indexOf("\nfunction TableView")
)
await build({
  stdin: {
    contents: `
export {PluginService} from ${JSON.stringify(path.join(host, "main/plugins/plugin-service.ts"))};
export {PluginStore} from ${JSON.stringify(path.join(host, "main/plugins/plugin-store.ts"))};
export {readTextFilePreview,saveTextFile} from ${JSON.stringify(path.join(host, "main/space/text-file-preview.ts"))};
export {EidosRuntimeEditorDataSource} from ${JSON.stringify(path.join(repository, "packages/eidos-file-ui/src/runtime-editor-data-source.ts"))};
import {fileViewRequest} from ${JSON.stringify(path.join(host, "renderer/plugin-file-request.ts"))};
export {fileViewRequest};
import {validateSetting} from '@eidos.space/plugin-runtime/manifest';
${tableBridge}`,
    loader: "ts",
    resolveDir: repository,
  },
  outfile: output,
  bundle: true,
  platform: "node",
  format: "esm",
  packages: "external",
  alias: {
    "@eidos.space/plugin-runtime": path.join(
      repository,
      "packages/plugin-runtime/src"
    ),
    "csv-parse/browser/esm/sync": path.join(
      repository,
      "packages/eidos-file/node_modules/csv-parse/dist/esm/sync.js"
    ),
  },
})
const {
  PluginService,
  PluginStore,
  readTextFilePreview,
  saveTextFile,
  EidosRuntimeEditorDataSource,
  fileViewRequest,
  tableViewRequest,
} = await import(output)
const root = await fs.mkdtemp(path.join(os.tmpdir(), "eidos-registry-browser-"))
let server, child, service, runtime
try {
  const connection = new NodeSqliteConnectionPort(
    new DatabaseSync(path.join(root, "data.eidos"))
  )
  const legacy = new ConnectionPortEidosFileConnection(connection)
  initializeEidosFileSchema(legacy, {})
  const core = new EidosFileRuntime(legacy, false)
  const table = core.createTable({
    name: "Places",
    fields: [
      { name: "Name", type: "text", isRecordLabel: true },
      { name: "Category", type: "text" },
      { name: "Latitude", type: "number" },
      { name: "Longitude", type: "number" },
    ],
  })
  core.mutateRows({
    tableId: table.id,
    insert: [
      {
        fields: {
          Name: "Shanghai",
          Category: "City",
          Latitude: 31.2,
          Longitude: 121.5,
        },
      },
    ],
  })
  core.close()
  runtime = (
    await Runtime.open(
      connection,
      {
        clock: {
          nowInstant: () => new Date().toISOString(),
          nowMilliseconds: () => performance.now(),
        },
        entropy: {
          randomBytes: (n) => crypto.getRandomValues(new Uint8Array(n)),
        },
      },
      "readwrite",
      { cancellation: { cancelled: () => false, onCancel: () => () => {} } }
    )
  ).service
  const source = new EidosRuntimeEditorDataSource(runtime, "data.eidos")
  const snapshot = await source.initialize()
  const state = snapshot.tables[0]
  const field = (name) => state.fields.find((f) => f.name === name).id
  const store = new PluginStore(path.join(root, "installed"))
  const manifests = {}
  for (const name of [
    "smart-actions",
    "map",
    "markmap",
    "chart",
    "journals",
    "forest-theme",
    "maple-theme",
  ]) {
    const dir = path.join(
      plugins,
      `eidos-${name}${name.endsWith("theme") ? "" : "-plugin"}`
    )
    const manifest = JSON.parse(
      await fs.readFile(path.join(dir, "plugin.json"), "utf8")
    )
    await store.install(
      await fs.readFile(
        path.join(
          dir,
          "dist",
          `${manifest.id}-${manifest.version}.eidos-plugin`
        )
      ),
      "space"
    )
    manifests[name] = manifest
  }
  service = new PluginService(store)
  await fs.writeFile(
    path.join(root, "entry.md"),
    "# Release smoke\n\n## Plugin API\n\n- Page\n- File\n"
  )
  const session = {
    canonical: { id: "space" },
    previewTextFile: (file) => readTextFilePreview(root, file),
    saveTextFile: (request) => saveTextFile(root, request),
    statFile: async (file) => {
      try {
        const s = await fs.stat(path.join(root, file))
        return { path: file, size: s.size, isDirectory: s.isDirectory() }
      } catch {
        return null
      }
    },
    writeTextFile: async (file, text) => {
      await fs.mkdir(path.dirname(path.join(root, file)), { recursive: true })
      await fs.writeFile(path.join(root, file), text)
    },
    readTextFile: (file) => fs.readFile(path.join(root, file), "utf8"),
    listFiles: async () => [],
    watchFiles: () => () => {},
  }
  const instances = {
    markmap: (
      await service.open(1, session, "entry.md", "eidos.markmap/markmap")
    ).instance,
    smart: (
      await service.open(
        1,
        session,
        "data.eidos",
        "eidos.smart-actions/configure"
      )
    ).instance,
    journals: (await service.openPage(1, session, "eidos.journals/overview"))
      .instance,
    extension: (await service.openExtension(1, session, "eidos.journals"))
      .instance,
  }
  const tableProps = {}
  for (const name of ["map", "chart"]) {
    const view = {
      ...state.views[0],
      properties: {
        plugin:
          name === "map"
            ? {
                latitude: field("Latitude"),
                longitude: field("Longitude"),
                label: field("Name"),
                basemap: "offline",
              }
            : { type: "Column", group: field("Category"), aggregate: "Count" },
      },
    }
    tableProps[name] = {
      source,
      table: state,
      view,
      capabilities: { mutate: true },
      query: {},
    }
    instances[name] = (
      await service.openPage(1, session, `eidos.${name}/${name}`, undefined, {
        tableId: table.id,
        viewId: view.id,
      })
    ).instance
  }
  for (const [name, instance] of Object.entries(instances))
    assert.ok(instance, `${name} did not open`)
  const events = [],
    reports = [],
    calls = []
  let failure,
    invoked = false,
    actionDone = false
  const checks = {
    markmap: `document.querySelectorAll('svg .markmap-node').length >= 4`,
    smart: `document.body.innerText.includes('Places')`,
    journals: `document.body.innerText.includes('Your journal starts')`,
    map: `!!document.querySelector('canvas.maplibregl-canvas') && document.body.innerText.includes('Fit all')`,
    chart: `!!document.querySelector('.chart-canvas-container canvas') && document.body.innerText.includes('1 record')`,
  }
  server = http.createServer(async (request, response) => {
    try {
      const target = request.url.slice(1)
      if (target in instances) {
        let html = service.html(instances[target].url)
        if (checks[target])
          html += `<script>let sent=false;setInterval(()=>{if(!sent&&(${checks[target]})){sent=true;parent.postMessage({smoke:true,target:${JSON.stringify(target)},ok:true},'*')}},100);setTimeout(()=>{if(!sent)parent.postMessage({smoke:true,target:${JSON.stringify(target)},ok:false,text:document.body.innerText.slice(0,2500)},'*')},25000)</script>`
        response.setHeader("content-type", "text/html")
        response.end(html)
        return
      }
      if (request.url === "/events") {
        response.end(JSON.stringify(events.splice(0)))
        return
      }
      if (request.url === "/rpc" || request.url === "/report") {
        let body = ""
        for await (const chunk of request) body += chunk
        const value = JSON.parse(body)
        if (request.url === "/report") {
          reports.push(value)
          response.end("ok")
          return
        }
        const { target, request: rpc } = value
        calls.push(`${target}:${rpc.method}`)
        const result = await service.request(
          1,
          session,
          instances[target].ticket,
          rpc,
          (event) => events.push({ target, event })
        )
        if (!result.response.error) {
          if (target in tableProps && rpc.method.startsWith("table."))
            result.response.result = await tableViewRequest(
              tableProps[target],
              rpc,
              manifests[target].views[0].configuration,
              `eidos.${target}`
            )
          if (
            target === "smart" &&
            rpc.method.startsWith("eidos.") &&
            !rpc.method.startsWith("eidos.connection.")
          )
            result.response.result = await fileViewRequest(
              source,
              "eidos.smart-actions",
              rpc
            )
          if (rpc.method === "eidos.connection.isConfigured")
            result.response.result = false
        }
        if (result.response.error)
          throw new Error(
            `${target}:${rpc.method}: ${JSON.stringify(result.response.error)}`
          )
        response.end(JSON.stringify(result.response))
        if (
          target === "extension" &&
          rpc.method === "extension.ready" &&
          !invoked
        ) {
          invoked = true
          void service
            .invoke(
              1,
              session,
              instances.extension.ticket,
              "today",
              undefined,
              undefined,
              (event) => events.push({ target: "extension", event })
            )
            .then(() => {
              actionDone = true
            })
            .catch((error) => {
              failure = error
            })
        }
        return
      }
      response.setHeader("content-type", "text/html")
      response.end(`<!doctype html><style>iframe{width:800px;height:500px}</style>${Object.keys(
        instances
      )
        .map(
          (key) =>
            `<iframe id="${key}" sandbox="allow-scripts" src="/${key}"></iframe>`
        )
        .join("")}<script>
const frames=[...document.querySelectorAll('iframe')];window.addEventListener('message',async e=>{const frame=frames.find(f=>f.contentWindow===e.source);if(!frame)return;if(e.data.smoke){await fetch('/report',{method:'POST',body:JSON.stringify(e.data)});return}if(e.data.protocol!=='eidos-plugin')return;const r=await fetch('/rpc',{method:'POST',body:JSON.stringify({target:frame.id,request:e.data})});e.source.postMessage(await r.json(),'*')});setInterval(async()=>{for(const item of await (await fetch('/events')).json())document.getElementById(item.target).contentWindow.postMessage(item.event,'*')},20);</script>`)
    } catch (error) {
      failure = error
      response.statusCode = 500
      response.end(String(error))
    }
  })
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve))
  child = spawn(
    process.env.CHROME_PATH ??
      "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    [
      "--headless",
      "--enable-unsafe-swiftshader",
      "--disable-background-networking",
      "--no-first-run",
      `--user-data-dir=${path.join(root, "chrome")}`,
      "--remote-debugging-port=0",
      `http://127.0.0.1:${server.address().port}`,
    ],
    { stdio: "ignore" }
  )
  child.on("error", (error) => {
    failure = error
  })
  for (
    let i = 0;
    i < 320 && !failure && !(reports.length === 5 && actionDone);
    i++
  )
    await delay(100)
  console.log(JSON.stringify({ reports, calls, actionDone }, null, 2))
  if (failure) throw failure
  assert.equal(reports.length, 5)
  assert.ok(reports.every((report) => report.ok))
  assert.ok(actionDone, "Journals action did not complete")
  assert.ok(calls.includes("map:table.readRows"))
  assert.ok(calls.includes("chart:table.aggregate"))
  console.log(
    "PASS: seven registry archives installed; five executable plugins rendered against Lite host and native Runtime; Journals action completed"
  )
} finally {
  service?.closeOwner(1)
  if (child && child.exitCode === null) {
    const exited = new Promise((resolve) => child.once("exit", resolve))
    child.kill("SIGTERM")
    await exited
  }
  if (server) await new Promise((resolve) => server.close(resolve))
  await runtime?.close({ requestId: "close", deadlineMilliseconds: 5000 })
  await fs.rm(root, { recursive: true, force: true })
}
