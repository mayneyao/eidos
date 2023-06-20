import { useState } from "react"

import { useCurrentPathInfo } from "@/hooks/use-current-pathinfo"
import { useGoto } from "@/hooks/use-goto"
import { useSqlite } from "@/hooks/use-sqlite"
import { Button } from "@/components/ui/button"
import {
  DialogDescription,
  DialogFooter,
  DialogHeader,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

export const CreateDoc = ({
  setOpen,
}: {
  setOpen: (open: boolean) => void
}) => {
  const [docName, setDocName] = useState("")
  const params = useCurrentPathInfo()
  const { database } = params
  const { createDoc } = useSqlite(database)
  const goto = useGoto()

  const handleCreateDoc = async () => {
    const docId = await createDoc(docName)
    goto(database, docId)
    setOpen(false)
  }

  return (
    <>
      <DialogHeader>
        {/* <DialogTitle>Create Table</DialogTitle> */}
        <DialogDescription>
          {`give your document a name and click create when you're ready`}
        </DialogDescription>
      </DialogHeader>
      <div className="grid gap-4 py-4">
        <div className="grid grid-cols-4 items-center gap-4">
          <Label htmlFor="name" className="text-right">
            *Name
          </Label>
          <Input
            id="name"
            placeholder="document name"
            className="col-span-3"
            value={docName}
            onChange={(e) => setDocName(e.target.value)}
            autoComplete="off"
          />
        </div>
      </div>
      <DialogFooter>
        <Button type="submit" onClick={handleCreateDoc}>
          Create
        </Button>
      </DialogFooter>
    </>
  )
}
