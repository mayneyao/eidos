import { welcomeWindowActionAfterSpaceClosed } from "./window-lifecycle"

describe("Eidos Lite window lifecycle", () => {
  it("recreates Welcome after the last Space window closes", () => {
    expect(welcomeWindowActionAfterSpaceClosed(false, [])).toBe("create")
  })

  it("focuses an existing Welcome window instead of duplicating it", () => {
    expect(welcomeWindowActionAfterSpaceClosed(false, ["welcome"])).toBe(
      "focus"
    )
  })

  it("does not open Welcome during shutdown or over another Space", () => {
    expect(welcomeWindowActionAfterSpaceClosed(true, [])).toBe("none")
    expect(welcomeWindowActionAfterSpaceClosed(false, ["space"])).toBe("none")
  })

  it("still opens Welcome when Settings is the only remaining window", () => {
    expect(welcomeWindowActionAfterSpaceClosed(false, ["settings"])).toBe(
      "create"
    )
  })
})
