import { runInNewContext } from "node:vm"
import { expect, it } from "vitest"
import { browserModule } from "./browser-module"

it("preserves named and default exports without a Node runtime", () => {
  const module = { exports: {} as { default(): number; value: number } }
  runInNewContext(
    browserModule("export const value = 42; export default () => value"),
    { module, exports: module.exports }
  )
  expect(module.exports.default()).toBe(42)
  expect(module.exports.value).toBe(42)
})
