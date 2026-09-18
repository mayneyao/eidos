import { describe, expect, it } from "vitest"
import { parseManifest } from "./manifest"

const parse = (configuration: unknown, context = "table") =>
  parseManifest({
    apiVersion: 1,
    id: "test.map",
    name: "Map",
    version: "1.0.0",
    views: [
      { id: "map", title: "Map", entry: "./map.ts", context, configuration },
    ],
  })
const schema = (property: unknown) => ({
  type: "object",
  properties: { latitude: property },
})
describe("table view configuration schema", () => {
  it("accepts scalar defaults and dynamic field selectors", () => {
    expect(
      parse(
        schema({
          type: "string",
          title: "Latitude",
          default: "",
          "x-field": true,
        })
      ).views?.[0].configuration
    ).toBeDefined()
    parse(
      schema({
        type: "number",
        title: "Zoom",
        default: 5,
        minimum: 0,
        maximum: 20,
      })
    )
  })
  it("rejects unsupported schemas and invalid defaults at installation", () => {
    for (const property of [
      { type: "string", title: "Map", default: "bad", enum: ["online"] },
      { type: "number", title: "Zoom", default: 40, maximum: 20 },
      {
        type: "string",
        title: "Field",
        default: "other-table-id",
        "x-field": true,
      },
      { type: "string", title: "Field", default: "", "x-field": false },
      { type: "object", title: "Nested", default: {} },
    ])
      expect(() => parse(schema(property))).toThrow()
    expect(() =>
      parse(schema({ type: "boolean", title: "Show", default: true }), "page")
    ).toThrow()
    expect(() =>
      parse({ type: "object", properties: {}, required: [] })
    ).toThrow()
  })
})
