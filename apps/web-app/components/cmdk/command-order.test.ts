import {
  getPreferredCommandValue,
  shouldPrioritizeFileExtensionCommands,
} from "./command-order"

describe("shouldPrioritizeFileExtensionCommands", () => {
  it("puts matching extension commands before the web-search fallback", () => {
    expect(
      shouldPrioritizeFileExtensionCommands("Hello from Task Counter", true)
    ).toBe(true)
  })

  it("keeps the normal suggestion first for an empty query", () => {
    expect(shouldPrioritizeFileExtensionCommands("   ", true)).toBe(false)
  })

  it("keeps direct URL navigation ahead of extension commands", () => {
    expect(
      shouldPrioritizeFileExtensionCommands("https://eidos.space", true)
    ).toBe(false)
  })

  it("does not change legacy Space command ordering", () => {
    expect(
      shouldPrioritizeFileExtensionCommands("Hello from Task Counter", false)
    ).toBe(false)
  })
})

describe("getPreferredCommandValue", () => {
  const commands = [
    "Open daily note Journals",
    "Hello from Task Counter Task Counter",
  ]

  it("selects the best matching extension command", () => {
    expect(getPreferredCommandValue("Hello from Task Counter", commands)).toBe(
      commands[1]
    )
  })

  it("does not override the fallback when no extension command matches", () => {
    expect(getPreferredCommandValue("weather tomorrow", commands)).toBe(
      undefined
    )
  })
})
