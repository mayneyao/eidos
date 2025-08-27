"use client"

import { useEffect, useState } from "react"
import { useDebounceFn, useKeyPress } from "ahooks"
import {
  Bot,
  Clock3Icon,
  FilePlus2Icon,
  PaintBucket,
  Palette,
  RefreshCcwIcon,
  Settings,
  Wand2,
} from "lucide-react"
import { useTheme } from "next-themes"
import { useTranslation } from "react-i18next"

import { isDesktopMode, isInkServiceMode } from "@/lib/env"
import { getToday } from "@/lib/utils"
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
import { useCurrentNode } from "@/apps/web-app/hooks/use-current-node"
import { useCurrentPathInfo } from "@/apps/web-app/hooks/use-current-pathinfo"
import { useQueryNode } from "@/apps/web-app/hooks/use-query-node"
import { useSqlite } from "@/apps/web-app/hooks/use-sqlite"
import { useLastOpened } from "@/apps/web-app/pages/[database]/hook"
import { useSpaceAppStore } from "@/apps/web-app/pages/[database]/store"
import { useAppRuntimeStore } from "@/apps/web-app/store/runtime-store"

import { ThemeStudio } from "../theme-studio"
// import { ExtensionCommandItems } from "./extension"
import { useCMDKGoto, useCMDKStore, useInput } from "./hooks"
import { NodeCommandItems } from "./nodes"
import { SecondaryView } from "./secondary-view"
import { SpaceCommandItems } from "./spaces"

type SecondaryView = {
  component: React.ReactNode
  title: string
} | null

export function CommandDialogDemo() {
  const { isCmdkOpen, setCmdkOpen, isGodMode, setGodMode } =
    useAppRuntimeStore()
  const { input, setInput, mode } = useInput()
  const { queryNodes, fullTextSearch } = useQueryNode()
  const { theme, setTheme } = useTheme()
  const { space } = useCurrentPathInfo()
  const { setSearchNodes } = useCMDKStore()
  const [secondaryView, setSecondaryView] = useState<SecondaryView>(null)

  const currentNode = useCurrentNode()

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

  const { createDoc, rebuildFTS } = useSqlite()
  const goto = useCMDKGoto()
  const goEveryday = goto(`/${lastOpenedDatabase}/everyday`)

  const today = getToday()
  const goToday = goto(`/${lastOpenedDatabase}/everyday/${today}`)
  const goShare = goto("/share")

  const switchTheme = () => {
    const newTheme = theme === "light" ? "dark" : "light"
    setTheme(newTheme)
  }

  const toggleGodMode = () => {
    setGodMode(!isGodMode)
    setCmdkOpen(false)
  }

  const rebuildTableFTS = async (id: string) => {
    if (currentNode?.type === "table") {
      await rebuildFTS(id)
      setCmdkOpen(false)
    }
  }

  const toggleAI = () => {
    setCmdkOpen(false)
    setIsAiOpen(!isAiOpen)
  }

  const createNewDoc = async () => {
    const docId = await createDoc("")
    goto(`/${lastOpenedDatabase}/${docId}`)()
  }

  const { t } = useTranslation()

  return (
    <CommandDialog open={isCmdkOpen} onOpenChange={setCmdkOpen}>
      {secondaryView ? (
        <SecondaryView
          component={secondaryView.component}
          title={secondaryView.title}
          onBack={() => setSecondaryView(null)}
        />
      ) : (
        <>
          <CommandInput
            placeholder={t("cmdk.inputPlaceholder")}
            value={input}
            onValueChange={setInput}
            autoFocus
          />
          <CommandList>
            <CommandEmpty>
              <span>{t("cmdk.notFound", { input })}</span>
            </CommandEmpty>

            {mode === "search" && (
              <>
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

                {isDesktopMode && currentNode?.type === "table" && (
                  <CommandGroup heading={t("cmdk.table")}>
                    <CommandItem
                      onSelect={() => {
                        rebuildTableFTS(currentNode.id)
                      }}
                      value="rebuild fts"
                    >
                      <RefreshCcwIcon className="mr-2 h-4 w-4" />
                      <span>{t("cmdk.rebuildFTS")}</span>
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
              </>
            )}

            <CommandSeparator />
            <CommandGroup heading={t("common.settings")}>
              <CommandItem onSelect={switchTheme}>
                <Palette className="mr-2 h-4 w-4" />
                <span>{t("cmdk.switchTheme")}</span>
                <CommandShortcut>⌘+Shift+L</CommandShortcut>
              </CommandItem>
              <CommandItem onSelect={toggleGodMode}>
                <Wand2 className="mr-2 h-4 w-4" />
                <span>
                  {isGodMode
                    ? t("cmdk.disableGodMode", "Disable Creator Mode")
                    : t("cmdk.enableGodMode", "Enable Creator Mode")}
                </span>
              </CommandItem>
              <CommandItem
                onSelect={() => {
                  setSecondaryView({
                    component: <ThemeStudio />,
                    title: t("cmdk.themeStudio", "Theme Studio"),
                  })
                }}
              >
                <PaintBucket className="mr-2 h-4 w-4" />
                <span>{t("cmdk.themeStudio", "Theme Studio")}</span>
              </CommandItem>
              {!isInkServiceMode && (
                <CommandItem onSelect={goto("/settings")}>
                  <Settings className="mr-2 h-4 w-4" />
                  <span>{t("common.settings")}</span>
                </CommandItem>
              )}
            </CommandGroup>
          </CommandList>
        </>
      )}
    </CommandDialog>
  )
}
