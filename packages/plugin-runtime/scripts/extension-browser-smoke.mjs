import assert from "node:assert/strict"
import fs from "node:fs/promises"
import path from "node:path"
import os from "node:os"
import http from "node:http"
import { spawn } from "node:child_process"
import { setTimeout as delay } from "node:timers/promises"
import { fileURLToPath } from "node:url"
import { build } from "esbuild"
import { compilePlugin } from "../dist/compiler.js"
import { SANDBOX_CSP } from "../dist/sandbox.js"

const repository = fileURLToPath(new URL("../../../", import.meta.url))
const hostRoot = path.join(repository, "apps/eidos-lite-desktop/src/main")
const output = fileURLToPath(
  new URL("../dist/extension-smoke-host.mjs", import.meta.url)
)
await build({
  stdin: {
    contents: `export {PluginService} from ${JSON.stringify(path.join(hostRoot, "plugins/plugin-service.ts"))}; export {PluginStore} from ${JSON.stringify(path.join(hostRoot, "plugins/plugin-store.ts"))}; export {readTextFilePreview,saveTextFile} from ${JSON.stringify(path.join(hostRoot, "space/text-file-preview.ts"))};`,
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
  },
})
const { PluginService, PluginStore, readTextFilePreview, saveTextFile } =
  await import(output)
const root = await fs.mkdtemp(
  path.join(os.tmpdir(), "eidos-extension-browser-")
)
let server, child, service
try {
  await fs.writeFile(
    path.join(root, "plugin.json"),
    JSON.stringify({
      apiVersion: 1,
      id: "local.reference",
      name: "Reference",
      version: "1.0.0",
      extension: "./extension.ts",
      actions: [
        {
          id: "trim",
          title: "Trim",
          context: "document",
          access: "write",
          extensions: [".md"],
        },
      ],
      views: [
        { id: "home", title: "Home", context: "page", entry: "./page.ts" },
      ],
      placements: [
        { location: "navigation", view: "home" },
        { location: "command-palette", action: "trim" },
      ],
    })
  )
  await fs.writeFile(
    path.join(root, "page.ts"),
    `import type {ViewContext} from '@eidos.space/plugin-sdk'; export default async function mount(ctx:ViewContext,root:HTMLElement){ if(ctx.binding.kind !== 'page') throw Error('Wrong binding');root.textContent=ctx.binding.route; await ctx.ui.notify('page:'+ctx.binding.route); }`
  )
  await fs.writeFile(
    path.join(root, "extension.ts"),
    `import type {ExtensionContext} from '@eidos.space/plugin-sdk';
let activation = 0;
export default function activate(ctx:ExtensionContext){ activation++; let runs=0;
ctx.actions.register('trim', async (ctx)=>{ if(ctx.binding.kind !== 'document') throw Error('Wrong binding');
const doc=ctx.binding.document, state=await doc.read(); const result=await doc.edit({text:state.text.trim()+'\\n',expectedVersion:state.version}); if(result.status !== 'applied')throw Error('Stale'); await doc.save();
await ctx.ui.notify('activation:'+activation+',run:'+ ++runs);
setTimeout(async()=>{let expired=false;try{await doc.read()}catch{expired=true}parent.postMessage({smoke:true,expired,aborted:ctx.signal.aborted},'*')},100);
}); }`
  )
  const compiled = await compilePlugin(root)
  const store = new PluginStore(path.join(root, "installed"))
  await store.install(compiled.bytes, "space")
  service = new PluginService(store)
  await fs.writeFile(path.join(root, "entry.md"), "  hello  ")
  const session = {
    canonical: { id: "space" },
    previewTextFile: (file) => readTextFilePreview(root, file),
    saveTextFile: (request) => saveTextFile(root, request),
  }
  const instances = {
    page: (
      await service.openPage(1, session, "local.reference/home", "week/42")
    ).instance,
    extension: (await service.openExtension(1, session, "local.reference"))
      .instance,
  }
  const events = [],
    notifications = [],
    reports = []
  let started = false,
    done = false,
    failure
  const invoke = async () => {
    for (let i = 0; i < 2; i++) {
      await service.invoke(
        1,
        session,
        instances.extension.ticket,
        "trim",
        "entry.md",
        undefined,
        (event) => events.push({ target: "extension", event })
      )
      assert.equal(
        (await service.openExtension(1, session, "local.reference")).instance
          .ticket,
        instances.extension.ticket
      )
    }
    done = true
  }
  server = http.createServer(async (request, response) => {
    try {
      const target = request.url?.slice(1)
      if (target in instances) {
        response.writeHead(200, {
          "content-type": "text/html",
          "content-security-policy": SANDBOX_CSP,
        })
        response.end(service.html(instances[target].url))
        return
      }
      if (request.url === "/events") {
        response.setHeader("content-type", "application/json")
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
        const instance = instances[value.target]
        const result = await service.request(
          1,
          session,
          instance.ticket,
          value.request,
          (event) => events.push({ target: value.target, event })
        )
        if (result.notification) notifications.push(result.notification)
        response.setHeader("content-type", "application/json")
        response.end(JSON.stringify(result.response))
        if (
          value.target === "extension" &&
          value.request.method === "extension.ready" &&
          !started
        ) {
          started = true
          void invoke().catch((error) => {
            failure = error
          })
        }
        return
      }
      response.setHeader("content-type", "text/html")
      response.end(`<!doctype html><iframe id="page" sandbox="allow-scripts" src="/page"></iframe><iframe id="extension" sandbox="allow-scripts" src="/extension"></iframe><script>
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
      "--disable-gpu",
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
    i < 200 &&
    !failure &&
    !(done && reports.length === 2 && notifications.includes("page:week/42"));
    i++
  )
    await delay(100)
  if (failure) throw failure
  assert.equal(done, true, "Actions did not complete")
  assert.deepEqual(
    notifications.filter((n) => n.startsWith("activation:")),
    ["activation:1,run:1", "activation:1,run:2"]
  )
  assert.ok(notifications.includes("page:week/42"))
  assert.equal(reports.length, 2)
  assert.ok(
    reports.every((r) => r.expired && r.aborted),
    "Retained handles must expire after each action"
  )
  assert.equal(
    await fs.readFile(path.join(root, "entry.md"), "utf8"),
    "hello\n"
  )
  console.log(
    "PASS: real Chromium page route, lazy activation reuse, document actions, save and expired invocation handles"
  )
} finally {
  service?.closeOwner(1)
  if (child && child.exitCode === null) {
    const exited = new Promise((resolve) => child.once("exit", resolve))
    child.kill("SIGTERM")
    await exited
  }
  if (server) await new Promise((resolve) => server.close(resolve))
  await fs.rm(root, { recursive: true, force: true })
}
