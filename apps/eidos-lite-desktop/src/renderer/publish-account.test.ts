import { afterEach, beforeEach, describe, expect, it } from "vitest"

import type { EidosPublishAccountStatus } from "../shared/contracts"
import {
  PUBLISH_ACCOUNT_STALE_MS,
  clearPublishAccountSnapshot,
  isPublishAccountStatus,
  publishAccountIsStale,
  readPublishAccountSnapshot,
  writePublishAccountSnapshot,
} from "./publish-account"

const free: EidosPublishAccountStatus = {
  state: "active",
  plan: "free",
  privatePublications: false,
  removeBranding: false,
  maxStorageBytes: "104857600",
  usedStorageBytes: "0",
  activeSlugs: [],
  accountUrl: "https://eidos.space/account?tab=publish",
  pricingUrl: "https://eidos.space/pricing#publish",
}

function fakeStorage(): Storage {
  const values = new Map<string, string>()
  return {
    get length() {
      return values.size
    },
    clear: () => values.clear(),
    getItem: (key) => values.get(key) ?? null,
    key: (index) => [...values.keys()][index] ?? null,
    removeItem: (key) => {
      values.delete(key)
    },
    setItem: (key, value) => {
      values.set(key, value)
    },
  } as Storage
}

beforeEach(() => {
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: { localStorage: fakeStorage() },
  })
})

afterEach(() => {
  Reflect.deleteProperty(globalThis, "window")
})

describe("Publish account cache", () => {
  it("accepts a well-formed status and rejects malformed plans", () => {
    expect(isPublishAccountStatus(free)).toBe(true)
    expect(isPublishAccountStatus({ ...free, plan: "team" })).toBe(false)
    expect(isPublishAccountStatus({ ...free, maxStorageBytes: 100 })).toBe(
      false
    )
    expect(isPublishAccountStatus({ ...free, activeSlugs: ["a", 2] })).toBe(
      false
    )
    expect(isPublishAccountStatus(null)).toBe(false)
  })

  it("caches the last status until the stale window elapses", () => {
    expect(readPublishAccountSnapshot()).toBeNull()
    writePublishAccountSnapshot(free, 1_000)
    const snapshot = readPublishAccountSnapshot()
    expect(snapshot?.status).toEqual(free)
    expect(snapshot?.checkedAtMs).toBe(1_000)
    expect(publishAccountIsStale(snapshot!, 1_000)).toBe(false)
    expect(
      publishAccountIsStale(snapshot!, 1_000 + PUBLISH_ACCOUNT_STALE_MS)
    ).toBe(true)

    clearPublishAccountSnapshot()
    expect(readPublishAccountSnapshot()).toBeNull()
  })

  it("ignores corrupt cache entries", () => {
    window.localStorage.setItem(
      "eidos-lite:publish-account:v1",
      JSON.stringify({ version: 1, checkedAtMs: 1, status: { plan: "free" } })
    )
    expect(readPublishAccountSnapshot()).toBeNull()
  })
})
