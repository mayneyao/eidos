import { useTranslation } from "react-i18next"

import { useAppRuntimeStore } from "@/lib/store/runtime-store"
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog"

import {
  useCommonKeyboardShortcuts,
  useDocumentKeyboardShortcuts,
  useTableKeyboardShortcuts,
} from "./const"
import { ShortcutTable } from "./shortcut-table"

export function KeyboardShortCuts() {
  const { isKeyboardShortcutsOpen, setKeyboardShortcutsOpen } =
    useAppRuntimeStore()
  const { t } = useTranslation()
  const CommonKeyboardShortcuts = useCommonKeyboardShortcuts()
  const DocumentKeyboardShortcuts = useDocumentKeyboardShortcuts()
  const TableKeyboardShortcuts = useTableKeyboardShortcuts()

  return (
    <Dialog
      open={isKeyboardShortcutsOpen}
      onOpenChange={setKeyboardShortcutsOpen}
    >
      <DialogTrigger>
        <div></div>
      </DialogTrigger>
      <DialogContent className="flex h-[90%] !max-w-max shrink gap-4 overflow-hidden">
        <div className="flex flex-1 overflow-y-auto">
          <div className="flex flex-col gap-5 p-4">
            <ShortcutTable
              shortcuts={CommonKeyboardShortcuts}
              title={t("kbd.shortcuts.common.title")}
            />
            <ShortcutTable
              shortcuts={DocumentKeyboardShortcuts}
              title={t("kbd.shortcuts.document.title")}
            />
          </div>
          <div className="flex-shrink-0 p-4">
            <ShortcutTable
              shortcuts={TableKeyboardShortcuts}
              title={t("kbd.shortcuts.table.title")}
            />
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
