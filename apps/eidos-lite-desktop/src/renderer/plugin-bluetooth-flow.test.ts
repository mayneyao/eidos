// @vitest-environment jsdom
import { expect, it, vi } from "vitest"
import mount from "../../../../packages/plugin-sandbox/examples/lite-bluetooth/page"
import type { Mount } from "@eidos.space/plugin-sdk"

it("shows connection progress, application failures, retry, and ignores a late reply after cancellation", async () => {
  const root = document.createElement("div")
  document.body.append(root)
  let reply!: (value: unknown) => void
  let event!: (value: unknown) => void
  const request = vi.fn(
    () =>
      new Promise((resolve) => {
        reply = resolve
      })
  )
  const stop = vi.fn(async () => {})
  const dispose = vi.fn()
  const background = {
    requestDevice: async () => ({ id: "real-device", name: "Sensor" }),
    request,
    stop,
    onMessage: async (listener: typeof event) => {
      event = listener
      return { dispose }
    },
  }
  const ctx = {
    capabilities: { background },
    subscriptions: { add: vi.fn() },
  } as unknown as Parameters<Mount>[0]
  await mount(ctx, root)
  const click = (name: string) =>
    root.querySelector<HTMLButtonElement>("[data-" + name + "]")!.click()
  const status = () => root.querySelector("[data-status]")!.textContent
  click("choose")
  await vi.waitFor(() => expect(request).toHaveBeenCalledTimes(1))
  expect(status()).toBe("正在连接设备")
  event({ phase: "services", id: "real-device", name: "Sensor" })
  expect(status()).toBe("正在检查电量服务")
  reply({
    ok: false,
    phase: "failed",
    id: "real-device",
    name: "Sensor",
    failedAt: "services",
    error: "Service not found",
  })
  await vi.waitFor(() => expect(status()).toBe("连接未完成"))
  expect(root.textContent).toContain("无法使用设备的标准电量服务")
  expect(root.querySelector<HTMLElement>("[data-retry]")!.hidden).toBe(false)
  click("retry")
  await vi.waitFor(() => expect(request).toHaveBeenCalledTimes(2))
  click("stop")
  await vi.waitFor(() => expect(status()).toBe("已断开并停止后台"))
  reply({ ok: true, phase: "connected", id: "real-device", percent: 80 })
  await new Promise((resolve) => setTimeout(resolve, 0))
  expect(status()).toBe("已断开并停止后台")
  expect(stop).toHaveBeenCalledOnce()
  root.remove()
})

it("keeps confirmed success visible, clears stale battery on disconnect, and preserves status when selection is cancelled", async () => {
  const root = document.createElement("div")
  let event!: (value: unknown) => void
  const background = {
    requestDevice: vi
      .fn()
      .mockResolvedValueOnce({ id: "device", name: "Sensor" })
      .mockRejectedValueOnce(new Error("Bluetooth selection cancelled")),
    request: vi.fn().mockResolvedValue({
      ok: true,
      phase: "connected",
      id: "device",
      name: "Sensor",
      percent: 72,
    }),
    onMessage: async (listener: typeof event) => {
      event = listener
      return { dispose() {} }
    },
    stop: async () => {},
  }
  await mount(
    {
      capabilities: { background },
      subscriptions: { add() {} },
    } as unknown as Parameters<Mount>[0],
    root
  )
  root.querySelector<HTMLButtonElement>("[data-choose]")!.click()
  await vi.waitFor(() =>
    expect(root.querySelector("[data-status]")!.textContent).toBe("已连接")
  )
  expect(root.querySelector("[data-value]")!.textContent).toBe("72%")
  root.querySelector<HTMLButtonElement>("[data-choose]")!.click()
  await vi.waitFor(() =>
    expect(root.querySelector("[data-status]")!.textContent).toBe("已连接")
  )
  event({ phase: "disconnected", id: "device", name: "Sensor", percent: null })
  expect(root.querySelector("[data-status]")!.textContent).toBe("连接已断开")
  expect(root.querySelector<HTMLElement>("[data-value]")!.hidden).toBe(true)
})
