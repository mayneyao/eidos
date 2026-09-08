// @vitest-environment jsdom
import { act } from "react"
import { createRoot } from "react-dom/client"
import { afterEach, expect, it, vi } from "vitest"
import { marked } from "marked"
import type { ComponentProps } from "react"
import type { MarkdownEditorSurface } from "./markdown-editor-surface"
import { EidosLiteI18nProvider } from "./i18n"
import type { EidosLitePreferences } from "../shared/contracts"

// Release copy changes independently of the viewer behavior tested here.
vi.mock("../../RELEASE_NOTES.md?raw", () => ({
  default: "## English release fixture\n\nEnglish fixture body.",
}))
vi.mock("../../RELEASE_NOTES.zh-CN.md?raw", () => ({
  default: "## 中文日志测试标题\n\n中文测试正文。",
}))

vi.mock("./markdown-editor-surface", () => ({
  MarkdownEditorSurface: (
    props: ComponentProps<typeof MarkdownEditorSurface>
  ) => {
    expect(props.disabled).toBe(true)
    expect(props.editingMode).toBe("wysiwyg")
    expect(props.autoFocus).toBe(false)
    expect(props.layout).toBe("document")
    return (
      <div
        data-document-key={props.documentKey}
        dangerouslySetInnerHTML={{ __html: marked.parse(props.content) }}
      />
    )
  },
}))
import {
  hasUnseenRelease,
  releaseVersion,
  useWhatsNew,
  WhatsNewPage,
} from "./whats-new"

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
const key = "eidos-lite:whats-new:acknowledged"
afterEach(() => {
  localStorage.clear()
  vi.unstubAllGlobals()
})

it("does not prompt on first install or the acknowledged version", () => {
  expect(hasUnseenRelease(null, "0.10.1")).toBe(false)
  expect(hasUnseenRelease("0.10.1", "0.10.1")).toBe(false)
  expect(hasUnseenRelease("0.10.0", "0.10.1")).toBe(true)
})

it("switches bundled notes with the current interface language", async () => {
  let changePreferences: (preferences: EidosLitePreferences) => void = () => {}
  const preferences = { language: "en" } as EidosLitePreferences
  Object.defineProperty(window, "eidosLite", {
    configurable: true,
    value: {
      getPreferences: async () => preferences,
      onPreferencesChanged: (listener: typeof changePreferences) => {
        changePreferences = listener
        return () => {}
      },
    },
  })
  vi.stubGlobal("navigator", { languages: ["zh-CN"], language: "zh-CN" })
  const host = document.createElement("div")
  const root = createRoot(host)
  try {
    await act(async () =>
      root.render(
        <EidosLiteI18nProvider>
          <WhatsNewPage />
        </EidosLiteI18nProvider>
      )
    )
    expect(host.textContent).toContain("English fixture body.")
    await act(async () => changePreferences({ ...preferences, language: "zh" }))
    expect(host.textContent).toContain("中文测试正文。")
    expect(host.textContent).not.toContain("English fixture body.")
    expect(
      host
        .querySelector("[data-document-key]")
        ?.getAttribute("data-document-key")
    ).toBe(`whats-new:${releaseVersion}:zh`)
    await act(async () => changePreferences({ ...preferences, language: "en" }))
    expect(host.textContent).toContain("English fixture body.")
    await act(async () =>
      changePreferences({ ...preferences, language: "system" })
    )
    expect(host.textContent).toContain("中文测试正文。")
    await act(async () =>
      host.querySelector<HTMLAnchorElement>('a[href="#whats-new-en"]')!.click()
    )
    expect(host.textContent).toContain("English fixture body.")
    expect(document.documentElement.lang).toBe("zh-CN")
    await act(async () =>
      host.querySelector<HTMLAnchorElement>('a[href="#whats-new-zh"]')!.click()
    )
    expect(host.textContent).toContain("中文测试正文。")
  } finally {
    act(() => root.unmount())
  }
})

it("acknowledges upgrades when opened and preserves a permanent reopening path", async () => {
  localStorage.setItem(key, "0.1.0")
  let showFromSettings: () => void = () => {}
  const unsubscribe = vi.fn()
  Object.defineProperty(window, "eidosLite", {
    configurable: true,
    value: {
      onWhatsNew: (listener: () => void) => {
        showFromSettings = listener
        return unsubscribe
      },
    },
  })
  const host = document.createElement("div")
  document.body.append(host)
  const root = createRoot(host)
  function Harness() {
    const state = useWhatsNew()
    return (
      <>
        <output>{String(state.unread)}</output>
        {state.open && (
          <>
            <button aria-label="Close" onClick={state.close}>
              Close
            </button>
            <WhatsNewPage />
          </>
        )}
      </>
    )
  }
  try {
    await act(async () => root.render(<Harness />))
    expect(host.querySelector("output")?.textContent).toBe("true")
    await act(async () => showFromSettings())
    expect(localStorage.getItem(key)).toBe(releaseVersion)
    expect(host.querySelector("output")?.textContent).toBe("false")
    expect(host.textContent).toContain(`Eidos Lite ${releaseVersion}`)
    expect(host.querySelector(".whats-new-page header")).toBeNull()
    expect(host.querySelector(".whats-new-scroll")).toBeNull()
    expect(host.querySelector(".whats-new-page")?.textContent).toContain(
      "English fixture body."
    )
    await act(async () =>
      host
        .querySelector<HTMLButtonElement>('button[aria-label="Close"]')!
        .click()
    )
    expect(host.querySelector(".whats-new-page")).toBeNull()
    await act(async () => showFromSettings())
    expect(host.querySelector(".whats-new-page")).not.toBeNull()
  } finally {
    act(() => root.unmount())
    host.remove()
  }
  expect(unsubscribe).toHaveBeenCalledOnce()
})
