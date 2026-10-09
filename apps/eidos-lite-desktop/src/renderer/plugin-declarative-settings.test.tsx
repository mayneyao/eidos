// @vitest-environment jsdom
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, expect, it, vi } from "vitest"
import type { PluginManifest, SettingValue } from "@eidos.space/plugin-sdk"
import { PluginDeclarativeSettings } from "./plugin-declarative-settings"

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
let container: HTMLDivElement
let root: Root
const load = vi.fn<() => Promise<Record<string, SettingValue>>>()
const save = vi.fn<() => Promise<void>>()
const manifest: PluginManifest = {
  apiVersion: 1,
  requires: { pluginApi: "3.3.0" },
  id: "example.settings",
  name: "Settings example",
  version: "1.0.0",
  settings: {
    enabled: {
      type: "boolean",
      title: "Update filenames",
      description: "Rename the file when its title changes.",
      default: true,
    },
    folder: { type: "string", title: "Folder", default: "Notes" },
    mode: {
      type: "string",
      title: "Mode",
      enum: ["manual", "automatic"],
      default: "manual",
    },
    interval: {
      type: "number",
      title: "Interval",
      default: 5,
      minimum: 1,
      maximum: 30,
    },
  },
}

beforeEach(() => {
  load.mockReset().mockResolvedValue({})
  save.mockReset().mockResolvedValue(undefined)
  container = document.createElement("div")
  document.body.append(container)
  root = createRoot(container)
  Object.assign(window, {
    eidosLite: { pluginSettings: load, setPluginSetting: save },
  })
})
afterEach(async () => {
  await act(async () => root.unmount())
  vi.useRealTimers()
  container.remove()
})
async function render(next = manifest) {
  await act(async () =>
    root.render(<PluginDeclarativeSettings manifest={next} />)
  )
}
function field<T extends HTMLElement>(title: string): T {
  const label = [...container.querySelectorAll("label")].find(
    (element) => element.textContent === title
  )!
  return document.getElementById(label.htmlFor) as T
}
async function input(title: string, value: string) {
  const element = field<HTMLInputElement>(title)
  await act(async () => {
    Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value"
    )!.set!.call(element, value)
    element.dispatchEvent(new Event("input", { bubbles: true }))
  })
  return element
}
async function blur(element: HTMLInputElement) {
  await act(async () =>
    element.dispatchEvent(new FocusEvent("focusout", { bubbles: true }))
  )
}
function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (cause: Error) => void
  const promise = new Promise<T>((accept, fail) => {
    resolve = accept
    reject = fail
  })
  return { promise, resolve, reject }
}

it("renders accessible typed controls, descriptions, defaults, and numeric limits", async () => {
  load.mockResolvedValue({ enabled: false, folder: "Journal", interval: 0 })
  await render()
  const toggle = field<HTMLButtonElement>("Update filenames")
  expect(toggle.getAttribute("role")).toBe("switch")
  expect(toggle.getAttribute("aria-checked")).toBe("false")
  expect(
    document.getElementById(toggle.getAttribute("aria-describedby")!)
      ?.textContent
  ).toBe("Rename the file when its title changes.")
  expect(field<HTMLInputElement>("Folder").value).toBe("Journal")
  expect(field<HTMLSelectElement>("Mode").value).toBe("manual")
  const number = field<HTMLInputElement>("Interval")
  expect(number.value).toBe("0")
  expect(number.min).toBe("1")
  expect(number.max).toBe("30")
  expect(number.step).toBe("any")
  expect(
    document.getElementById(number.getAttribute("aria-describedby")!)
      ?.textContent
  ).toBe("Range: 1–30")
})

it("shows the requested switch state while saving and prevents duplicate writes", async () => {
  const pending = deferred<void>()
  save.mockReturnValue(pending.promise)
  await render()
  const toggle = field<HTMLButtonElement>("Update filenames")
  toggle.focus()
  await act(async () => {
    toggle.click()
    toggle.click()
  })
  expect(save).toHaveBeenCalledExactlyOnceWith(manifest.id, "enabled", false)
  expect(toggle.getAttribute("aria-checked")).toBe("false")
  expect(toggle.getAttribute("aria-disabled")).toBe("true")
  expect(document.activeElement).toBe(toggle)
  expect(container.textContent).toContain("Saving…")
  await act(async () => pending.resolve())
  expect(toggle.getAttribute("aria-disabled")).toBe("false")
  expect(toggle.getAttribute("aria-checked")).toBe("false")
  expect(container.textContent).toContain("Saved")
})

it("restores a failed switch and leaves its error beside the affected setting", async () => {
  save.mockRejectedValueOnce(new Error("Plugin disabled"))
  await render()
  const toggle = field<HTMLButtonElement>("Update filenames")
  await act(async () => toggle.click())
  expect(toggle.getAttribute("aria-checked")).toBe("true")
  expect(toggle.disabled).toBe(false)
  expect(
    toggle.closest(".plugin-setting-row")?.querySelector('[role="alert"]')
      ?.textContent
  ).toContain("Plugin disabled")
  expect(container.textContent).toContain("Save failed")
  await act(async () => toggle.click())
  expect(toggle.getAttribute("aria-checked")).toBe("false")
  expect(container.querySelector('[role="alert"]')).toBeNull()
})

it("saves a select immediately and restores the saved choice after a failure", async () => {
  save.mockRejectedValueOnce(new Error("Cannot write settings"))
  await render()
  const select = field<HTMLSelectElement>("Mode")
  await act(async () => {
    select.value = "automatic"
    select.dispatchEvent(new Event("change", { bubbles: true }))
  })
  expect(save).toHaveBeenCalledWith(manifest.id, "mode", "automatic")
  expect(select.value).toBe("manual")
  expect(select.getAttribute("aria-invalid")).toBe("true")
  await act(async () => {
    select.value = "automatic"
    select.dispatchEvent(new Event("change", { bubbles: true }))
  })
  expect(select.value).toBe("automatic")
  expect(select.getAttribute("aria-invalid")).toBe("false")
})

