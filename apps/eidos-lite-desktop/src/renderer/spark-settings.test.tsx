// @vitest-environment jsdom
import { act } from "react"
import { createRoot } from "react-dom/client"
import { afterEach, expect, it, vi } from "vitest"
import { SparkSettings } from "./spark-settings"
import type { SparkStatus } from "../shared/spark"

vi.mock("./i18n", () => ({
  useEidosLiteI18n: (() => {
    const value = {
      t: (message: string, values?: Record<string, string | number>) =>
        message.replace(/\{(\w+)\}/g, (_, key: string) =>
          String(values?.[key] ?? key)
        ),
    }
    return () => value
  })(),
}))
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
const license = {
  id: 3,
  status: "active",
  activation_count: 1,
  max_activations: 3,
}
const active: SparkStatus = {
  state: "active",
  source: "online",
  features: ["file-metadata"],
  licenseId: 3,
  perpetualOffline: true,
  licenses: [license],
}
const host = document.createElement("div")
document.body.append(host)
let root = createRoot(host)
afterEach(async () => {
  await act(async () => root.unmount())
  root = createRoot(host)
  vi.restoreAllMocks()
})
const button = (label: string) =>
  Array.from(host.querySelectorAll("button")).find(
    (el) => el.textContent === label
  )!

it("confirms release and allows explicit refresh followed by manual reactivation", async () => {
  const released: SparkStatus = {
    state: "inactive",
    source: "online",
    features: [],
    licenses: [{ ...license, activation_count: 0 }],
  }
  const getSparkStatus = vi
    .fn()
    .mockResolvedValueOnce(active)
    .mockResolvedValue(released)
  const deactivateSpark = vi
    .fn()
    .mockResolvedValue({ ...released, licenses: [] })
  const activateSpark = vi.fn().mockResolvedValue(active)
  Object.assign(window, {
    eidosLite: { getSparkStatus, deactivateSpark, activateSpark },
  })
  await act(async () =>
    root.render(<SparkSettings signedIn subject="recipient" />)
  )
  expect(host.textContent).toContain("1 of 3 devices activated")
  await act(async () => button("Release this Spark device").click())
  expect(deactivateSpark).not.toHaveBeenCalled()
  expect(host.textContent).toContain(
    "Your files and account license will remain"
  )
  await act(async () => button("Cancel").click())
  expect(button("Confirm release")).toBeUndefined()
  await act(async () => button("Release this Spark device").click())
  await act(async () => button("Confirm release").click())
  expect(deactivateSpark).toHaveBeenCalledOnce()
  expect(getSparkStatus).toHaveBeenCalledTimes(1)
  await act(async () => button("Refresh").click())
  expect(button("Activate on this device")).toBeDefined()
  expect(activateSpark).not.toHaveBeenCalled()
  await act(async () => button("Activate on this device").click())
  expect(activateSpark).toHaveBeenCalledWith(3)
  expect(host.textContent).toContain("Spark is active on this device")
})

it("explains a device limit returned as status rather than a rejected request", async () => {
  const getSparkStatus = vi.fn().mockResolvedValue({
    state: "unavailable",
    source: "none",
    features: [],
    licenses: [],
    error: "spark_device_limit_reached",
  } satisfies SparkStatus)
  Object.assign(window, { eidosLite: { getSparkStatus } })
  await act(async () =>
    root.render(<SparkSettings signedIn subject="recipient" />)
  )
  expect(host.textContent).toContain(
    "Release an old device on your Spark account page"
  )
  expect(button("Redeem code / manage devices")).toBeDefined()
})

it("keeps other licenses out of the active device overview", async () => {
  Object.assign(window, {
    eidosLite: {
      getSparkStatus: vi.fn().mockResolvedValue({
        ...active,
        licenses: [license, { ...license, id: 5 }, { ...license, id: 6 }],
      }),
    },
  })
  await act(async () => root.render(<SparkSettings signedIn />))
  expect(host.textContent).toContain("Spark is active on this device")
  expect(host.textContent).not.toContain("Spark license")
  expect(host.querySelector("details")).toBeNull()
  expect(button("Activate on this device")).toBeUndefined()
  expect(host.textContent).not.toContain("Buy a Spark code")
})

it("keeps cached offline access visible while signed out", async () => {
  Object.assign(window, {
    eidosLite: {
      getSparkStatus: vi.fn().mockResolvedValue({
        ...active,
        source: "offline",
        licenses: [],
      }),
    },
  })
  await act(async () => root.render(<SparkSettings signedIn={false} />))
  expect(host.textContent).toContain("Spark is active on this device")
  expect(host.textContent).toContain("Activated for offline use")
  expect(button("Release this Spark device")).toBeUndefined()
  expect(button("Activate on this device")).toBeUndefined()
})

it("offers a collapsed, meaningful choice only when activation needs one", async () => {
  const activateSpark = vi.fn().mockResolvedValue(active)
  Object.assign(window, {
    eidosLite: {
      activateSpark,
      getSparkStatus: vi.fn().mockResolvedValue({
        state: "inactive",
        source: "online",
        features: [],
        licenses: [
          {
            ...license,
            id: 5,
            acquisition_source: "legacy_gift",
            acquired_at: "2026-10-19T12:00:00Z",
            activation_count: 3,
          },
          {
            ...license,
            acquisition_source: "code",
            acquired_at: "2026-10-20T12:00:00Z",
          },
        ],
      }),
    },
  })
  await act(async () => root.render(<SparkSettings signedIn />))
  const choice = host.querySelector("details")!
  expect(choice.open).toBe(false)
  expect(host.textContent).toContain("Legacy Spark gift")
  expect(host.textContent).toContain("Redeemed Spark code")
  expect(host.textContent).toContain("Issued on")
  expect(host.textContent).not.toMatch(/#\d/)
  const actions = Array.from(choice.querySelectorAll("button"))
  expect(actions[0].disabled).toBe(true)
  await act(async () => actions[1].click())
  expect(activateSpark).toHaveBeenCalledWith(3)
  expect(host.querySelector("details")).toBeNull()
})
