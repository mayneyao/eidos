import { expect, it } from "vitest"
import {
  parseBluetoothDevices,
  scanBluetoothDevices,
} from "./bluetooth-discovery.js"
it("validates and bounds native scan results, keyed by exact device ID", async () => {
  expect(
    parseBluetoothDevices(
      '{"id":"one","name":null,"services":[]}\n{"id":"one","name":"Battery","services":[]}\n'
    )
  ).toEqual([{ id: "one", name: "Battery", services: [] }])
  expect(parseBluetoothDevices("")).toEqual([])
  expect(
    parseBluetoothDevices(
      Array.from({ length: 100 }, (_, i) =>
        JSON.stringify({ id: String(i), services: [] })
      ).join("\n")
    )
  ).toHaveLength(64)
  for (const invalid of [
    "invalid-json",
    "null",
    '{"id":"one"}',
    '{"id":"one","services":[1]}',
    JSON.stringify({ id: "a\nb", services: [] }),
    "x".repeat(300000),
  ])
    expect(() => parseBluetoothDevices(invalid)).toThrow()
  await expect(scanBluetoothDevices("relative-path")).rejects.toThrow(
    "absolute"
  )
})
