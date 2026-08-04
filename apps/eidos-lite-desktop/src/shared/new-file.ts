export type EidosLiteNewFileKind = "eidos" | "text"

export function eidosLiteNewFileKind(
  requestedName: string
): EidosLiteNewFileKind {
  const name = requestedName.trim().toLowerCase()
  if (name.endsWith(".eidos")) return "eidos"

  const extensionSeparator = name.lastIndexOf(".")
  return extensionSeparator >= 0 && extensionSeparator < name.length - 1
    ? "text"
    : "eidos"
}
