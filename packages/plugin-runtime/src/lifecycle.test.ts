import { describe, expect, it } from "vitest"
import { ActionRegistry, Scope } from "./lifecycle"
describe("registration and scope lifetimes", () => {
  it("cleans every resource once even when another cleanup throws", () => {
    const errors: unknown[] = [],
      calls: number[] = []
    const scope = new Scope((e) => errors.push(e))
    scope.subscriptions.add({
      dispose: () => {
        calls.push(1)
      },
    })
    scope.subscriptions.add({
      dispose: () => {
        calls.push(2)
        throw Error("cleanup")
      },
    })
    scope.dispose()
    scope.dispose()
    expect(calls).toEqual([2, 1])
    expect(errors).toHaveLength(1)
  })
  it("rejects partial, duplicate, undeclared and late registration", () => {
    const scope = new Scope(),
      registry = new ActionRegistry(new Set(["one", "two"]), scope)
    registry.register("one", () => {})
    expect(() => registry.register("one", () => {})).toThrow()
    expect(() => registry.register("other", () => {})).toThrow()
    expect(() => registry.commit()).toThrow()
    expect(() => registry.register("two", () => {})).toThrow()
  })
  it("revokes registration context after teardown", () => {
    const scope = new Scope(),
      registry = new ActionRegistry(new Set(["one"]), scope)
    registry.register("one", () => {})
    registry.commit()
    scope.dispose()
    expect(() => registry.register("one", () => {})).toThrow("lifetime")
  })
})
