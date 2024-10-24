"use client"

import { useEffect } from "react"
import { useDebounceFn, useKeyPress } from "ahooks"
import { Bot, Clock3Icon, FilePlus2Icon, Palette, Settings } from "lucide-react"
import { useTheme } from "next-themes"
import { useTranslation } from "react-i18next"

import { isInkServiceMode } from "@/lib/env"
import { useAppRuntimeStore } from "@/lib/store/runtime-store"
import { getToday } from "@/lib/utils"
import { useCurrentPathInfo } from "@/hooks/use-current-pathinfo"
import { useQueryNode } from "@/hooks/use-query-node"
import { useSqlite } from "@/hooks/use-sqlite"
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut,
} from "@/components/ui/command"
import { useLastOpened } from "@/apps/web-app/[database]/hook"
import { useSpaceAppStore } from "@/apps/web-app/[database]/store"

import { ActionList } from "./action"
// import { ExtensionCommandItems } from "./extension"
import { useCMDKGoto, useCMDKStore, useInput } from "./hooks"
import { NodeCommandItems } from "./nodes"
import { ScriptList } from "./script"
import { SpaceCommandItems } from "./spaces"

export function CommandDialogDemo() {
  const { isCmdkOpen, setCmdkOpen } = useAppRuntimeStore()
  const { input, setInput, mode } = useInput()
  const { queryNodes, fullTextSearch } = useQueryNode()
  const { theme, setTheme } = useTheme()
  const { space } = useCurrentPathInfo()
  const { setSearchNodes } = useCMDKStore()
  useKeyPress(["ctrl.k", "meta.k"], (e) => {
    e.preventDefault()
    setCmdkOpen(!isCmdkOpen)
  })

  const updateSearchNodes = async (qs: string) => {
    if (mode !== "search") {
      return
    }
    if (qs.length > 0) {
      const nodes = await queryNodes(qs)
      const ftsNodes = await fullTextSearch(qs)
      setSearchNodes([...(ftsNodes || []), ...(nodes || [])])
    }
  }
  const { run } = useDebounceFn(updateSearchNodes, { wait: 500 })

  useEffect(() => {
    space && run(input)
  }, [input, run, space])

  const { isRightPanelOpen: isAiOpen, setIsRightPanelOpen: setIsAiOpen } =
    useSpaceAppStore()
  const { lastOpenedDatabase } = useLastOpened()

  const { createDoc } = useSqlite()
  const goto = useCMDKGoto()
  const goEveryday = goto(`/${lastOpenedDatabase}/everyday`)

  const today = getToday()
  const goToday = goto(`/${lastOpenedDatabase}/everyday/${today}`)
  const goShare = goto("/share")

  const switchTheme = () => {
    setTheme(theme === "light" ? "dark" : "light")
  }

  const toggleAI = () => {
    setCmdkOpen(false)
    setIsAiOpen(!isAiOpen)
  }

  const createNewDoc = async () => {
    const docId = await createDoc("")
    goto(`/${lastOpenedDatabase}/${docId}`)()
  }

  if (mode === "action") {
    return <ScriptList />
  }
  if (mode === "syscall") {
    return <ActionList />
  }

  const { t } = useTranslation()

  return (
    <CommandDialog open={isCmdkOpen} onOpenChange={setCmdkOpen}>
      <CommandInput
        placeholder={t("cmdk.inputPlaceholder")}
        value={input}
        onValueChange={setInput}
      />
      <CommandList>
        <CommandEmpty>
          <span>{t("cmdk.notFound", { input })}</span>
        </CommandEmpty>
        {!isInkServiceMode && (
          <CommandGroup heading={t("cmdk.suggestions")}>
            <CommandItem onSelect={goToday} value="today">
              <Clock3Icon className="mr-2 h-4 w-4" />
              <span>{t("common.today")}</span>
            </CommandItem>
            <CommandItem onSelect={createNewDoc} value="new draft doc">
              <FilePlus2Icon className="mr-2 h-4 w-4" />
              <span>{t("cmdk.newDraftDoc")}</span>
            </CommandItem>
            <CommandItem onSelect={toggleAI}>
              <Bot className="mr-2 h-4 w-4" />
              <span>{t("common.ai")}</span>
            </CommandItem>
          </CommandGroup>
        )}

        <CommandSeparator />
        {!isInkServiceMode && (
          <>
            <NodeCommandItems />
            <SpaceCommandItems />
          </>
        )}
        <CommandGroup heading={t("common.settings")}>
          <CommandItem onSelect={switchTheme}>
            <Palette className="mr-2 h-4 w-4" />
            <span>{t("cmdk.switchTheme")}</span>
            <CommandShortcut>⌘+Shift+L</CommandShortcut>
          </CommandItem>
          {!isInkServiceMode && (
            <CommandItem onSelect={goto("/settings")}>
              <Settings className="mr-2 h-4 w-4" />
              <span>{t("common.settings")}</span>
            </CommandItem>
          )}
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  )
}
