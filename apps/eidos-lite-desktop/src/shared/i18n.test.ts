import { resolveEidosLiteLocale, translateEidosLite } from "./i18n"

describe("Eidos Lite internationalization", () => {
  it("resolves supported system languages and falls back to English", () => {
    expect(resolveEidosLiteLocale("system", "zh-CN")).toBe("zh")
    expect(resolveEidosLiteLocale("system", "en-US")).toBe("en")
    expect(resolveEidosLiteLocale("system", "fr-FR")).toBe("en")
    expect(resolveEidosLiteLocale("en", "zh-CN")).toBe("en")
  })

  it("translates Chinese copy and interpolates values", () => {
    expect(translateEidosLite("zh", "Settings")).toBe("设置")
    expect(
      translateEidosLite("zh", "Update {version} is available.", {
        version: "0.2.0",
      })
    ).toBe("可以更新到 0.2.0。")
    expect(translateEidosLite("en", "Settings")).toBe("Settings")
    expect(translateEidosLite("zh", "Recent files")).toBe("最近打开")
  })
})
