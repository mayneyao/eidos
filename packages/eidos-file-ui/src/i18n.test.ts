import { describe, expect, it } from "vitest"

import { translateEidosFileUI } from "./i18n"

describe("translateEidosFileUI", () => {
  it("keeps English as the source-language default", () => {
    expect(translateEidosFileUI("en", "Add field")).toBe("Add field")
  })

  it("translates Chinese UI copy and interpolates values", () => {
    expect(
      translateEidosFileUI("zh", "Delete {count} records?", { count: 3 })
    ).toBe("删除 3 条记录？")
    expect(
      translateEidosFileUI("zh", "Delete field “{name}”?", {
        name: "负责人",
      })
    ).toBe("删除字段“负责人”？")
    expect(translateEidosFileUI("zh", "Formula")).toBe("公式")
    expect(translateEidosFileUI("zh", "Unavailable record")).toBe("记录不可用")
  })

  it("allows host message overrides without changing file content", () => {
    expect(
      translateEidosFileUI(
        "zh",
        "Open {title}",
        { title: "路线图" },
        { "Open {title}": "查看：{title}" }
      )
    ).toBe("查看：路线图")
  })
})
