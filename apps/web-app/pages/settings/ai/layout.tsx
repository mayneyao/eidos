import { useTranslation } from "react-i18next"
import { Link, Outlet, useParams, useSearchParams } from "react-router-dom"

import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb"
import { Separator } from "@/components/ui/separator"

export function SettingsAILayout() {
  const { t } = useTranslation()
  const { providerId } = useParams()
  const [searchParams] = useSearchParams()
  const name = searchParams.get("name") as string
  const providerType = searchParams.get("type")
  //   /settings/ai/provider/:providerId
  const providerDisplayName =
    providerId === "new" ? name || providerType : providerId
  return (
    <div className="space-y-4">
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem className="text-lg font-medium">
            <BreadcrumbLink asChild>
              <Link to="/settings/ai">{t("settings.ai")}</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          {providerId && (
            <>
              <BreadcrumbSeparator />
              <BreadcrumbItem>
                <BreadcrumbPage>{t("settings.ai.provider")}</BreadcrumbPage>
              </BreadcrumbItem>
              <BreadcrumbSeparator />
              <BreadcrumbItem>
                <BreadcrumbPage>
                  <BreadcrumbLink asChild>
                    <Link to={`/settings/ai/provider/${providerId}`}>
                      {providerDisplayName}
                    </Link>
                  </BreadcrumbLink>
                </BreadcrumbPage>{" "}
              </BreadcrumbItem>
            </>
          )}
        </BreadcrumbList>
      </Breadcrumb>
      <p className="text-sm text-muted-foreground">
        {t("settings.ai.description")}
      </p>
      <Separator />
      <Outlet />
    </div>
  )
}
