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

  it("translates LAN sync and device pairing copy", () => {
    expect(translateEidosLite("en", "LAN sync")).toBe("LAN sync")
    expect(translateEidosLite("zh", "LAN sync")).toBe("局域网同步")
    expect(translateEidosLite("zh", "Cloud sync")).toBe("云同步")
    expect(translateEidosLite("zh", "Devices")).toBe("设备")
    expect(
      translateEidosLite("zh", "Share this Space with paired devices")
    ).toBe("向已配对设备开放此 Space")
    expect(
      translateEidosLite(
        "zh",
        "Turn on the LAN service in Settings → Devices first."
      )
    ).toBe("请先在设置 → 设备中开启局域网服务")
    expect(
      translateEidosLite(
        "zh",
        "Allow “{name}” to connect? It can read and write the Spaces you share.",
        { name: "Pixel 6a" }
      )
    ).toBe("允许「Pixel 6a」连接？它将能读写已开放的 Spaces。")
    expect(
      translateEidosLite("zh", "Last contact · {time}", { time: "10:00" })
    ).toBe("最近通信 · 10:00")
    expect(
      translateEidosLite("zh", "Allow “{name}” to connect to this computer?", {
        name: "Pixel 6a",
      })
    ).toBe("允许“Pixel 6a”连接这台电脑？")
  })
})
