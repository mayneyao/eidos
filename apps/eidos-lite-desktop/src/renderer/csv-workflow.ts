export function eidosLiteCsvFileName(...segments: Array<string | undefined>) {
  const fileName = segments
    .filter((segment): segment is string => Boolean(segment))
    .map((segment) => segment.replace(/[\\/:*?"<>|]+/g, "-").trim() || "view")
    .join(" - ")
  return fileName.toLowerCase().endsWith(".csv")
    ? fileName
    : `${fileName || "Eidos File export"}.csv`
}
