import { useAppRuntimeStore } from "@/lib/store/runtime-store"
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog"

import {
  CommonKeyboardShortcuts,
  DocumentKeyboardShortcuts,
  TableKeyboardShortcuts,
} from "./const"
import { ShortcutTable } from "./shortcut-table"

export function KeyboardShortCuts() {
  const { isKeyboardShortcutsOpen, setKeyboardShortcutsOpen } =
    useAppRuntimeStore()
  return (
    <Dialog
      open={isKeyboardShortcutsOpen}
      onOpenChange={setKeyboardShortcutsOpen}
    >
      <DialogTrigger>
        <div></div>
      </DialogTrigger>
      <DialogContent className=" flex h-[90%] !max-w-max shrink gap-4">
        <div className="flex flex-col gap-5">
          <ShortcutTable
            shortcuts={CommonKeyboardShortcuts}
            title="Common Keyboard Shortcuts"
          />
          <ShortcutTable
            shortcuts={DocumentKeyboardShortcuts}
            title="Document Keyboard Shortcuts"
          />
        </div>
        <ShortcutTable
          shortcuts={TableKeyboardShortcuts}
          title="Table(Gird View) Keyboard Shortcuts"
        />
      </DialogContent>
    </Dialog>
  )
}
