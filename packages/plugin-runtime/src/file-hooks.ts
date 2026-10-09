import type {
  FileHookDeclaration,
  FileHookEvent,
  FileHookPlan,
  PluginManifest,
  SettingValue,
} from "./contracts"
import { PluginError } from "./errors"

export function matchingFileHooks(
  manifest: PluginManifest,
  event: FileHookEvent
): FileHookDeclaration[] {
  if (event.source !== "local") return []
  return (manifest.hooks ?? []).filter(
    (hook) =>
      hook.event === event.type &&
      hook.extensions.some((extension) =>
        event.path.toLowerCase().endsWith(extension)
      )
  )
}

/** A hook can propose changes only to the event document in its existing folder. */
export function parseFileHookPlan(
  value: unknown,
  declaration: FileHookDeclaration,
  event: FileHookEvent
): FileHookPlan | null {
  if (value == null) return null
  if (typeof value !== "object" || Array.isArray(value))
    throw new PluginError("INVALID_REQUEST", "Invalid file hook plan")
  const plan = value as Record<string, unknown>
  if (Object.keys(plan).some((key) => key !== "text" && key !== "name"))
    throw new PluginError("INVALID_REQUEST", "Unknown file hook plan field")
  if (Object.keys(plan).length && declaration.access !== "write")
    throw new PluginError("PERMISSION_DENIED", "This hook is read-only")
  if (
    plan.text !== undefined &&
    (typeof plan.text !== "string" ||
      new TextEncoder().encode(plan.text).length > 2 * 1024 * 1024)
  )
    throw new PluginError(
      "INVALID_REQUEST",
      "Hook text exceeds 2 MiB or is not text"
    )
  const previousName = event.path.split("/").at(-1)!
  if (plan.name !== undefined) {
    if (
      typeof plan.name !== "string" ||
      !plan.name ||
      plan.name.startsWith(".") ||
      /[<>:"/\\|?*\u0000-\u001f]/.test(plan.name) ||
      /[. ]$/.test(plan.name) ||
      new TextEncoder().encode(plan.name).length > 200 ||
      /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(plan.name)
    )
      throw new PluginError(
        "INVALID_REQUEST",
        "Hook filename must be a portable leaf name"
      )
    if (
      plan.name.slice(plan.name.lastIndexOf(".")).toLowerCase() !==
      previousName.slice(previousName.lastIndexOf(".")).toLowerCase()
    )
      throw new PluginError(
        "INVALID_REQUEST",
        "A file hook must retain the file extension"
      )
  }
  const text =
    plan.text === event.document.text
      ? undefined
      : (plan.text as string | undefined)
  const name =
    plan.name === previousName ? undefined : (plan.name as string | undefined)
  return text === undefined && name === undefined
    ? null
    : {
        ...(text === undefined ? {} : { text }),
        ...(name === undefined ? {} : { name }),
      }
}

export interface BrowserFileHookInput {
  html: string
  hook: string
  invocation: string
  actions: string[]
  formatters: string[]
  hooks: string[]
  event: FileHookEvent
  settings: Record<string, SettingValue>
  timeoutMs?: number
}

/** Standalone browser function: serialized by Lite and used directly by both mobile hosts. */
export async function runFileHookInBrowser(
  input: BrowserFileHookInput
): Promise<unknown> {
  const frame = document.createElement("iframe")
  frame.setAttribute("sandbox", "allow-scripts")
  frame.setAttribute("referrerpolicy", "no-referrer")
  frame.hidden = true
  frame.srcdoc = input.html
  let ready = false
  let receive: (event: MessageEvent) => void = () => {}
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    return await new Promise((resolve, reject) => {
      timer = setTimeout(
        () => reject(new Error("File hook timed out")),
        input.timeoutMs ?? 2000
      )
      receive = (event: MessageEvent) => {
        if (event.source !== frame.contentWindow) return
        const message = event.data
        if (
          message?.protocol !== "eidos-plugin" ||
          message.apiVersion !== 1 ||
          typeof message.id !== "string"
        )
          return
        const reply = (result: unknown = null) =>
          frame.contentWindow?.postMessage(
            { protocol: "eidos-plugin", apiVersion: 1, id: message.id, result },
            "*"
          )
        if (message.method === "view.ready") {
          reply()
          return
        }
        if (message.method === "extension.failed") {
          reply()
          reject(
            new Error(
              String(message.params?.message ?? "Hook activation failed")
            )
          )
          return
        }
        if (message.method === "extension.ready") {
          const registrations = message.params
          const matches = (actual: unknown, expected: string[]) =>
            Array.isArray(actual) &&
            actual.length === expected.length &&
            new Set(actual).size === expected.length &&
            expected.every((id) => actual.includes(id))
          if (
            ready ||
            !matches(registrations?.actions ?? [], input.actions) ||
            !matches(registrations?.formatters ?? [], input.formatters) ||
            !matches(registrations?.hooks ?? [], input.hooks)
          ) {
            reject(
              new Error(
                "Hook activation must register every declared contribution"
              )
            )
            return
          }
          ready = true
          reply()
          frame.contentWindow?.postMessage(
            {
              protocol: "eidos-plugin",
              apiVersion: 1,
              observation: "hook.run",
              value: {
                invocation: input.invocation,
                hook: input.hook,
                event: input.event,
                settings: input.settings,
              },
            },
            "*"
          )
          return
        }
        if (
          message.method === "hook.complete" &&
          ready &&
          message.params?.invocation === input.invocation
        ) {
          reply()
          if (message.params.error)
            reject(new Error(String(message.params.error)))
          else resolve(message.params.result)
          return
        }
        // Hooks receive snapshots and return plans, without action/view capabilities.
        frame.contentWindow?.postMessage(
          {
            protocol: "eidos-plugin",
            apiVersion: 1,
            id: message.id,
            error: {
              code: "PERMISSION_DENIED",
              message: "Capability is unavailable in a file hook",
            },
          },
          "*"
        )
      }
      window.addEventListener("message", receive)
      document.body.append(frame)
    })
  } finally {
    clearTimeout(timer)
    window.removeEventListener("message", receive)
    frame.remove()
  }
}
