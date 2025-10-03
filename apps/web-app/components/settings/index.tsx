import { SettingsIcon } from "lucide-react"
import { useTranslation } from "react-i18next"
import { useEffect, useState } from "react"

import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog"
import { useAppRuntimeStore } from "@/apps/web-app/store/runtime-store"

import { Button } from "../ui/button"
import { UnifiedSettings } from "./unified-settings"
import { onSettingsOpen, onSettingsClose, type SettingsSection } from "./settings-events"

export function Settings() {
  return (
    <UnifiedSettings 
      initialSection="general" 
      showSpaceSettings={true} 
    />
  )
}

export const SpaceSettings = () => {
  const { t } = useTranslation()
  const { isSpaceSettingsOpen, setSpaceSettingsOpen } = useAppRuntimeStore()
  const [activeSection, setActiveSection] = useState<SettingsSection>("general")
  const [showSpaceSettings, setShowSpaceSettings] = useState(true)
  
  useEffect(() => {
    const unsubscribeOpen = onSettingsOpen((event) => {
      const { section = "general", showSpaceSettings: showSpace = true } = event.detail
      setActiveSection(section)
      setShowSpaceSettings(showSpace)
      setSpaceSettingsOpen(true)
    })
    
    const unsubscribeClose = onSettingsClose(() => {
      setSpaceSettingsOpen(false)
    })
    
    return () => {
      unsubscribeOpen()
      unsubscribeClose()
    }
  }, [setSpaceSettingsOpen])
  
  return (
    <Dialog open={isSpaceSettingsOpen} onOpenChange={setSpaceSettingsOpen}>
      <DialogTrigger asChild>
        <Button
          variant={"ghost"}
          size="sm"
          className="h-8 w-8 p-0 cursor-pointer"
          title={t("common.settings")}
        >
          <SettingsIcon className="h-4 w-4" />
        </Button>
      </DialogTrigger>
      <DialogContent className="h-[85vh] w-[75vw] max-w-6xl p-0">
        <UnifiedSettings 
          initialSection={activeSection}
          showSpaceSettings={showSpaceSettings}
        />
      </DialogContent>
    </Dialog>
  )
}
