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
      <DialogContent className="flex h-[90%] !max-w-max shrink gap-4 overflow-hidden">
        <div className="flex flex-1 overflow-y-auto">
          <div className="flex flex-col gap-5 p-4">
            <ShortcutTable
              shortcuts={CommonKeyboardShortcuts}
              title="Common Keyboard Shortcuts"
            />
            <ShortcutTable
              shortcuts={DocumentKeyboardShortcuts}
              title="Document Keyboard Shortcuts"
            />
          </div>
          <div className="flex-shrink-0 p-4">
            <ShortcutTable
              shortcuts={TableKeyboardShortcuts}
              title="Table(Grid View) Keyboard Shortcuts"
            />
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
