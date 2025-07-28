import { useTranslation } from "react-i18next"
import { Link } from "react-router-dom"

import { useExtensionByIdOrSlug } from "@/hooks/use-extension"
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb"
import { useCurrentPathInfo } from "@/apps/web-app/hooks/use-current-pathinfo"

import { useEditorStore } from "../stores/editor-store"

interface ScriptBreadcrumbProps {
  scriptIdOrSlug: string
}

export const ScriptBreadcrumb = ({ scriptIdOrSlug }: ScriptBreadcrumbProps) => {
  const script = useExtensionByIdOrSlug(scriptIdOrSlug)
  const { space } = useCurrentPathInfo()
  const { t } = useTranslation()
  const { unsavedChangesMap } = useEditorStore()

  const hasUnsavedChanges = unsavedChangesMap[script?.id || ""] || false

  return (
    <Breadcrumb>
      <BreadcrumbList>
        <BreadcrumbItem>
          <BreadcrumbLink asChild>
            <Link to={`/${space}/extensions`}>
              {t("extension.breadcrumb.extensions")}
            </Link>
          </BreadcrumbLink>
          <BreadcrumbSeparator />
        </BreadcrumbItem>
        <BreadcrumbItem>
          <BreadcrumbPage>
            <span className="flex items-center gap-1">
              {script?.name}
              <span className="text-xs opacity-70">
                {script?.slug}.{script?.type === "script" ? "ts" : "tsx"}
              </span>
              {hasUnsavedChanges && (
                <span
                  className="inline-block w-2 h-2 bg-orange-500 rounded-full"
                  title="Unsaved changes"
                />
              )}
            </span>
          </BreadcrumbPage>
        </BreadcrumbItem>
      </BreadcrumbList>
    </Breadcrumb>
  )
}
