import { act, useSyncExternalStore } from "react"
import { createRoot } from "react-dom/client"
import { afterEach, describe, expect, it } from "vitest"
import { EidosFileUIProvider, useEidosFileUI } from "./context"
import {
  getMobileLocale,
  mobileText,
  resolveMobileLocale,
  setMobileLocale,
  subscribeMobileLocale,
} from "../../mobile-plugin-host/src/locale"
import english from "../../mobile-plugin-host/locales/en.json"
import { MobileNewRecordButton } from "./mobile-toolbar"

afterEach(() => {
  setMobileLocale("en")
})

describe("mobile language", () => {
  it("resolves Chinese variants and falls back to English", () => {
    for (const language of ["zh", "zh-CN", "zh-Hant-TW", "ZH_hk"])
      expect(resolveMobileLocale(language)).toBe("zh")
    for (const language of ["en-US", "ja-JP", "", "unknown"])
      expect(resolveMobileLocale(language)).toBe("en")
  })
  it("switches shared UI and shell text without replacing the draft input", async () => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
    function Content() {
      const { translate } = useEidosFileUI()
      return (
        <>
          <button>{translate("Save")}</button>
          <span>{mobileText("语言")}</span>
          <input aria-label="draft" defaultValue="unsaved" />
          <MobileNewRecordButton />
        </>
      )
    }
    function Editor() {
      const locale = useSyncExternalStore(
        subscribeMobileLocale,
        getMobileLocale
      )
      return (
        <EidosFileUIProvider locale={locale}>
          <Content />
        </EidosFileUIProvider>
      )
    }
    setMobileLocale("zh")
    const host = document.createElement("div")
    document.body.append(host)
    const root = createRoot(host)
    try {
      await act(async () => root.render(<Editor />))
      const draft = host.querySelector("input")!
      draft.value = "my draft"
      expect(host.querySelector("button")!.textContent).toBe("保存")
      expect(host.querySelector('button[aria-label="新建记录"]')).not.toBeNull()
      await act(async () => setMobileLocale("en"))
      expect(host.querySelector("button")!.textContent).toBe("Save")
      expect(host.querySelector("span")!.textContent).toBe("Language")
      expect(
        host.querySelector('button[aria-label="New record"]')
      ).not.toBeNull()
      expect(host.querySelector("input")).toBe(draft)
      expect(draft.value).toBe("my draft")
      expect(document.documentElement.lang).toBe("en")
      await act(async () => setMobileLocale("zh-Hant"))
      expect(host.querySelector("span")!.textContent).toBe("语言")
      expect(host.querySelector("input")).toBe(draft)
    } finally {
      await act(async () => root.unmount())
      host.remove()
    }
  })
  it("preserves every template placeholder in the English catalog", () => {
    const placeholders = (value: string) =>
      value.match(/\{\d+\}/g)?.sort() ?? []
    for (const [source, translated] of Object.entries(english)) {
      expect(translated.trim(), source).not.toBe("")
      expect(placeholders(translated), source).toEqual(placeholders(source))
    }
  })
})
