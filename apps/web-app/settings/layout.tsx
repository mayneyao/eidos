"use client"

import { useKeyPress } from "ahooks"
import { Minimize2 } from "lucide-react"
import { useTranslation } from "react-i18next"
import { Outlet } from "react-router-dom"

import { useGoto } from "@/hooks/use-goto"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Separator } from "@/components/ui/separator"
import { SidebarNav } from "@/apps/web-app/settings/components/sidebar-nav"

import { useLastOpened } from "../[database]/hook"

const sidebarNavItems = [
  {
    titleKey: "settings.general",
    href: "/settings",
  },
  {
    titleKey: "settings.ai",
    href: "/settings/ai",
  },
  {
    titleKey: "settings.api",
    href: "/settings/api",
  },
  {
    titleKey: "settings.storage",
    href: "/settings/storage",
  },
  {
    titleKey: "settings.appearance",
    href: "/settings/appearance",
  },
  {
    titleKey: "settings.sync",
    href: "/settings/sync",
    disabled: true,
  },
  {
    titleKey: "settings.security",
    href: "/settings/security",
    disabled: true,
  },
  // {
  //   titleKey: "settings.experiment",
  //   href: "/settings/experiment",
  // },
  // {
  //   titleKey: "settings.devtools",
  //   href: "/settings/dev",
  // },
]

export default function SettingsLayout() {
  const { t } = useTranslation()
  const { lastOpenedTable, lastOpenedDatabase } = useLastOpened()
  const goto = useGoto()
  const goBack = () => goto(lastOpenedDatabase, lastOpenedTable)
  useKeyPress("esc", (e) => {
    e.preventDefault()
    goBack()
  })

  return (
    <ScrollArea className="h-[100vh] w-full">
      <div className="grid w-full grid-cols-5 ">
        <div className="col-span-1" />
        <div className="col-span-5 space-y-6 p-4 pb-16 md:block md:p-10 xl:col-span-3">
          <div className="flex items-start justify-between">
            <div className="space-y-0.5">
              <h2 className="text-2xl font-bold tracking-tight">
                {t("settings.title")}
              </h2>
              <p className="text-muted-foreground">
                {t("settings.manageAppSettings")}
              </p>
            </div>
            <Button variant="ghost" onClick={goBack}>
              <Minimize2 className="mr-2 h-4 w-4" /> {t("common.esc")}
            </Button>
          </div>
          <Separator className="my-6" />
          <div className="flex flex-col space-y-8 lg:flex-row lg:space-x-12 lg:space-y-0">
            <aside className="-mx-4 lg:w-1/5">
              <SidebarNav
                items={sidebarNavItems.map((item) => ({
                  ...item,
                  title: t(item.titleKey),
                }))}
              />
            </aside>
            <div className="flex-1 lg:max-w-2xl">
              <Outlet />
            </div>
          </div>
        </div>
        <div className="col-span-1" />
      </div>
    </ScrollArea>
  )
}
