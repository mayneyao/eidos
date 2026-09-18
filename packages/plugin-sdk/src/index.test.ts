import { expect, it } from "vitest"
import * as sdk from "./index"
it("publishes only types; guest capabilities are supplied by the host", () => {
  expect(Object.keys(sdk)).toEqual([])
})
