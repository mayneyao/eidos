import { describe, expect, it, vi } from "vitest"

import {
  pluginInstallIdFromUrl,
  pluginInstallIdsFromArguments,
  registerWindowsPluginInstallProtocol,
} from "./plugin-install-link"

describe("Eidos Lite plugin install links", () => {
  it("registers the installed Windows app as the browser link handler", () => {
    const app = {
      isPackaged: true,
      setAsDefaultProtocolClient: vi.fn(() => true),
    }
    expect(registerWindowsPluginInstallProtocol(app, "win32")).toBe(true)
    expect(app.setAsDefaultProtocolClient).toHaveBeenCalledExactlyOnceWith(
      "eidos-lite"
    )
    app.setAsDefaultProtocolClient.mockReturnValue(false)
    expect(registerWindowsPluginInstallProtocol(app, "win32")).toBe(false)
  })

  it("leaves protocol ownership to packaging on other platforms and skips development", () => {
    const app = {
      isPackaged: true,
      setAsDefaultProtocolClient: vi.fn(() => true),
    }
    expect(registerWindowsPluginInstallProtocol(app, "darwin")).toBeNull()
    expect(registerWindowsPluginInstallProtocol(app, "linux")).toBeNull()
    app.isPackaged = false
    expect(registerWindowsPluginInstallProtocol(app, "win32")).toBeNull()
    expect(app.setAsDefaultProtocolClient).not.toHaveBeenCalled()
  })

  it("accepts only a plugin ID in the install route", () => {
    expect(
      pluginInstallIdFromUrl("eidos-lite://plugins/install/eidos.smart-actions")
    ).toBe("eidos.smart-actions")
    for (const value of [
      "https://plugins/install/eidos.map",
      "eidos-lite://other/install/eidos.map",
      "eidos-lite://plugins/remove/eidos.map",
      "eidos-lite://plugins/install/eidos.map/extra",
      "eidos-lite://plugins/install/%2Fetc%2Fpasswd",
      "eidos-lite://plugins/install/eidos.map?source=other",
      "eidos-lite://plugins/install/eidos.map#fragment",
      "eidos-lite://user@plugins/install/eidos.map",
      "eidos-lite://plugins/install/UPPERCASE",
    ]) {
      expect(pluginInstallIdFromUrl(value)).toBeNull()
    }
  })

  it("collects valid launch intents without duplicates", () => {
    expect(
      pluginInstallIdsFromArguments([
        "/Applications/Eidos Lite.app",
        "eidos-lite://plugins/install/eidos.map",
        "eidos-lite://plugins/install/eidos.chart",
        "eidos-lite://plugins/install/eidos.map",
      ])
    ).toEqual(["eidos.map", "eidos.chart"])
  })

  it.each([
    [
      "C:\\Users\\Mayne\\AppData\\Local\\Programs\\Eidos Lite\\Eidos Lite.exe",
      "eidos-lite://plugins/install/eidos.map",
    ],
    [
      "C:\\Users\\Mayne\\AppData\\Local\\Programs\\Eidos Lite\\Eidos Lite.exe",
      "--original-process-start-time=123456",
      "eidos-lite://plugins/install/eidos.map",
    ],
  ])("routes Windows launch arguments %j", (...arguments_) => {
    expect(pluginInstallIdsFromArguments(arguments_)).toEqual(["eidos.map"])
  })
})
