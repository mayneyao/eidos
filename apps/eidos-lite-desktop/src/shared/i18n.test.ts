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
    expect(translateEidosLite("zh", "Built-in Plugins")).toBe("内置插件")
    expect(translateEidosLite("zh", "Retry")).toBe("重试")
    expect(
      translateEidosLite("zh", "Could not load change details. {message}", {
        message: "读取失败",
      })
    ).toBe("无法加载变更详情。读取失败")
    expect(translateEidosLite("zh", "Terminal layout")).toBe("终端布局")
    expect(translateEidosLite("zh", "Bottom")).toBe("底部")
    expect(translateEidosLite("zh", "Beside file content")).toBe("文件内容左侧")
    expect(translateEidosLite("zh", "Move terminal beside file content")).toBe(
      "将终端移到文件内容左侧"
    )
    expect(translateEidosLite("zh", "Move terminal below file content")).toBe(
      "将终端移到文件内容下方"
    )
    expect(
      translateEidosLite(
        "zh",
        "Choose how Terminal and file content share the middle work area."
      )
    ).toBe("选择终端与文件内容如何共享中间工作区。")
    expect(
      translateEidosLite(
        "zh",
        "Built-in plugin for opening a shell in the current Space. It stays out of the workbench and loads only after you enable it."
      )
    ).toContain("内置插件")
  })
})
