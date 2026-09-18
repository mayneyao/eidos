import fs from "node:fs/promises"
import path from "node:path"
import os from "node:os"
import http from "node:http"
import { spawn } from "node:child_process"
import { setTimeout as delay } from "node:timers/promises"
import { fileURLToPath } from "node:url"
import { compilePlugin } from "../dist/compiler.js"
import { documentViewHtml, SANDBOX_CSP } from "../dist/sandbox.js"
import { WorkingCopy } from "../dist/working-copy.js"
import { Scope } from "../dist/lifecycle.js"

const chrome =
  process.env.CHROME_PATH ??
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
await fs.access(chrome)
const temporary = await fs.mkdtemp(
  path.join(os.tmpdir(), "eidos-plugin-browser-")
)
const root = await fs.realpath(temporary)
let server, child
try {
  const templates = fileURLToPath(
    new URL("../../plugin-tools/templates/", import.meta.url)
  )
  for (const [from, to] of [
    ["main.ts.txt", "csv-view.ts"],
    ["csv.ts.txt", "csv.ts"],
    ["style.css.txt", "style.css"],
  ])
    await fs.copyFile(path.join(templates, from), path.join(root, to))
  await fs.writeFile(
    path.join(root, "plugin.json"),
    JSON.stringify({
      apiVersion: 1,
      id: "local.smoke",
      name: "CSV smoke",
      version: "1.0.0",
      views: [
        {
          id: "csv",
          title: "CSV",
          entry: "./main.ts",
          context: "document",
          access: "write",
        },
      ],
    })
  )
  await fs.writeFile(
    path.join(root, "main.ts"),
    `import mount from './csv-view'; import type { ViewContext } from '@eidos.space/plugin-sdk';
export default async function smoke(ctx: ViewContext, root: HTMLElement) {
  await mount(ctx, root);
  let parentBlocked = false, networkBlocked = false;
  try { void parent.document.body; } catch { parentBlocked = true; }
  try { await fetch('/forbidden'); } catch { networkBlocked = true; }
  const input = root.querySelector('textarea')!; input.value = 'updated'; input.dispatchEvent(new Event('input', {bubbles:true}));
  await new Promise(resolve => setTimeout(resolve, 200));
  (root.querySelector('#save') as HTMLButtonElement).click();
  await new Promise(resolve => setTimeout(resolve, 200));
  parent.postMessage({smoke: true, parentBlocked, networkBlocked, status: root.querySelector('[role=status]')!.textContent}, '*');
}`
  )
  const react = process.argv.includes("--react")
  const compiled = await compilePlugin(
    react
      ? (process.env.EIDOS_CSV_PLUGIN ??
          path.join(os.homedir(), "workspace/eidos-plugins/eidos-csv-plugin"))
      : root
  )
  const reactProbe = react
    ? `
    (async () => {
      const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
      for(let i=0;i<100 && !document.querySelector('textarea');i++) await delay(50);
      let parentBlocked=false, networkBlocked=false;
      try { void parent.document.body; } catch { parentBlocked=true; }
      try { await fetch('/forbidden'); } catch { networkBlocked=true; }
      const input=document.querySelector('textarea');
      if(!input) throw Error('React view did not mount');
      Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(input,'updated');
      input.dispatchEvent(new Event('input',{bubbles:true}));
      for(let i=0;i<100 && document.querySelector('[role=status]').textContent!=='Unsaved changes';i++) await delay(50);
      document.querySelector('#save').click();
      for(let i=0;i<100 && document.querySelector('[role=status]').textContent!=='Saved';i++) await delay(50);
      parent.postMessage({smoke:true,parentBlocked,networkBlocked,status:document.querySelector('[role=status]').textContent},'*');
    })().catch(error=>parent.postMessage({smoke:true,error:String(error)},'*'));
  `
    : ""
  const html = documentViewHtml(
    compiled.program.modules[react ? "./src/main.tsx" : "./main.ts"]
  ).replace(
    "<script>",
    `<script>${reactProbe}window.addEventListener('error',event=>parent.postMessage({smoke:true,error:event.message},'*'));setInterval(()=>{const alert=document.querySelector('[role=alert]');if(alert)parent.postMessage({smoke:true,error:alert.textContent},'*')},250);`
  )
  const data = path.join(root, "data.csv")
  await fs.writeFile(data, "name,value\na,1\n")
  let revision = "disk-1"
  const read = async () => ({
    text: await fs.readFile(data, "utf8"),
    revision,
    encoding: "utf-8",
    bom: false,
  })
  const scope = new Scope()
  const copy = new WorkingCopy(await read(), {
    read,
    async write(text, expected) {
      if (expected !== revision) return { status: "conflict" }
      await fs.writeFile(data, text)
      revision += "-saved"
      return { status: "saved", snapshot: await read() }
    },
  })
  const document = copy.bind(scope, "write")
  let report,
    forbidden = 0
  const requests = []
  server = http.createServer(async (request, response) => {
    requests.push(request.url)
    try {
      if (request.url === "/guest") {
        response.writeHead(200, {
          "content-type": "text/html",
          "content-security-policy": SANDBOX_CSP,
        })
        response.end(html)
        return
      }
      if (request.url === "/forbidden") {
        forbidden++
        response.end("forbidden")
        return
      }
      if (request.url === "/report") {
        let body = ""
        for await (const chunk of request) body += chunk
        report = JSON.parse(body)
        response.end("ok")
        return
      }
      if (request.url === "/rpc") {
        let body = ""
        for await (const chunk of request) body += chunk
        const rpc = JSON.parse(body)
        let result = null
        if (rpc.method === "document.read" || rpc.method === "document.observe")
          result = await document.read()
        else if (rpc.method === "document.edit")
          result = await document.edit(rpc.params)
        else if (rpc.method === "document.save") result = await document.save()
        else if (rpc.method === "document.undo") result = await document.undo()
        else if (rpc.method === "document.redo") result = await document.redo()
        response.setHeader("content-type", "application/json")
        response.end(
          JSON.stringify({
            protocol: "eidos-plugin",
            apiVersion: 1,
            id: rpc.id,
            result,
          })
        )
        return
      }
      response.setHeader("content-type", "text/html")
      response.end(`<!doctype html><body><iframe sandbox="allow-scripts" src="/guest"></iframe><pre id="result">pending</pre><script>
      const frame=document.querySelector('iframe'); window.addEventListener('message',async event=>{
        if(event.source!==frame.contentWindow)return;
        if(event.data.smoke){await fetch('/report',{method:'POST',body:JSON.stringify(event.data)});document.querySelector('#result').textContent=JSON.stringify(event.data);return;}
        if(event.data.protocol!=='eidos-plugin')return;
        const response=await fetch('/rpc',{method:'POST',body:JSON.stringify(event.data)});event.source.postMessage(await response.json(),'*');
      });</script>`)
    } catch (error) {
      response.statusCode = 500
      response.end(String(error))
    }
  })
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve))
  const address = server.address()
  const url = `http://127.0.0.1:${address.port}`
  child = spawn(
    chrome,
    [
      "--headless",
      "--disable-gpu",
      "--disable-background-networking",
      "--no-first-run",
      `--user-data-dir=${path.join(root, "chrome")}`,
      "--remote-debugging-port=0",
      url,
    ],
    { stdio: ["ignore", "pipe", "pipe"] }
  )
  let output = "",
    errors = ""
  child.stdout.on("data", (chunk) => {
    output += chunk
  })
  child.stderr.on("data", (chunk) => {
    errors += chunk
  })
  for (
    let attempt = 0;
    attempt < 200 && !report && child.exitCode === null;
    attempt++
  )
    await delay(100)
  const exited = new Promise((resolve) => child.once("exit", resolve))
  child.kill("SIGTERM")
  await exited
  if (
    !report?.parentBlocked ||
    !report?.networkBlocked ||
    forbidden ||
    !(await fs.readFile(data, "utf8")).startsWith(
      react ? "name,value\nupdated,1" : "updated,value"
    ) ||
    copy.snapshot().dirty
  )
    throw Error(
      `Sandbox smoke failed: ${JSON.stringify(report)} requests=${JSON.stringify(requests)}\n${output.slice(-1500)}\n${errors.slice(-1000)}`
    )
  console.log(
    "PASS: compiled CSV view mounted, edited and saved through injected working-copy API; parent DOM and network denied by Chromium."
  )
  scope.dispose()
} finally {
  if (child && child.exitCode === null) child.kill("SIGKILL")
  if (server) await new Promise((resolve) => server.close(resolve))
  await fs.rm(temporary, { recursive: true, force: true })
}
