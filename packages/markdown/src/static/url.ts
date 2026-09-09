import { normalizeEfmUri } from "../markdown/efm-uri"

/** Relative paths stay host-owned; allow only web URLs and mail links. */
export function safeUrl(url: string, image = false): string | null {
  const normalized = normalizeEfmUri(url)
  const scheme = normalized.match(/^([a-z][a-z\d+.-]*):/iu)?.[1]?.toLowerCase()
  return !normalized ||
    (scheme &&
      !(image ? ["http", "https"] : ["http", "https", "mailto"]).includes(
        scheme
      ))
    ? null
    : url
}
