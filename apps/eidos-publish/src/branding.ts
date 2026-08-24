const BRAND_STYLESHEET_PATH = "/_eidos/publish-brand.v4.css"
const BRAND_DESTINATION =
  "https://eidos.space/publish?utm_source=published_site&utm_medium=badge&utm_campaign=publish_branding"

const BRAND_CSS = `
.eidos-publish-brand-page {
  display: flex;
  min-height: 100vh;
  min-height: 100dvh;
  flex-direction: column;
}
.eidos-publish-brand-footer {
  box-sizing: border-box;
  display: flex;
  width: 100%;
  margin-top: auto;
  justify-content: center;
  padding: 0 16px max(24px, env(safe-area-inset-bottom));
}
.eidos-publish-brand {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 4px;
  color: #71717a;
  font: 500 12px/1.2 ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  letter-spacing: 0;
  text-decoration: none;
  -webkit-font-smoothing: antialiased;
  transition: color 140ms ease;
}
.eidos-publish-brand:hover {
  color: #18181b;
}
.eidos-publish-brand:focus-visible {
  outline: 2px solid #007284;
  outline-offset: 2px;
}
.eidos-publish-brand svg {
  width: 16px;
  height: 16px;
  flex: 0 0 auto;
  color: #007284;
}
.eidos-publish-brand strong {
  color: #18181b;
  font-weight: 650;
}
@media (prefers-color-scheme: dark) {
  .eidos-publish-brand {
    color: #a1a1aa;
  }
  .eidos-publish-brand:hover {
    color: #f4f4f5;
  }
  .eidos-publish-brand strong { color: #f4f4f5; }
  .eidos-publish-brand svg { color: #2dd4bf; }
}
@media (prefers-reduced-motion: reduce) {
  .eidos-publish-brand { transition: none; }
}
@media print {
  .eidos-publish-brand-footer { display: none; }
}
`.trim()

const BRAND_HTML = `<footer class="eidos-publish-brand-footer"><a class="eidos-publish-brand" href="${BRAND_DESTINATION}" target="_blank" rel="noopener noreferrer" referrerpolicy="no-referrer" aria-label="Built with Eidos — open Eidos Publish">
  <svg viewBox="0 0 512 512" fill="none" aria-hidden="true" focusable="false">
    <path fill="currentColor" fill-rule="evenodd" clip-rule="evenodd" d="M256.151 500.829L467.826 378.591L467.85 134.156L256.199 11.9587L44.5239 134.197L44.5 378.632L256.151 500.829ZM255.85 33.3289L440.459 139.913L401.716 162.349L403.25 331.87L390.749 338.809L389.004 169.33L323.205 207.319L324.077 375.821L311.985 382.053L310.704 214.258L256.505 244.693L232.653 230.922L379.275 145.309L325.849 114.463L178.96 199.922L150.897 183.72L298.242 98.5245L249.692 70.4936L101.884 155.422L74.6395 139.693L255.85 33.3289ZM265.077 473.329L265.077 427L117.707 342.561L117.787 330.301L265.077 414.5L265.077 341.991L117.381 256.485L117.14 242.189L265.077 326.5L265.077 264.329L293.613 248.108L293.395 415.991L343.625 386.991L343.733 219.17L372.194 202.569L371.77 370.741L421.567 341.991L420.783 173.992L450.297 156.953L449.85 366.959L265.077 473.329ZM98.0001 178.148L63.8279 158.419L63.3501 367.959L245.87 473.329L245.87 439.959L96.8722 354.128L96.8722 296.459L245.87 380.959L245.87 353.329L97.2186 266.959L97.2186 208.036L245.87 293.86L245.693 263.419L191.098 231.898L213.527 218.653L342.884 143.969L327.243 135.011L174.643 222.398L112.29 186.398L136.521 172.276L263.827 98.7762L249.206 90.335L98.0001 178.148Z"/>
  </svg>
  <span>Built with <strong>Eidos</strong></span>
</a></footer>`

export function isPublishBrandStylesheet(pathname: string): boolean {
  return pathname === BRAND_STYLESHEET_PATH
}

export function publishBrandStylesheetResponse(method: string): Response {
  const headers = new Headers({
    "Cache-Control": "public, max-age=31536000, immutable",
    "Content-Length": new TextEncoder().encode(BRAND_CSS).byteLength.toString(),
    "Content-Type": "text/css; charset=utf-8",
    "Cross-Origin-Resource-Policy": "same-origin",
    "Referrer-Policy": "no-referrer",
    "X-Content-Type-Options": "nosniff",
  })
  return new Response(method === "HEAD" ? null : BRAND_CSS, { headers })
}

export function brandedDocumentHeaders(source: Headers): Headers {
  const headers = new Headers(source)
  headers.delete("Content-Length")
  headers.delete("ETag")
  return headers
}

export function brandPublishedDocument(
  response: Response,
  publishSlug?: string,
  showBranding = true
): Response {
  const headers = brandedDocumentHeaders(response.headers)
  const document = new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  })
  return new HTMLRewriter()
    .on("head", {
      element(element) {
        if (showBranding && publishSlug === undefined) {
          element.append(
            `<link rel="stylesheet" href="${BRAND_STYLESHEET_PATH}">`,
            { html: true }
          )
        }
        if (publishSlug !== undefined) {
          element.append(
            `<meta name="eidos-publish-slug" content="${publishSlug}">`,
            { html: true }
          )
          element.append(
            `<meta name="eidos-publish-branding" content="${showBranding ? "show" : "hide"}">`,
            { html: true }
          )
        }
      },
    })
    .on("body", {
      element(element) {
        if (showBranding && publishSlug === undefined) {
          const className = element.getAttribute("class")
          element.setAttribute(
            "class",
            className === null
              ? "eidos-publish-brand-page"
              : `${className} eidos-publish-brand-page`
          )
          element.append(BRAND_HTML, { html: true })
        }
      },
    })
    .transform(document)
}
