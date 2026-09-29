import type { ViewDeclaration } from "./contracts"

/** Host adapter selection; public View kinds remain page/file. */
export function viewResource(view: ViewDeclaration) {
  if (view.kind === "page") return "page"
  if (view.capabilities?.includes("eidos/table")) return "table"
  if (view.capabilities?.some((capability) => capability.startsWith("eidos/")))
    return "eidos"
  return view.capabilities?.includes("document") ? "document" : "file"
}
