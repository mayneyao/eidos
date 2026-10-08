export type EidosLiteNewFileKind = "eidos" | "text"

export function eidosLiteNewFileKind(
  requestedName: string
): EidosLiteNewFileKind {
  const name = requestedName.trim().toLowerCase()
  return name.endsWith(".eidos") ? "eidos" : "text"
}
