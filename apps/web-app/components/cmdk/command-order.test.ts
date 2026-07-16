import {
  getPreferredContributionValue,
  shouldPrioritizeFileExtensionContributions,
} from "./command-order"

describe("shouldPrioritizeFileExtensionContributions", () => {
  it("puts matching extension contributions before the web-search fallback", () => {
    expect(
      shouldPrioritizeFileExtensionContributions(
        "Hello from Task Counter",
        true
      )
    ).toBe(true)
  })

  it("keeps the normal suggestion first for an empty query", () => {
    expect(shouldPrioritizeFileExtensionContributions("   ", true)).toBe(false)
  })

  it("keeps direct URL navigation ahead of extension commands", () => {
    expect(
      shouldPrioritizeFileExtensionContributions("https://eidos.space", true)
    ).toBe(false)
  })

  it("does not change legacy Space command ordering", () => {
    expect(
      shouldPrioritizeFileExtensionContributions(
        "Hello from Task Counter",
        false
      )
    ).toBe(false)
  })
})

describe("getPreferredContributionValue", () => {
  const contributions = [
    "Open daily note Journals",
    "Hello from Task Counter Task Counter",
    "Task Summary Panel Task Counter",
  ]

  it("selects the best matching extension contribution", () => {
    expect(
      getPreferredContributionValue("Hello from Task Counter", contributions)
    ).toBe(contributions[1])
  })

  it("selects a matching panel", () => {
    expect(getPreferredContributionValue("Task Summary", contributions)).toBe(
      contributions[2]
    )
  })

  it("does not override the fallback when no extension command matches", () => {
    expect(
      getPreferredContributionValue("weather tomorrow", contributions)
    ).toBe(undefined)
  })
})
