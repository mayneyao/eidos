import { eidosLiteApplicationMenuTemplate } from "./application-menu"

describe("Eidos Lite application menu", () => {
  const handlers = {
    openSettings: vi.fn(),
    openDocumentation: vi.fn(),
    openWebsite: vi.fn(),
  }

  it("puts Settings in the macOS app menu with the standard shortcut", () => {
    const template = eidosLiteApplicationMenuTemplate(
      "darwin",
      "Eidos Lite",
      handlers
    )
    const appMenu = template[0]
    const settings = Array.isArray(appMenu.submenu)
      ? appMenu.submenu.find((item) => item.label === "Settings…")
      : undefined

    expect(appMenu.label).toBe("Eidos Lite")
    expect(settings?.accelerator).toBe("CmdOrCtrl+,")
  })

  it("puts Settings in the File menu on other platforms", () => {
    const template = eidosLiteApplicationMenuTemplate(
      "win32",
      "Eidos Lite",
      handlers
    )
    const fileMenu = template[0]
    const settings = Array.isArray(fileMenu.submenu)
      ? fileMenu.submenu.find((item) => item.label === "Settings…")
      : undefined

    expect(fileMenu.label).toBe("File")
    expect(settings?.accelerator).toBe("CmdOrCtrl+,")
  })
})
