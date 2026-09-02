import { parseReferenceDefinitionSource } from "./reference-definition"

describe("reference definitions", () => {
  it("parses destinations, identifiers, and titles", () => {
    expect(
      parseReferenceDefinitionSource(
        "[Eidos Site]: <https://eidos.space/docs> 'Documentation'"
      )
    ).toEqual({
      destination: "https://eidos.space/docs",
      identifier: "eidos site",
      label: "Eidos Site",
      title: "Documentation",
    })
  })

  it("rejects non-definition source", () => {
    expect(parseReferenceDefinitionSource("ordinary text")).toBeNull()
  })
})
