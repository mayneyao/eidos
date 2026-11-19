// @vitest-environment jsdom
import { act } from "react"
import { createRoot } from "react-dom/client"
import { afterEach, beforeEach, expect, it, vi } from "vitest"
import { EidosLiteI18nProvider } from "./i18n"
import type { EidosLitePreferences } from "../shared/contracts"

// Release copy changes independently of the viewer behavior tested here.
const fixture = vi.hoisted(() => {
  const base = `https://media.eidos.space/releases/lite/9.9.9/example/${"a".repeat(64)}`
  const local = (en: string, zh: string) => ({
    en,
    zh,
    ja: "日本語",
    ko: "한국어",
  })
  return {
    releaseTag: "lite-v9.9.9",
    scenarioId: "example",
    capturedAppVersion: "9.9.8",
    sourceCommit: "b".repeat(40),
    afterSection: local("Feature fixture", "功能示例"),
    media: {
      type: "video",
      src: `${base}/demo.mp4`,
      poster: `${base}/poster.webp`,
      width: 1200,
      height: 800,
      duration: 8,
      feature: local("Demo", "演示"),
      alt: local("Feature preview", "功能预览"),
      caption: local("Recorded in 9.9.8", "录制于 9.9.8"),
    },
  }
})
const screenshot = vi.hoisted(() => ({
  ...fixture,
  scenarioId: "layout",
  afterSection: { ...fixture.afterSection, en: "Next heading", zh: "布局" },
  media: {
    ...fixture.media,
    type: "image",
    src: `https://media.eidos.space/releases/lite/9.9.9/layout/${"c".repeat(64)}/screenshot.webp`,
    alt: { ...fixture.media.alt, en: "Layout screenshot", zh: "布局截图" },
  },
}))

vi.mock("../../package.json", () => ({ default: { version: "9.9.9" } }))
vi.mock("../../release-demos.json", () => ({
  default: [fixture, screenshot, { ...fixture, releaseTag: "lite-v9.9.8" }],
}))
vi.mock("../../RELEASE_NOTES.md?raw", async () => {
  const { demoMarkdown } = await import("../shared/release-demos")
  return {
    default: `## English release fixture\n\n### Feature fixture\n\nEnglish fixture body.\n\n${demoMarkdown(fixture as ReleaseDemo, "en")}\n\n### Next heading\n\n<video src="https://example.com/unsafe.mp4"></video>\n\n${demoMarkdown(screenshot as ReleaseDemo, "en")}`,
  }
})
vi.mock("../../RELEASE_NOTES.zh-CN.md?raw", async () => {
  const { demoMarkdown } = await import("../shared/release-demos")
  return {
    default: `## 中文日志测试标题\n\n### 功能示例\n\n中文测试正文。\n\n${demoMarkdown(fixture as ReleaseDemo, "zh")}\n\n### 布局\n\n${demoMarkdown(screenshot as ReleaseDemo, "zh")}`,
  }
})
import type { ReleaseDemo } from "../shared/release-demos"
import {
  hasUnseenRelease,
  releaseVersion,
  useWhatsNew,
  WhatsNewPage,
} from "./whats-new"

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
const key = "eidos-lite:whats-new:acknowledged"
beforeEach(() => window.history.replaceState(null, "", "/#/"))
afterEach(() => {
  localStorage.clear()
  vi.unstubAllGlobals()
})

it("does not prompt on first install or the acknowledged version", () => {
  expect(hasUnseenRelease(null, "0.10.1")).toBe(false)
  expect(hasUnseenRelease("0.10.1", "0.10.1")).toBe(false)
  expect(hasUnseenRelease("0.10.0", "0.10.1")).toBe(true)
})