it("preserves text drafts on failure and retries on blur without remounting the input", async () => {
  save.mockRejectedValueOnce(new Error("Disk full"))
  await render()
  const element = await input("Folder", "Work")
  expect(save).not.toHaveBeenCalled()
  await blur(element)
  expect(element.value).toBe("Work")
  expect(element.getAttribute("aria-invalid")).toBe("true")
  await blur(element)
  expect(save).toHaveBeenCalledTimes(2)
  expect(field("Folder")).toBe(element)
  expect(element.getAttribute("aria-invalid")).toBe("false")
  await blur(element)
  expect(save).toHaveBeenCalledTimes(2)
})

it("supports Enter to save and Escape to discard an uncommitted text change", async () => {
  await render()
  const element = await input("Folder", "Work")
  await act(async () => {
    element.focus()
    element.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Enter", bubbles: true })
    )
  })
  expect(save).toHaveBeenCalledExactlyOnceWith(manifest.id, "folder", "Work")
  await input("Folder", "Temporary")
  await act(async () =>
    element.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Escape", bubbles: true })
    )
  )
  expect(element.value).toBe("Work")
  await blur(element)
  expect(save).toHaveBeenCalledTimes(1)
})

it("rejects empty and out-of-range numbers without saving zero, and accepts decimals", async () => {
  await render()
  const element = await input("Interval", "")
  await blur(element)
  expect(container.textContent).toContain("Enter a number.")
  expect(save).not.toHaveBeenCalled()
  await input("Interval", "0")
  await blur(element)
  expect(container.textContent).toContain("Enter 1 or more.")
  await input("Interval", "31")
  await blur(element)
  expect(container.textContent).toContain("Enter 30 or less.")
  expect(save).not.toHaveBeenCalled()
  await input("Interval", "2.5")
  await blur(element)
  expect(save).toHaveBeenCalledExactlyOnceWith(manifest.id, "interval", 2.5)
  expect(element.getAttribute("aria-invalid")).toBe("false")
})

it("uses the Runtime string limit before sending a write", async () => {
  await render()
  await blur(await input("Folder", "中".repeat(1400)))
  expect(container.textContent).toContain("This value is too long.")
  expect(save).not.toHaveBeenCalled()
})

it("offers retry after a load failure and then restores all setting controls", async () => {
  load.mockRejectedValueOnce(new Error("Read failed"))
  await render()
  expect(container.querySelector('[role="alert"]')?.textContent).toContain(
    "Read failed"
  )
  const retry = [...container.querySelectorAll("button")].find(
    (button) => button.textContent === "Retry"
  )!
  await act(async () => retry.click())
  expect(load).toHaveBeenCalledTimes(2)
  expect(container.querySelector('[role="alert"]')).toBeNull()
  expect(field<HTMLInputElement>("Folder").value).toBe("Notes")
})

it("delays loading feedback without delaying ready settings", async () => {
  vi.useFakeTimers()
  const pending = deferred<Record<string, SettingValue>>()
  load.mockReturnValueOnce(pending.promise)
  await render()
  expect(container.textContent).not.toContain("Loading settings…")
  await act(async () => vi.advanceTimersByTime(200))
  expect(container.textContent).toContain("Loading settings…")
  await act(async () => pending.resolve({ folder: "Ready" }))
  expect(field<HTMLInputElement>("Folder").value).toBe("Ready")
  expect(container.textContent).not.toContain("Loading settings…")
})

it("keeps saving feedback until concurrent field writes have both completed", async () => {
  const first = deferred<void>()
  const second = deferred<void>()
  save.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise)
  await render()
  await act(async () => field<HTMLButtonElement>("Update filenames").click())
  await blur(await input("Folder", "Work"))
  expect(save).toHaveBeenCalledTimes(2)
  await act(async () => first.resolve())
  expect(container.querySelector(".plugin-settings-status")?.textContent).toBe(
    "Saving…"
  )
  expect(field<HTMLInputElement>("Folder").readOnly).toBe(true)
  await act(async () => second.resolve())
  expect(container.querySelector(".plugin-settings-status")?.textContent).toBe(
    "Saved"
  )
  expect(field<HTMLInputElement>("Folder").readOnly).toBe(false)
})

it("discards a superseded load when the selected plugin changes", async () => {
  const first = deferred<Record<string, SettingValue>>()
  load
    .mockReturnValueOnce(first.promise)
    .mockResolvedValueOnce({ folder: "Other" })
  await render()
  await render({ ...manifest, id: "example.other" })
  expect(field<HTMLInputElement>("Folder").value).toBe("Other")
  await act(async () => first.resolve({ folder: "Stale" }))
  expect(field<HTMLInputElement>("Folder").value).toBe("Other")
  await blur(await input("Folder", "Latest"))
  expect(save).toHaveBeenCalledWith("example.other", "folder", "Latest")
})

it("ignores save feedback from a plugin that has been left", async () => {
  const pending = deferred<void>()
  save.mockReturnValueOnce(pending.promise)
  await render()
  await act(async () => field<HTMLButtonElement>("Update filenames").click())
  await render({ ...manifest, id: "example.other" })
  await act(async () => pending.reject(new Error("Old save failed")))
  expect(container.textContent).not.toContain("Old save failed")
  expect(container.textContent).not.toContain("Save failed")
  expect(
    field<HTMLButtonElement>("Update filenames").getAttribute("aria-checked")
  ).toBe("true")
})
