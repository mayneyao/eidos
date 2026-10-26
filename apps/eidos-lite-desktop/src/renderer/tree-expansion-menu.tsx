import { useEidosLiteI18n } from "./i18n"
import { ChevronsDownUp, ChevronsUpDown } from "lucide-react"

export interface TreeExpansionActions {
  scope: "all" | "folder"
  isExpanded(): boolean
  toggle(): void
}

export function TreeExpansionMenu({
  actions,
  disabled,
  onClose,
}: {
  actions: TreeExpansionActions
  disabled?: boolean
  onClose(): void
}) {
  const { t } = useEidosLiteI18n()
  const expanded = actions.isExpanded()
  const label =
    actions.scope === "all"
      ? expanded
        ? "Collapse all folders"
        : "Expand all folders"
      : expanded
        ? "Collapse subfolders"
        : "Expand subfolders"
  return (
    <button
      type="button"
      role="menuitem"
      disabled={disabled}
      onClick={() => {
        actions.toggle()
        onClose()
      }}
    >
      {expanded ? (
        <ChevronsDownUp aria-hidden="true" />
      ) : (
        <ChevronsUpDown aria-hidden="true" />
      )}
      {t(label)}
    </button>
  )
}
