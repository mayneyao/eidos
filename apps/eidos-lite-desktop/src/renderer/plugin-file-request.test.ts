import { expect, it, vi } from "vitest"
import type { EidosFileDataSource } from "@eidos.space/eidos-file"
import type { PluginRequest } from "@eidos.space/plugin-runtime/rpc"
import { fileViewRequest } from "./plugin-file-request"

it("limits file editor access to existing tables and the mounted plugin namespace", async () => {
  const write = vi.fn(async () => ({ version: "next" }))
  const source = {
    getSnapshot: async () => ({
      tables: [
        {
          table: { id: "a", name: "Requests", settings: { secret: true } },
          fields: [],
        },
      ],
    }),
    writeTablePluginConfig: write,
    readTablePluginConfig: vi.fn(),
  } as unknown as EidosFileDataSource
  const call = (
    method: PluginRequest["method"],
    params: unknown,
    disabled = false
  ) =>
    fileViewRequest(
      source,
      "example.smart",
      { protocol: "eidos-plugin", apiVersion: 1, id: "1", method, params },
      disabled
    )
  expect(await call("eidos.tables", null)).toEqual([
    { id: "a", name: "Requests" },
  ])
  expect(await call("eidos.table", { tableId: "a" })).toEqual({ fields: [] })
  await expect(call("eidos.table", { tableId: "other-file" })).rejects.toThrow(
    "unavailable"
  )
  await expect(
    call("eidos.pluginConfig.read", { tableId: "a", pluginId: "other" })
  ).rejects.toThrow()
  const input = { tableId: "a", value: { actions: [] }, expectedVersion: "old" }
  await expect(call("eidos.pluginConfig.write", input, true)).rejects.toThrow(
    "read-only"
  )
  expect(write).not.toHaveBeenCalled()
  await call("eidos.pluginConfig.write", input)
  expect(write).toHaveBeenCalledWith("a", "example.smart", {
    value: { actions: [] },
    expectedVersion: "old",
  })
  await expect(
    call("eidos.pluginConfig.write", { ...input, sessionId: "other" })
  ).rejects.toThrow()
})