it.each([false, true])(
  "switches bundled notes with the current interface language (native window: %s)",
  async (standalone) => {
    if (standalone) window.history.replaceState(null, "", "/#/release-notes")
    let changePreferences: (
      preferences: EidosLitePreferences
    ) => void = () => {}
    const preferences = { language: "en" } as EidosLitePreferences
    const openExternalUrl = vi.fn()
    Object.defineProperty(window, "eidosLite", {
      configurable: true,
      value: {
        getPreferences: async () => preferences,
        openExternalUrl,
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
            <WhatsNewPage standalone={standalone} />
          </EidosLiteI18nProvider>
        )
      )
      expect(host.textContent).toContain("English fixture body.")
      const video = host.querySelector("video")!
      expect(host.querySelectorAll("video")).toHaveLength(1)
      expect(host.querySelectorAll("figure img")).toHaveLength(1)
      expect(host.querySelector("figure img")?.getAttribute("src")).toBe(
        screenshot.media.src
      )
      expect(video.src).toBe(fixture.media.src)
      expect(video.poster).toBe(fixture.media.poster)
      expect(video.controls).toBe(true)
      expect(video.preload).toBe("none")
      expect(video.autoplay).toBe(false)
      expect(
        video.closest("figure")?.previousElementSibling?.textContent
      ).toContain("English fixture body.")
      expect(
        video.closest("figure")?.nextElementSibling?.querySelector("h3")
          ?.textContent
      ).toBe("Next heading")
      expect(host.textContent).toContain(
        '<video src="https://example.com/unsafe.mp4">'
      )
      expect(host.querySelector('[contenteditable="true"]')).toBeNull()
      await act(async () =>
        changePreferences({ ...preferences, language: "zh" })
      )
      expect(host.textContent).toContain("中文测试正文。")
      if (standalone) {
        expect(window.location.hash).toBe("#/release-notes")
        expect(host.querySelector("header, button")).toBeNull()
        expect(localStorage.getItem(key)).toBe(releaseVersion)
      }
      expect(host.textContent).not.toContain("English fixture body.")
      expect(host.querySelector("video")?.getAttribute("aria-label")).toBe(
        "功能预览"
      )
      const image = host.querySelector<HTMLImageElement>(
        'figure img[alt="布局截图"]'
      )!
      expect(
        image.closest("figure")?.querySelector("figcaption a")?.textContent
      ).toBe("打开截图")
      await act(async () => image.dispatchEvent(new Event("error")))
      expect(image.hidden).toBe(true)
      await act(async () =>
        changePreferences({ ...preferences, language: "en" })
      )
      expect(host.textContent).toContain("English fixture body.")
      await act(async () =>
        changePreferences({ ...preferences, language: "system" })
      )
      expect(host.textContent).toContain("中文测试正文。")
      await act(async () => {
        host.querySelector("video")!.dispatchEvent(new Event("error"))
      })
      expect(host.querySelector("video")).toBeNull()
      expect(host.querySelector("figure img")?.getAttribute("src")).toBe(
        fixture.media.poster
      )
      const link = host.querySelector<HTMLAnchorElement>("figcaption a")!
      expect(link.textContent).toBe("观看演示")
      link.click()
      expect(openExternalUrl).toHaveBeenCalledWith(fixture.media.src)
      expect(host.textContent).toContain("中文测试正文。")
      await act(async () =>
        host
          .querySelector<HTMLAnchorElement>('a[href="#whats-new-en"]')!
          .click()
      )
      expect(host.textContent).toContain("English fixture body.")
      expect(document.documentElement.lang).toBe("zh-CN")
      if (standalone) expect(window.location.hash).toBe("#/release-notes")
      if (standalone) {
        expect(
          host.querySelector(".markdown-editor-surface-loading")
        ).toBeNull()
        expect(host.querySelector(".markdown-document")).not.toBeNull()
      }
      await act(async () =>
        host
          .querySelector<HTMLAnchorElement>('a[href="#whats-new-zh"]')!
          .click()
      )
      expect(host.textContent).toContain("中文测试正文。")
    } finally {
      act(() => root.unmount())
    }
  }
)

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
    const closed = new Promise<void>((resolve) =>
      window.addEventListener("popstate", () => resolve(), { once: true })
    )
    await act(async () => {
      host
        .querySelector<HTMLButtonElement>('button[aria-label="Close"]')!
        .click()
      await closed
    })
    expect(host.querySelector(".whats-new-page")).toBeNull()
    await act(async () => showFromSettings())
    expect(host.querySelector(".whats-new-page")).not.toBeNull()
  } finally {
    act(() => root.unmount())
    host.remove()
  }
  expect(unsubscribe).toHaveBeenCalledOnce()
})
