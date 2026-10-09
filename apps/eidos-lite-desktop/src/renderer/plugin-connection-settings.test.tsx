// @vitest-environment jsdom
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, expect, it, vi } from "vitest"
import type { PluginManifest } from "@eidos.space/plugin-sdk"
import type { PluginOpenResult } from "../shared/plugins"
import { PluginConnectionSettings } from "./plugin-connection-settings"

vi.mock("./plugin-editor", () => ({ PluginEditor: () => null }))
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })

const manifest: PluginManifest = {
  apiVersion: 1,
  requires: { pluginApi: "3.0.0" },
  id: "eidos.smart-actions",
  name: "Smart Actions",
  version: "0.3.0",
  connections: {
    generator: {
      title: "Action Generator",
      url: "https://api.example.com/v1/chat/completions",
      configurable: true,
    },
    fixed: {
      title: "TypeSafe AI",
      url: "https://api.typesafe.ai/v1/systemone",
    },
  },
}
const open = vi.fn<typeof window.eidosLite.openPluginExtension>()
const connection = vi.fn<typeof window.eidosLite.pluginConnection>()
const close = vi.fn<typeof window.eidosLite.closePluginEditor>()
let container: HTMLDivElement
let root: Root
let previous: typeof window.eidosLite

function opened(ticket: string): PluginOpenResult {
  return {
    instance: {
      ticket,
      url: "about:blank",
      editor: {
        key: manifest.id,
        label: manifest.name,
        pluginName: manifest.name,
      },
    },
  }
}

beforeEach(() => {
  previous = window.eidosLite
  open.mockReset().mockResolvedValue(opened("connection-ticket"))
  connection.mockReset().mockImplementation(async (_ticket, id, operation) =>
    operation === "status"
      ? id === "generator"
        ? {
            configured: true,
            url: manifest.connections!.generator!.url,
            model: "model-a",
          }
        : false
      : undefined
  )
  close.mockReset().mockResolvedValue(undefined)
  Object.assign(window, {
    eidosLite: {
      openPluginExtension: open,
      pluginConnection: connection,
      closePluginEditor: close,
    },
  })
  container = document.createElement("div")
  document.body.append(container)
  root = createRoot(container)
})

afterEach(async () => {
  await act(async () => root.unmount())
  container.remove()
  Object.assign(window, { eidosLite: previous })
})

async function render() {
  await act(async () =>
    root.render(<PluginConnectionSettings manifest={manifest} />)
  )
}
function form(title: string) {
  return [...container.querySelectorAll("form")].find(
    (element) => element.querySelector("h2")?.textContent === title
  )!
}
function field(target: HTMLFormElement, title: string) {
  const label = [...target.querySelectorAll("label")].find(
    (element) => element.textContent === title
  )!
  return document.getElementById(label.htmlFor) as HTMLInputElement
}
async function input(element: HTMLInputElement, value: string) {
  await act(async () => {
    Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value"
    )!.set!.call(element, value)
    element.dispatchEvent(new Event("input", { bubbles: true }))
  })
}
function submit(target: HTMLFormElement) {
  return act(async () =>
    target.querySelector<HTMLButtonElement>('button[type="submit"]')!.click()
  )
}

it("loads connection metadata without exposing saved keys and labels each control", async () => {
  await render()
  const generator = form("Action Generator")
  expect(generator.getAttribute("aria-labelledby")).toBe(
    generator.querySelector("h2")!.id
  )
  expect(field(generator, "Endpoint").value).toBe(
    manifest.connections!.generator!.url
  )
  expect(field(generator, "Model").value).toBe("model-a")
  const key = field(generator, "API Key")
  expect(key.type).toBe("password")
  expect(key.value).toBe("")
  expect(key.placeholder).toBe("••••••••")
  expect(
    document.getElementById(key.getAttribute("aria-describedby")!)?.textContent
  ).toContain("Leave blank")
  expect(form("TypeSafe AI").querySelectorAll("input")).toHaveLength(1)
  expect(field(form("TypeSafe AI"), "API Key").value).toBe("")
  expect(connection.mock.calls.map((call) => call.slice(0, 3))).toEqual([
    ["connection-ticket", "generator", "status"],
    ["connection-ticket", "fixed", "status"],
  ])
})

