const PORTABLE_PATH_CHARACTER = /[<>:"/\\|?*\u0000-\u001f]/gu
const TRAILING_PATH_CHARACTER = /[. ]+$/u
const CONTROL_CHARACTER = /[\u0000-\u001f\u007f-\u009f]/u
const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f-\u009f]/gu

export function normalizeCloudSpaceDisplayName(value: unknown): string | null {
  if (typeof value !== "string") return null
  const normalized = value.normalize("NFC").trim()
  const length = [...normalized].length
  return length >= 1 && length <= 80 && !CONTROL_CHARACTER.test(normalized)
    ? normalized
    : null
}

export function cloudDisplayNameForLocalSpace(
  localName: string,
  fallback = "Untitled Space"
): string {
  const normalized = localName
    .normalize("NFC")
    .replace(CONTROL_CHARACTERS, " ")
    .trim()
  return normalizeCloudSpaceDisplayName(normalized)
    ? normalized
    : [...normalized].slice(0, 80).join("").trim() || fallback
}

export function localNameForCloudSpace(
  displayName: string | undefined,
  fallback: string
): string {
  const normalized = (displayName ?? "")
    .normalize("NFC")
    .trim()
    .replace(PORTABLE_PATH_CHARACTER, " ")
    .replace(/\s+/gu, " ")
    .replace(TRAILING_PATH_CHARACTER, "")
    .trim()
  if (!normalized || normalized === "." || normalized === "..") return fallback
  return [...normalized].slice(0, 80).join("")
}
