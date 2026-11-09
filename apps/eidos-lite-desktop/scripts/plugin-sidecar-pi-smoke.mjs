// Run with: node --import tsx scripts/plugin-sidecar-pi-smoke.mjs /path/to/plugin.json [--prompt]
import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { PluginSidecarHost } from "../src/main/plugins/plugin-sidecar.ts"

const manifest = JSON.parse(await fs.readFile(process.argv[2], "utf8"))
const directory = await fs.mkdtemp(path.join(os.tmpdir(), "eidos-pi-smoke-"))
const marker = "EIDOS_PI_SIDECAR_READ_OK"
await fs.writeFile(
  path.join(directory, "README.md"),
  `Verification marker: ${marker}\n`
)
const host = new PluginSidecarHost(async () => true)
const binding = {
  owner: 1,
  space: "pi-smoke",
  hash: "a".repeat(64),
  cwd: directory,
  manifest: {
    ...manifest,
    sidecar: {
      ...manifest.sidecar,
      args: [...manifest.sidecar.args, "--no-session"],
    },
  },
  authorize: async () => {},
}
const pending = new Map()
let sequence = 0
let settled
const completed = new Promise((resolve) => {
  settled = resolve
})
const result = {
  installed: false,
  connected: false,
  models: 0,
  provider: null,
  readToolCalled: false,
  markerReturned: false,
  restoredMessages: 0,
  stopped: false,
}
let exited
const exit = new Promise((resolve) => {
  exited = resolve
})
host.observe(binding, (event) => {
  if (event.type === "exit") {
    result.stopped = true
    exited()
    for (const request of pending.values())
      request.reject(new Error("Pi exited"))
    pending.clear()
  }
  if (event.type !== "message" || !event.data || typeof event.data !== "object")
    return
  const frame = event.data
  if (frame.type === "response") {
    const request = pending.get(frame.id)
    if (request) {
      pending.delete(frame.id)
      frame.success
        ? request.resolve(frame.data ?? {})
        : request.reject(new Error(`Pi rejected ${frame.command}`))
    }
  }
  if (frame.type === "tool_execution_start" && frame.toolName === "read")
    result.readToolCalled = true
  if (frame.type === "message_end" && frame.message?.role === "assistant") {
    const text =
      frame.message.content
        ?.filter((part) => part.type === "text")
        .map((part) => part.text)
        .join("") ?? ""
    if (text.includes(marker)) result.markerReturned = true
  }
  if (frame.type === "agent_settled") settled()
})
async function request(type, args = {}) {
  const id = String(++sequence)
  let timer
  const answer = new Promise((resolve, reject) => {
    timer = setTimeout(() => {
      pending.delete(id)
      reject(new Error(`Pi ${type} timed out`))
    }, 30_000)
    pending.set(id, { resolve, reject })
  })
  void answer.catch(() => {})
  try {
    await host.send(binding, { type, id, ...args })
    return await answer
  } finally {
    clearTimeout(timer)
    pending.delete(id)
  }
}
let deadline
try {
  result.installed = (await host.status(binding)).available
  await host.start(binding)
  const state = await request("get_state")
  result.connected = true
  const catalog = await request("get_available_models")
  result.models = catalog.models.length
  const model =
    catalog.models.find(
      (item) =>
        item.provider === state.model?.provider && item.id === state.model?.id
    ) ?? catalog.models[0]
  result.provider = model?.provider ?? null
  console.log(JSON.stringify({ stage: "connected", ...result }))
  if (process.argv.includes("--prompt")) {
    if (!model) throw new Error("No configured Pi models available")
    await request("set_model", { provider: model.provider, modelId: model.id })
    const limit = new Promise((_, reject) => {
      deadline = setTimeout(
        () => reject(new Error("Pi prompt timed out")),
        90_000
      )
    })
    await request("prompt", {
      message:
        "Read README.md with the read tool and reply with only its verification marker.",
    })
    await Promise.race([completed, limit])
    const history = await request("get_messages")
    result.restoredMessages = history.messages.length
    if (!result.readToolCalled || !result.markerReturned)
      throw new Error("Pi did not complete the file-read verification")
  }
} catch (error) {
  process.exitCode = 1
  // Do not print native provider payloads, headers, credentials or model configuration.
  console.error(
    error instanceof Error ? error.message : "Pi verification failed"
  )
} finally {
  clearTimeout(deadline)
  host.stop(binding)
  let closeTimer
  await Promise.race([
    exit,
    new Promise((resolve) => {
      closeTimer = setTimeout(resolve, 3000)
    }),
  ])
  clearTimeout(closeTimer)
  host.close()
  console.log(JSON.stringify({ stage: "finished", ...result }))
  await fs.rm(directory, { recursive: true, force: true })
}