it("saves edited connection metadata with a blank key to retain the stored credential", async () => {
  await render()
  const generator = form("Action Generator")
  await input(field(generator, "Model"), "model-b")
  expect(connection).toHaveBeenCalledTimes(2)
  await submit(generator)
  expect(connection).toHaveBeenLastCalledWith(
    "connection-ticket",
    "generator",
    "configure",
    {
      url: manifest.connections!.generator!.url,
      model: "model-b",
      key: "",
    }
  )
  expect(generator.querySelector('[role="status"]')?.textContent).toContain(
    "system encryption"
  )
})

it("keeps drafts on a failed save, permits retry, and clears the key after success", async () => {
  await render()
  const generator = form("Action Generator")
  const key = field(generator, "API Key")
  await input(key, "replacement-key")
  connection.mockRejectedValueOnce(new Error("Encryption unavailable"))
  await submit(generator)
  expect(key.value).toBe("replacement-key")
  expect(generator.querySelector('[role="alert"]')?.textContent).toContain(
    "Encryption unavailable"
  )
  await submit(generator)
  expect(connection).toHaveBeenLastCalledWith(
    "connection-ticket",
    "generator",
    "configure",
    {
      url: manifest.connections!.generator!.url,
      model: "model-a",
      key: "replacement-key",
    }
  )
  expect(key.value).toBe("")
  expect(generator.querySelector('[role="alert"]')).toBeNull()
})

it("retains input focus and locks drafts while a connection save is pending", async () => {
  await render()
  let resolve!: () => void
  connection.mockImplementationOnce(
    () =>
      new Promise<void>((accept) => {
        resolve = accept
      })
  )
  const generator = form("Action Generator")
  const model = field(generator, "Model")
  await input(model, "model-b")
  model.focus()
  await act(async () =>
    generator.dispatchEvent(
      new Event("submit", { bubbles: true, cancelable: true })
    )
  )
  expect(document.activeElement).toBe(model)
  expect(
    [...generator.querySelectorAll("input")].every(
      (element) => element.readOnly
    )
  ).toBe(true)
  expect(generator.getAttribute("aria-busy")).toBe("true")
  expect(
    generator.querySelector<HTMLButtonElement>('button[type="submit"]')!
      .disabled
  ).toBe(true)
  await act(async () => resolve())
  expect(model.readOnly).toBe(false)
  expect(document.activeElement).toBe(model)
})

it("saves and removes a fixed connection key through the host credential API", async () => {
  await render()
  const fixed = form("TypeSafe AI")
  const key = field(fixed, "API Key")
  expect(
    fixed.querySelector<HTMLButtonElement>('button[type="submit"]')!.disabled
  ).toBe(true)
  await input(key, "new-key")
  await submit(fixed)
  expect(connection).toHaveBeenLastCalledWith(
    "connection-ticket",
    "fixed",
    "save",
    "new-key"
  )
  expect(key.value).toBe("")
  const remove = [...fixed.querySelectorAll("button")].find(
    (element) => element.textContent === "Remove credential"
  )!
  await act(async () => remove.click())
  expect(connection).toHaveBeenLastCalledWith(
    "connection-ticket",
    "fixed",
    "save",
    null
  )
  expect(key.placeholder).toBe("API Key")
  expect(fixed.querySelector('[role="status"]')?.textContent).toBe(
    "Credential removed"
  )
})

it("closes a plugin session that finishes opening after the settings unmount", async () => {
  let resolve!: (value: Awaited<ReturnType<typeof open>>) => void
  open.mockImplementationOnce(
    () =>
      new Promise((accept) => {
        resolve = accept
      })
  )
  await render()
  await act(async () => root.unmount())
  await act(async () => resolve(opened("late-ticket")))
  expect(close).toHaveBeenCalledExactlyOnceWith("late-ticket")
  expect(connection).not.toHaveBeenCalled()
})
