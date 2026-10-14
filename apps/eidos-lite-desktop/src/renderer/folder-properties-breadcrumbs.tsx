import { Fragment } from "react"
import { ChevronRight } from "lucide-react"
import { useEidosLiteI18n } from "./i18n"

export function FolderPropertiesBreadcrumbs({
  spaceName,
  directory,
  disabled,
  onNavigate,
}: {
  spaceName: string
  directory: string | null
  disabled: boolean
  onNavigate(directory: string | null): void
}) {
  const { t } = useEidosLiteI18n()
  const folders = directory?.split("/") ?? []
  const ancestors = [
    { label: spaceName, path: null },
    ...folders.map((label, index) => ({
      label,
      path: folders.slice(0, index + 1).join("/"),
    })),
  ]
  return (
    <nav
      className="file-titlebar-breadcrumbs folder-properties-breadcrumbs"
      aria-label={t("Folder properties")}
    >
      {ancestors.map(({ label, path }) => (
        <Fragment key={path ?? ""}>
          <button
            type="button"
            className="file-titlebar-breadcrumb-link"
            disabled={disabled}
            title={path ?? spaceName}
            onClick={() => onNavigate(path)}
          >
            <strong>{label}</strong>
          </button>
          <ChevronRight
            className="file-titlebar-breadcrumb-separator"
            size={12}
            aria-hidden="true"
          />
        </Fragment>
      ))}
      <strong className="file-titlebar-breadcrumb-current" aria-current="page">
        {t("Properties")}
      </strong>
    </nav>
  )
}
