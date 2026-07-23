// @vitest-environment jsdom

import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { I18nProvider } from "../i18n"
import { EidosFileLanguageSelect } from "./eidos-file-language-select"

;(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true

describe("EidosFileLanguageSelect", () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    window.localStorage.setItem("eidos-file-locale", "en")
    container = document.createElement("div")
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
    window.localStorage.clear()
  })

  it("lists configured languages and updates the shared locale", () => {
    act(() => {
      root.render(
        <I18nProvider>
          <EidosFileLanguageSelect />
        </I18nProvider>
      )
    })

    const select = container.querySelector("select")
    expect(select?.ariaLabel).toBe("Language")
    expect(
      Array.from(select?.options ?? []).map((option) => [
        option.value,
        option.text,
      ])
    ).toEqual([
      ["en", "English"],
      ["zh", "简体中文"],
    ])

    act(() => {
      if (!select) return
      select.value = "zh"
      select.dispatchEvent(new Event("change", { bubbles: true }))
    })

    expect(select?.value).toBe("zh")
    expect(select?.ariaLabel).toBe("语言")
    expect(
      container.querySelector(".language-select > span")?.textContent
    ).toBe("中")
    expect(document.documentElement.lang).toBe("zh-CN")
  })
})
