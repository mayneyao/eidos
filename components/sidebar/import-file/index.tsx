import { useState } from "react"
import { Plus } from "lucide-react"
import { useTranslation } from "react-i18next"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"

import { ImportDoc } from "./import-doc"
import { ImportTable } from "./import-table"

export function ImportFileDialog() {
  const [open, setOpen] = useState(false)
  const { t } = useTranslation()
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          variant={"ghost"}
          size="sm"
          className="w-full cursor-pointer justify-start font-normal"
          asChild
        >
          <span>
            <Plus className="pr-2" />
            {t("common.import")}
          </span>
        </Button>
      </DialogTrigger>

      <DialogContent className="p-8 sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>{t("sidebar.importFile.title")}</DialogTitle>
          <DialogDescription>
            {t("sidebar.importFile.importCSVDescription")} <br />
            {t("sidebar.importFile.importMarkdownDescription")}
          </DialogDescription>
        </DialogHeader>

        <ImportTable setOpen={setOpen} />

        <ImportDoc setOpen={setOpen} />
      </DialogContent>
    </Dialog>
  )
}
