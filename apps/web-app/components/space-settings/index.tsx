import { useState } from "react"
import { SettingsIcon } from "lucide-react"
import { useTranslation } from "react-i18next"

import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog"

import { Button } from "../ui/button"
import { SettingsContent } from "./settings-content"
import { SettingsSidebar } from "./settings-sidebar"

type SettingsSection = "general" | "document"

export function Settings() {
  const [activeSection, setActiveSection] = useState<SettingsSection>("general")

  return (
    <div className="flex h-[85vh]">
      <SettingsSidebar
        activeSection={activeSection}
        onSectionChange={setActiveSection}
      />
      <SettingsContent activeSection={activeSection} />
    </div>
  )
}

export const SpaceSettings = () => {
  const { t } = useTranslation()
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button
          variant={"ghost"}
          size="sm"
          className="w-full cursor-pointer justify-center font-normal"
          asChild
        >
          <span className="[&>svg]:!size-5">
            <SettingsIcon />
          </span>
        </Button>
      </DialogTrigger>
      <DialogContent className="h-[85vh] w-[75vw] max-w-6xl p-0">
        <Settings />
      </DialogContent>
    </Dialog>
  )
}
