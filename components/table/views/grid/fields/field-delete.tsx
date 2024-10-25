import { useState } from "react"
import { useTranslation } from "react-i18next"

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
  const { t } = useTranslation()
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
          <DialogTitle>{t('table.field.deleteConfirmTitle')}</DialogTitle>
          <DialogDescription>
            {field.type === FieldType.Link
              ? t('table.field.deleteLinkFieldWarning')
              : t('common.thisActionCannotBeUndone')}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setIsDeleteDialogOpen(false)}>
            {t('common.cancel')}
          </Button>
          <Button variant="destructive" onClick={handleDeleteFieldConfirm}>
            {t('common.delete')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
