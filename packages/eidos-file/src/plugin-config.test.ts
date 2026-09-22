import { describe, expect, it } from "vitest"
import {
  mergeEidosFilePluginConfig as merge,
  readEidosFilePluginConfig as read,
} from "./plugin-config"

describe("table plugin config", () => {
  it("preserves table settings and other plugins, and detaches returned values", () => {
    const settings = {
      icon: "book",
      plugins: { "other.plugin": { enabled: true } },
    }
    const initial = read(settings, "eidos.smart-actions")
    expect(initial.value).toBeNull()
    const next = merge(
      settings,
      "eidos.smart-actions",
      { actions: [{ title: "Classify" }] },
      initial.version
    )
    expect(next).toEqual({
      ...settings,
      plugins: {
        ...settings.plugins,
        "eidos.smart-actions": { actions: [{ title: "Classify" }] },
      },
    })
    const saved = read(next, "eidos.smart-actions")
    saved.value!.actions = []
    expect(read(next, "eidos.smart-actions").value).toEqual({
      actions: [{ title: "Classify" }],
    })
    expect(merge(next, "eidos.smart-actions", null, saved.version)).toEqual(
      settings
    )
  })
  it("rejects stale updates but ignores key order and unrelated settings", () => {
    const settings = { plugins: { "eidos.smart-actions": { a: 1, b: 2 } } }
    const version = read(settings, "eidos.smart-actions").version
    expect(
      read(
        { plugins: { "eidos.smart-actions": { b: 2, a: 1 } } },
        "eidos.smart-actions"
      ).version
    ).toBe(version)
    const next = merge(settings, "eidos.smart-actions", { a: 3 }, version)
    expect(() => merge(next, "eidos.smart-actions", {}, version)).toThrow(
      "changed"
    )
    expect(
      merge({ ...settings, icon: "new" }, "eidos.smart-actions", {}, version)
        .icon
    ).toBe("new")
  })
  it("rejects invalid and oversized values without erasing malformed settings", () => {
    expect(() =>
      merge({}, "eidos.smart-actions", { prompt: "字".repeat(22000) }, "null")
    ).toThrow("64 KiB")
    expect(() =>
      merge({}, "eidos.smart-actions", { n: Infinity }, "null")
    ).toThrow()
    expect(() => read({ plugins: [] }, "eidos.smart-actions")).toThrow()
    expect(() => read({}, "__proto__")).toThrow()
  })
})
