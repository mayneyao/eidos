import { useState } from "react"
import { Plus } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"

import { CreateDoc } from "./create-doc"
import { CreateTable } from "./create-table"

export function CreateFileDialog() {
  const [open, setOpen] = useState(false)

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          size="sm"
          className="dark:bg-dark-800 sticky bottom-0 min-h-[32px] w-full bg-white font-normal"
          variant="outline"
        >
          <Plus size={16} className="mr-2" />
        </Button>
      </DialogTrigger>

      <DialogContent className="sm:max-w-[425px]">
        <Tabs defaultValue="table" className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="table">Table</TabsTrigger>
            <TabsTrigger value="doc">Doc</TabsTrigger>
          </TabsList>
          <TabsContent value="table" className="p-2">
            <CreateTable setOpen={setOpen} />
          </TabsContent>
          <TabsContent value="doc">
            <CreateDoc setOpen={setOpen} />
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  )
}
