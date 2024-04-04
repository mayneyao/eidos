import { useState } from "react"

import { FieldType } from "@/lib/fields/const"
import { IField } from "@/lib/store/interface"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"

interface IFieldDeleteProps {
  field: IField
  deleteField: (fieldId: string) => void
  children: React.ReactNode
}

export const FieldDelete = ({
  field,
  children,
  deleteField,
}: IFieldDeleteProps) => {
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false)
  const handleDeleteFieldConfirm = () => {
    deleteField(field.table_column_name)
    setIsDeleteDialogOpen(false)
  }
  return (
    <Dialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
      <DialogTrigger className="w-full">{children}</DialogTrigger>
      <DialogContent className="click-outside-ignore max-w-[300px]">
        <DialogHeader>
          <DialogTitle>Are you sure delete this field?</DialogTitle>
          <DialogDescription>
            {field.type === FieldType.Link
              ? "This field is a link field. Deleting this field will also delete the paired field. and this action cannot be undone."
              : "This action cannot be undone."}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setIsDeleteDialogOpen(false)}>
            Cancel
          </Button>
          <Button variant="destructive" onClick={handleDeleteFieldConfirm}>
            Delete
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
