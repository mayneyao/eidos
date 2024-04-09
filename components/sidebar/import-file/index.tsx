import { useState } from "react"
import { Plus } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"

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
        <DialogHeader>
          <DialogTitle>Import File</DialogTitle>
          <DialogDescription>
            Import a CSV file to create a new table <br /> Import a markdown
            file to create a new document
          </DialogDescription>
        </DialogHeader>
        <ImportTable setOpen={setOpen} />
        {/* placeholder  */}
        <label className="w-full cursor-not-allowed select-none border p-2 text-center">
          Markdown
        </label>
      </DialogContent>
    </Dialog>
  )
}
