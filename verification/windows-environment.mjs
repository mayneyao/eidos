import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"
import { Worker } from "node:worker_threads"
import { once } from "node:events"

if (process.platform !== "win32") process.exit(0)
const snapshot = () => ({
  systemRootMixedCasePresent: typeof process.env.SystemRoot === "string",
  systemRootUpperCasePresent: typeof process.env.SYSTEMROOT === "string",
  rootKeys: Object.keys(process.env).filter(
    (name) => name.toLowerCase() === "systemroot"
  ),
})
const main = snapshot()
assert(main.systemRootMixedCasePresent)
const worker = new Worker(
  `const {parentPort}=require('node:worker_threads'); parentPort.postMessage({systemRootMixedCasePresent:typeof process.env.SystemRoot==='string',systemRootUpperCasePresent:typeof process.env.SYSTEMROOT==='string',rootKeys:Object.keys(process.env).filter(name=>name.toLowerCase()==='systemroot')});`,
  { eval: true }
)
const message = once(worker, "message")
const exit = once(worker, "exit")
const [thread] = await message
assert.equal((await exit)[0], 0)
const file = path.resolve("../../candidate-evidence/windows-environment.json")
fs.mkdirSync(path.dirname(file), { recursive: true })
fs.writeFileSync(
  file,
  JSON.stringify(
    {
      platform: process.platform,
      node: process.version,
      main,
      worker: thread,
      valuesPrinted: false,
    },
    null,
    2
  ) + "\n"
)
console.log(JSON.stringify({ main, worker: thread, valuesPrinted: false }))
