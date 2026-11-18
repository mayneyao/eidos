import type { SpaceTreeEntry } from "../shared/contracts"

/** Keep the final extension intact; dotfiles and folders select their full name. */
export function explorerRenameSelectionEnd(
  name: string,
  kind: SpaceTreeEntry["kind"]
): number {
  if (kind === "directory" || name.startsWith(".")) return name.length
  const dot = name.lastIndexOf(".")
  return dot > 0 && dot < name.length - 1 ? dot : name.length
}
