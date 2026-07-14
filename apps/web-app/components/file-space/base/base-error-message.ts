export function baseErrorMessage(error: unknown, fallback: string): string {
  const rawMessage =
    error instanceof Error
      ? error.message
      : typeof error === "string"
        ? error
        : fallback
  const message = rawMessage.trim() || fallback

  return (
    message
      .replace(/^Error invoking remote method '[^']+':\s*/i, "")
      .replace(/^Error:\s*/i, "")
      .trim() || fallback
  )
}
