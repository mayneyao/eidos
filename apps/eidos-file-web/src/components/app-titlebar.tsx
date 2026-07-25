import {
  BookOpen,
  BriefcaseBusiness,
  CalendarRange,
  ChevronRight,
  ContactRound,
  Download,
  FileKey,
  FilePlus2,
  FileSpreadsheet,
  FolderOpen,
  HeartPulse,
  Microscope,
  Moon,
  Save,
  Sun,
  TableProperties,
  WalletCards,
  type LucideIcon,
} from "lucide-react"

import { useI18n } from "../i18n"
import {
  EIDOS_FILE_TEMPLATES,
  type EidosFileTemplateId,
} from "../sample-eidos-file"
import { AppMenu, type AppMenuSection } from "./app-menu"
import { EidosFileLanguageSelect } from "./eidos-file-language-select"
import { EidosLogo } from "./eidos-logo"

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
 * The single chrome of the app: logo, the File menu, then theme, language
 * and a More menu of outbound links. Identical before and after a file is
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
  const { locale, t } = useI18n()

  const fileSections: AppMenuSection[] = []

  if (fileOpen) {
    fileSections.push({
      id: "current",
      items: [
        {
          id: "save",
          label: saveLabel ?? t("save"),
          icon: Save,
          disabled: !canSave || opening,
          onSelect: onSave,
        },
        {
          id: "download",
          label: t("downloadCopy"),
          icon: Download,
          onSelect: onDownload,
        },
      ],
    })
  }

  fileSections.push(
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
      ],
    },
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
    }
  )

  const moreSections: AppMenuSection[] = [
    {
      id: "links",
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
      <span className="brand-lockup compact">
        <EidosLogo className="brand-logo" />
      </span>
      <div className="title-file-menu">
        <AppMenu label={t("menuFile")} sections={fileSections} />
      </div>
      {fileOpen ? (
        <div className="file-identity" title={fileName}>
          <FileSpreadsheet size={15} aria-hidden="true" />
          <strong>{fileName}</strong>
          <ChevronRight size={13} aria-hidden="true" />
          <span>{tableName}</span>
        </div>
      ) : (
        <div className="file-identity" aria-hidden="true" />
      )}
      <div className="title-actions">
        {fileOpen && StatusIcon ? (
          <div
            className={`save-status ${statusTone ?? ""}`}
            role="status"
            aria-live="polite"
          >
            <StatusIcon
              className={statusSpinning ? "spin" : ""}
              size={14}
              aria-hidden="true"
            />
            <span>{statusLabel}</span>
          </div>
        ) : null}
        {fileOpen && needsPermission ? (
          <button
            className="permission-button"
            type="button"
            onClick={onReauthorize}
          >
            <FileKey size={14} aria-hidden="true" />
            {t("grantWrite")}
          </button>
        ) : null}
        <button
          className="icon-button"
          type="button"
          aria-label={`Use ${theme === "dark" ? "light" : "dark"} theme`}
          onClick={() => onThemeChange(theme === "dark" ? "light" : "dark")}
        >
          {theme === "dark" ? <Sun size={15} /> : <Moon size={15} />}
        </button>
        <EidosFileLanguageSelect />
        <AppMenu label={t("menuMore")} sections={moreSections} align="end" />
      </div>
    </header>
  )
}
