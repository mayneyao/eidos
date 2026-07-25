import {
  BookOpen,
  BriefcaseBusiness,
  CalendarRange,
  ChevronRight,
  ContactRound,
  Download,
  Ellipsis,
  FileKey,
  FilePlus2,
  FileSpreadsheet,
  FolderOpen,
  HeartPulse,
  LayoutTemplate,
  Microscope,
  Moon,
  Save,
  Sun,
  TableProperties,
  WalletCards,
  type LucideIcon,
} from "lucide-react"

import { EIDOS_FILE_LOCALES, useI18n } from "../i18n"
import {
  EIDOS_FILE_TEMPLATES,
  type EidosFileTemplateId,
} from "../sample-eidos-file"
import { AppMenu, type AppMenuSection } from "./app-menu"

const templateIcons: Record<EidosFileTemplateId, LucideIcon> = {
  "project-portfolio": BriefcaseBusiness,
  "personal-crm": ContactRound,
  "household-finance": WalletCards,
  "reading-library": BookOpen,
  "habit-journal": HeartPulse,
  "content-calendar": CalendarRange,
  "feature-lab": Microscope,
  "field-capabilities": TableProperties,
}

interface AppTitlebarProps {
  fileOpen: boolean
  fileName?: string
  tableName?: string
  opening: boolean
  statusLabel?: string
  statusTone?: string
  StatusIcon?: LucideIcon
  statusSpinning?: boolean
  needsPermission?: boolean
  canSave?: boolean
  saveLabel?: string
  theme: "light" | "dark"
  onNew: () => void
  onOpen: () => void
  onOpenSample: () => void
  onOpenTemplate: (id: EidosFileTemplateId) => void
  onSave: () => void
  onDownload: () => void
  onReauthorize: () => void
  onThemeChange: (theme: "light" | "dark") => void
}

/**
 * The single chrome of the app: file operations, the active file identity and
 * state, then urgent and global actions. Identical before and after a file is
 * opened, so opening a file only swaps the content below it.
 */
export function AppTitlebar({
  fileOpen,
  fileName,
  tableName,
  opening,
  statusLabel,
  statusTone,
  StatusIcon,
  statusSpinning,
  needsPermission,
  canSave,
  saveLabel,
  theme,
  onNew,
  onOpen,
  onOpenSample,
  onOpenTemplate,
  onSave,
  onDownload,
  onReauthorize,
  onThemeChange,
}: AppTitlebarProps) {
  const { locale, setLocale, t } = useI18n()

  const templateSections: AppMenuSection[] = [
    {
      id: "templates",
      label: t("templatesHeading"),
      items: EIDOS_FILE_TEMPLATES.map((template) => ({
        id: template.id,
        label: template.copy[locale].title,
        icon: templateIcons[template.id],
        disabled: opening,
        onSelect: () => onOpenTemplate(template.id),
      })),
    },
  ]

  const fileSections: AppMenuSection[] = [
    {
      id: "file",
      items: [
        {
          id: "new",
          label: t("createEidosFile"),
          icon: FilePlus2,
          disabled: opening,
          onSelect: onNew,
        },
        {
          id: "open",
          label: t("openEidosFile"),
          icon: FolderOpen,
          hint: "⌘O",
          disabled: opening,
          onSelect: onOpen,
        },
        {
          id: "sample",
          label: t("openSample"),
          icon: FileSpreadsheet,
          disabled: opening,
          onSelect: onOpenSample,
        },
        {
          id: "new-from-template",
          label: t("newFromTemplate"),
          icon: LayoutTemplate,
          disabled: opening,
          submenu: templateSections,
        },
      ],
    },
    {
      id: "save",
      items: [
        {
          id: "save",
          label: saveLabel ?? t("save"),
          icon: Save,
          hint: "⌘S",
          disabled: !fileOpen || !canSave || opening,
          onSelect: onSave,
        },
        {
          id: "download",
          label: t("downloadCopy"),
          icon: Download,
          hint: "⇧⌘S",
          disabled: !fileOpen || opening,
          onSelect: onDownload,
        },
      ],
    },
  ]

  const moreSections: AppMenuSection[] = [
    {
      id: "language",
      label: t("languageSelector"),
      items: EIDOS_FILE_LOCALES.map((option) => ({
        id: `language-${option.value}`,
        label: option.label,
        checked: locale === option.value,
        onSelect: () => setLocale(option.value),
      })),
    },
    {
      id: "resources",
      label: t("menuResources"),
      items: [
        {
          id: "docs",
          label: t("navDocs"),
          onSelect: () => {
            window.location.href =
              locale === "zh"
                ? "https://eidos.space/zh/docs/"
                : "https://eidos.space/docs/"
          },
        },
        {
          id: "sqlite",
          label: `${t("navInspector")} ${t("navInspectorQualifier")}`,
          onSelect: () => {
            window.open("https://sqlite.eidos.space/", "_blank", "noreferrer")
          },
        },
      ],
    },
    {
      id: "ecosystem",
      label: t("menuEcosystem"),
      items: [
        {
          id: "graft",
          label: t("navGraft"),
          onSelect: () => {
            window.location.href = "https://graft.eidos.space/"
          },
        },
      ],
    },
  ]

  return (
    <header className="editor-titlebar">
      <div className="title-file-menu">
        <AppMenu
          label={t("menuFile")}
          sections={fileSections}
          variant="menubar"
          submenuBackLabel={t("backToFile")}
        />
      </div>
      {fileOpen ? (
        <div className="file-identity" title={fileName}>
          <FileSpreadsheet size={15} aria-hidden="true" />
          <strong>{fileName}</strong>
          <ChevronRight
            className="file-identity-separator"
            size={13}
            aria-hidden="true"
          />
          <span className="file-table-name">{tableName}</span>
          {StatusIcon ? (
            <div
              className={`save-status ${statusTone ?? ""}`}
              role="status"
              aria-live="polite"
              title={statusLabel}
            >
              <StatusIcon
                className={statusSpinning ? "spin" : ""}
                size={14}
                aria-hidden="true"
              />
              <span>{statusLabel}</span>
            </div>
          ) : null}
        </div>
      ) : (
        <div className="file-identity" aria-hidden="true" />
      )}
      <div className="title-actions">
        {fileOpen && needsPermission ? (
          <button
            className="permission-button"
            type="button"
            aria-label={t("grantWrite")}
            title={t("grantWrite")}
            onClick={onReauthorize}
          >
            <FileKey size={14} aria-hidden="true" />
            <span>{t("grantWrite")}</span>
          </button>
        ) : null}
        <button
          className="icon-button"
          type="button"
          aria-label={theme === "dark" ? t("useLightTheme") : t("useDarkTheme")}
          onClick={() => onThemeChange(theme === "dark" ? "light" : "dark")}
        >
          {theme === "dark" ? <Sun size={15} /> : <Moon size={15} />}
        </button>
        <AppMenu
          label={t("menuMore")}
          sections={moreSections}
          triggerIcon={Ellipsis}
          iconOnly
          align="end"
        />
      </div>
    </header>
  )
}
