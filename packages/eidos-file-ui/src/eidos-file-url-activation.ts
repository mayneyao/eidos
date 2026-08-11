const EIDOS_FILE_ACTIVATABLE_URL_LENGTH_MAX = 8_192

/**
 * Returns whether a raw URL Field value is eligible for explicit navigation.
 * The Host must independently enforce the same-or-stricter policy.
 */
export function eidosFileUrlIsActivatable(value: string): boolean {
  if (
    value.length === 0 ||
    value.length > EIDOS_FILE_ACTIVATABLE_URL_LENGTH_MAX ||
    value !== value.trim()
  ) {
    return false
  }
  try {
    const url = new URL(value)
    return (
      (url.protocol === "https:" || url.protocol === "http:") &&
      url.username === "" &&
      url.password === ""
    )
  } catch {
    return false
  }
}
