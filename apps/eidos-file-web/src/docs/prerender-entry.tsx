import { renderToStaticMarkup } from "react-dom/server"
// Vite externalizes jsdom for the Node-only prerender bundle.
// @ts-expect-error jsdom does not publish bundled TypeScript declarations.
import { JSDOM } from "jsdom"

import { EidosFileDocs } from "../components/eidos-file-docs"
import { I18nProvider, type Locale } from "../i18n"
import { eidosFileDocumentBySlug } from "./eidos-file-documents"

const dom = new JSDOM("<!doctype html><html><body></body></html>")
const browserGlobals = globalThis as unknown as Record<string, unknown>

Object.assign(browserGlobals, {
  DOMParser: dom.window.DOMParser,
  HTMLAnchorElement: dom.window.HTMLAnchorElement,
  HTMLImageElement: dom.window.HTMLImageElement,
  HTMLPreElement: dom.window.HTMLPreElement,
  HTMLSourceElement: dom.window.HTMLSourceElement,
})

export interface PrerenderedDocsPage {
  description: string
  html: string
  slug: string
  title: string
}

export function renderDocsPage(
  slug: string,
  locale: Locale
): PrerenderedDocsPage {
  const document = eidosFileDocumentBySlug(slug)
  return {
    description: document.summary[locale],
    html: renderToStaticMarkup(
      <I18nProvider initialLocale={locale}>
        <EidosFileDocs
          slug={document.slug}
          theme="light"
          onToggleTheme={() => undefined}
        />
      </I18nProvider>
    ),
    slug: document.slug,
    title: `${document.title[locale]} · Eidos File`,
  }
}
