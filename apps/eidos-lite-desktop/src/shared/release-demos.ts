import { marked, type MarkedToken } from "marked"

export const demoLocales = ["en", "zh", "ja", "ko"] as const
type DemoLocale = (typeof demoLocales)[number]
type Translations = Record<DemoLocale, string>
export type NotesLocale = "en" | "zh"

export interface ReleaseDemo {
  releaseTag: string
  scenarioId: string
  capturedAppVersion: string
  sourceCommit: string
  afterSection: Translations
  media: {
    type: "video"
    src: string
    poster: string
    width: number
    height: number
    duration: number
    feature: Translations
    alt: Translations
    caption: Translations
  }
}

export function isLocalizedDemoText(value: unknown): value is Translations {
  if (typeof value !== "object" || !value) return false
  const fields = value as Partial<Record<DemoLocale, unknown>>
  return demoLocales.every((locale) => {
    const text = fields[locale]
    return (
      typeof text === "string" && text.trim().length > 0 && !/[\r\n]/.test(text)
    )
  })
}

export function isReleaseDemo(
  value: unknown,
  tag: string
): value is ReleaseDemo {
  if (typeof value !== "object" || !value) return false
  const demo = value as Partial<ReleaseDemo>
  const version = /^lite-v(\d+\.\d+\.\d+)$/.exec(tag)?.[1]
  const { media, scenarioId, capturedAppVersion, sourceCommit } = demo
  if (
    !version ||
    demo.releaseTag !== tag ||
    typeof scenarioId !== "string" ||
    !/^[a-z0-9-]+$/.test(scenarioId) ||
    typeof capturedAppVersion !== "string" ||
    !/^\d+\.\d+\.\d+$/.test(capturedAppVersion) ||
    typeof sourceCommit !== "string" ||
    !/^[a-f0-9]{40}$/.test(sourceCommit) ||
    !isLocalizedDemoText(demo.afterSection) ||
    media?.type !== "video"
  )
    return false

  const prefix = `https://media.eidos.space/releases/lite/${version}/${scenarioId}/`
  if (typeof media.src !== "string" || !media.src.startsWith(prefix))
    return false
  const bundle = /^([a-f0-9]{64})\/demo\.mp4$/.exec(
    media.src.slice(prefix.length)
  )?.[1]
  return (
    Boolean(bundle) &&
    media.poster === `${prefix}${bundle}/poster.webp` &&
    Number.isSafeInteger(media.width) &&
    media.width > 0 &&
    Number.isSafeInteger(media.height) &&
    media.height > 0 &&
    Number.isFinite(media.duration) &&
    media.duration > 0 &&
    media.duration <= 60 &&
    isLocalizedDemoText(media.feature) &&
    isLocalizedDemoText(media.alt) &&
    isLocalizedDemoText(media.caption)
  )
}

export const demoLinkLabel = {
  en: "Watch the demo",
  zh: "观看演示",
}

export function demoMarkdown(demo: ReleaseDemo, locale: NotesLocale): string {
  const { media } = demo
  const alt = media.alt[locale].replace(/[\\\[\]`*_<>!&]/g, "\\$&")
  return `[![${alt}](${media.poster})](${media.src})\\\n[${demoLinkLabel[locale]}](${media.src})`
}

export function demoSectionEnd(
  tokens: MarkedToken[],
  heading: string
): number | undefined {
  const matches = tokens.flatMap((token, index) =>
    token.type === "heading" && token.depth === 3 && token.text === heading
      ? [index]
      : []
  )
  if (matches.length !== 1) return
  const end = tokens.findIndex(
    (token, index) =>
      index > matches[0] &&
      token.type === "heading" &&
      (token.depth ?? Infinity) <= 3
  )
  return end === -1 ? tokens.length : end
}

export function demoSections(
  markdown: string,
  demos: ReleaseDemo[],
  locale: NotesLocale
): (MarkedToken[] | ReleaseDemo)[] {
  const tokens = marked.lexer(markdown)
  const byParagraph = new Map(
    demos.map((demo) => [demoMarkdown(demo, locale), demo])
  )
  const sections: (MarkedToken[] | ReleaseDemo)[] = []
  let start = 0
  for (const [index, token] of tokens.entries()) {
    const demo =
      token.type === "paragraph" && byParagraph.get(token.raw.trimEnd())
    if (!demo) continue
    sections.push(tokens.slice(start, index), demo)
    start = index + 1
  }
  sections.push(tokens.slice(start))
  return sections
}
