import { useEffect, useState } from "react"
import { useTranslation } from "react-i18next"

import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { useCurrentNode } from "@/apps/web-app/hooks/use-current-node"
import { useAppRuntimeStore } from "@/apps/web-app/store/runtime-store"

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
  const currentNode = useCurrentNode()
  const [activeTab, setActiveTab] = useState("common")

  useEffect(() => {
    // TODO: Replace 'type' and specific type strings with actual values from currentNode
    if (currentNode?.type === "doc") {
      setActiveTab("document")
    } else if (currentNode?.type === "table") {
      setActiveTab("table")
    } else {
      setActiveTab("common")
    }
  }, [currentNode?.type])

  return (
    <Dialog
      open={isKeyboardShortcutsOpen}
      onOpenChange={setKeyboardShortcutsOpen}
    >
      <DialogTrigger>
        <div></div>
      </DialogTrigger>
      <DialogContent className="flex h-[90%] min-w-[80%] shrink flex-col gap-4 overflow-hidden">
        <Tabs
          value={activeTab}
          onValueChange={setActiveTab}
          className="flex h-full flex-col overflow-hidden"
        >
          <TabsList className="shrink-0 justify-start">
            <TabsTrigger value="common">
              {t("kbd.shortcuts.common.title")}
            </TabsTrigger>
            <TabsTrigger value="document">
              {t("kbd.shortcuts.document.title")}
            </TabsTrigger>
            <TabsTrigger value="table">
              {t("kbd.shortcuts.table.title")}
            </TabsTrigger>
          </TabsList>
          <div className="flex-1 overflow-y-auto">
            <TabsContent value="common">
              <ShortcutTable
                shortcuts={CommonKeyboardShortcuts}
                title={t("kbd.shortcuts.common.title")}
              />
            </TabsContent>
            <TabsContent value="document">
              <ShortcutTable
                shortcuts={DocumentKeyboardShortcuts}
                title={t("kbd.shortcuts.document.title")}
              />
            </TabsContent>
            <TabsContent value="table">
              <ShortcutTable
                shortcuts={TableKeyboardShortcuts}
                title={t("kbd.shortcuts.table.title")}
              />
            </TabsContent>
          </div>
        </Tabs>
      </DialogContent>
    </Dialog>
  )
}
