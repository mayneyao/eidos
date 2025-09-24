import { SettingsIcon } from "lucide-react"
import { useTranslation } from "react-i18next"

import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog"
import { useAppRuntimeStore } from "@/apps/web-app/store/runtime-store"

import { Button } from "../ui/button"
import { UnifiedSettings } from "./unified-settings"

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
        <Settings />
      </DialogContent>
    </Dialog>
  )
}
