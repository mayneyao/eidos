// @vitest-environment jsdom

import { act, createElement } from "react"
import { createRoot, type Root } from "react-dom/client"
import { SyncPasswordSettings } from "./sync-password-settings"

describe("default sync password settings", () => {
  let root: Root
  let host: HTMLDivElement
  beforeEach(() => {
    host = document.createElement("div")
    document.body.append(host)
    root = createRoot(host)
  })
  afterEach(async () => {
    await act(async () => root.unmount())
    host.remove()
  })
  const button = (label: string) =>
    Array.from(host.querySelectorAll("button")).find((value) =>
      value.textContent?.includes(label)
    )!
  const enter = async (input: HTMLInputElement, value: string) =>
    act(async () => {
      Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        "value"
      )!.set!.call(input, value)
      input.dispatchEvent(new Event("input", { bubbles: true }))
    })
  it("saves only matching passwords as controlled bytes and removes the form after success", async () => {
    let configured = false
    let supplied = ""
    let transferred: Uint8Array | undefined
    const saveDefaultSyncPassword = vi.fn(
      async (input: { password: Uint8Array }) => {
        transferred = input.password
        supplied = new TextDecoder().decode(input.password)
        configured = true
      }
    )
    Object.defineProperty(window, "eidosLite", {
      configurable: true,
      value: {
        getSyncPasswordSettings: async () => ({ available: true, configured }),
        saveDefaultSyncPassword,
      },
    })
    await act(async () => root.render(createElement(SyncPasswordSettings)))
    await act(async () => button("Set up sync password").click())
    const fields = host.querySelectorAll<HTMLInputElement>(
      "input[type=password]"
    )
    await enter(fields[0]!, "synthetic password")
    await enter(fields[1]!, "different")
    expect(button("Save password").disabled).toBe(true)
    expect(fields[1]!.getAttribute("aria-invalid")).toBe("true")
    expect(host.querySelector('[role="status"]')?.textContent).toBe(
      "The passwords do not match."
    )
    await enter(fields[1]!, "synthetic password")
    await act(async () =>
      host
        .querySelector("form")!
        .dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }))
    )
    expect(supplied).toBe("synthetic password")
    expect(transferred?.every((value) => value === 0)).toBe(true)
    expect(host.querySelector("input[type=password]")).toBeNull()
    expect(host.textContent).toContain("Saved on this device")
    expect(document.activeElement).toBe(button("Change for new Spaces"))
    expect(host.querySelector('[role="status"]')?.textContent).toBe(
      "Sync password saved for new Spaces."
    )
  })
  it("explains password replacement without a credential-removal option and restores focus on cancel", async () => {
    const forgetDefaultSyncPassword = vi.fn(async () => {})
    Object.defineProperty(window, "eidosLite", {
      configurable: true,
      value: {
        getSyncPasswordSettings: async () => ({
          available: true,
          configured: true,
        }),
        forgetDefaultSyncPassword,
      },
    })
    await act(async () => root.render(createElement(SyncPasswordSettings)))
    expect(host.textContent).not.toContain("Remove default from this device")
    const manage = button("Change for new Spaces")
    await act(async () => manage.click())
    expect(document.activeElement).toBe(
      host.querySelector("input[type=password]")
    )
    expect(host.textContent).toContain(
      "Existing Spaces keep their current passwords."
    )
    expect(host.textContent).not.toContain("Remove default from this device")
    await act(async () => button("Cancel").click())
    expect(host.querySelector("input")).toBeNull()
    expect(document.activeElement).toBe(manage)
    expect(forgetDefaultSyncPassword).not.toHaveBeenCalled()
  })
  it("disables default setup when secure storage is unavailable", async () => {
    Object.defineProperty(window, "eidosLite", {
      configurable: true,
      value: {
        getSyncPasswordSettings: async () => ({
          available: false,
          configured: false,
        }),
      },
    })
    await act(async () => root.render(createElement(SyncPasswordSettings)))
    expect(button("Set up sync password").disabled).toBe(true)
    expect(host.querySelector("input")).toBeNull()
  })
  it("offers a retry when local password status could not be read", async () => {
    const getSyncPasswordSettings = vi
      .fn()
      .mockRejectedValueOnce(new Error("storage busy"))
      .mockResolvedValue({ available: true, configured: true })
    Object.defineProperty(window, "eidosLite", {
      configurable: true,
      value: { getSyncPasswordSettings },
    })
    await act(async () => root.render(createElement(SyncPasswordSettings)))
    expect(host.querySelector('[role="alert"]')?.textContent).toContain(
      "Could not read"
    )
    await act(async () => button("Retry").click())
    expect(button("Change for new Spaces").disabled).toBe(false)
    expect(host.querySelector('[role="alert"]')).toBeNull()
  })
  it("refreshes password status on focus without discarding an open draft", async () => {
    Object.defineProperty(window, "eidosLite", {
      configurable: true,
      value: {
        getSyncPasswordSettings: async () => ({
          available: true,
          configured: true,
        }),
      },
    })
    await act(async () => root.render(createElement(SyncPasswordSettings)))
    await act(async () => button("Change for new Spaces").click())
    const field = host.querySelector<HTMLInputElement>(
      'input[type="password"]'
    )!
    await enter(field, "synthetic unsaved draft")
    await act(async () => window.dispatchEvent(new Event("focus")))
    expect(host.querySelector('input[type="password"]')).toBe(field)
    expect(field.value).toBe("synthetic unsaved draft")
  })

  it("coalesces repeated submissions and rejects a delayed pre-save status", async () => {
    let finishRefresh!: (value: {
      available: boolean
      configured: boolean
    }) => void
    let finishSave!: () => void
    const saveDefaultSyncPassword = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          finishSave = resolve
        })
    )
    Object.defineProperty(window, "eidosLite", {
      configurable: true,
      value: {
        getSyncPasswordSettings: vi
          .fn()
          .mockResolvedValueOnce({ available: true, configured: false })
          .mockImplementation(
            () =>
              new Promise((resolve) => {
                finishRefresh = resolve
              })
          ),
        saveDefaultSyncPassword,
      },
    })
    await act(async () => root.render(createElement(SyncPasswordSettings)))
    await act(async () => button("Set up sync password").click())
    const fields = host.querySelectorAll<HTMLInputElement>(
      'input[type="password"]'
    )
    await enter(fields[0]!, "synthetic password")
    await enter(fields[1]!, "synthetic password")
    await act(async () => {
      const form = host.querySelector("form")!
      form.dispatchEvent(
        new Event("submit", { bubbles: true, cancelable: true })
      )
      form.dispatchEvent(
        new Event("submit", { bubbles: true, cancelable: true })
      )
      window.dispatchEvent(new Event("focus"))
    })
    expect(saveDefaultSyncPassword).toHaveBeenCalledOnce()
    await act(async () => finishSave())
    await act(async () => finishRefresh({ available: true, configured: false }))
    expect(button("Change for new Spaces")).toBeDefined()
    expect(host.textContent).toContain("Sync password saved for new Spaces")
  })
})
