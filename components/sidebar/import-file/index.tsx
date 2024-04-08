import { Plus } from "lucide-react"
import { useState } from "react"

import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog"

import { ImportTable } from "./import-table"

export function ImportFileDialog() {
  const [open, setOpen] = useState(false)

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
            <span>Import</span>
          </span>
        </Button>
      </DialogTrigger>

      <DialogContent className="p-8 sm:max-w-[425px]">
        <ImportTable setOpen={setOpen} />
      </DialogContent>
    </Dialog>
  )
}
