import {
  useCallback,
  useMemo,
  useRef,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react"
import {
  AlertCircle,
  LoaderCircle,
  PanelLeftClose,
  Settings,
} from "lucide-react"

import { cn } from "@/lib/utils"
import { isMacDesktop } from "@/lib/web/helper"
import { useFileSpaceAgentSessionActivities } from "@/apps/web-app/components/file-space-agent/session-activity"
import { useCurrentSpace } from "@/apps/web-app/hooks/use-current-space"
import { useRouterAdapter } from "@/apps/web-app/hooks/use-router-adapter"
import { useSpace } from "@/apps/web-app/hooks/use-space"
import { useSpaceVersioning } from "@/apps/web-app/hooks/use-space-versioning"
import { SpaceSelect } from "@/components/space-select"
import { SettingsSidebar } from "@/apps/web-app/components/settings/settings-sidebar"
import { isSettingsUrl } from "@/apps/web-app/components/settings/settings-navigation"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  useSidebar,
} from "@/components/ui/sidebar"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"

import { AgentModePanel } from "./agent-mode-panel"
import { DocumentNavigationPanel } from "./document-navigation-panel"
import { filePathFromSpaceUrl } from "./file-path"
import { navigateAfterFlushingSpaceFile } from "./file-navigation"
import { FileSpaceTree } from "./file-tree"
import { useFileSpaceWorkModes } from "./use-file-space-work-modes"
import {
  FILE_SPACE_WORK_MODES,
  fileSpaceAgentConversationId,
  type FileSpaceWorkMode,
} from "./work-modes"
import { VersionPanel } from "./versioning/version-panel"

function modePanelId(mode: FileSpaceWorkMode) {
  return `file-space-${mode}-panel`
}

function modeTabId(mode: FileSpaceWorkMode) {
  return `file-space-${mode}-mode`
}

export function FileSpaceSidebar() {
  const { currentSpace } = useCurrentSpace()
  const { spaceList } = useSpace()
  const { navigate, location } = useRouterAdapter()
  const { setOpen: setSidebarOpen, toggle: toggleSidebar, width } = useSidebar()
  const agentActivities = useFileSpaceAgentSessionActivities()
  const modeButtonRefs = useRef<
    Partial<Record<FileSpaceWorkMode, HTMLButtonElement | null>>
  >({})
  const settingsActive = isSettingsUrl(location.pathname)
  const showModeLabels = width >= 280
  const macDesktop = isMacDesktop()
  const versionBridgeAvailable =
    typeof window !== "undefined" && Boolean(window.eidos?.spaceVersioning)
  const agentBridgeAvailable =
    typeof window !== "undefined" && Boolean(window.eidos?.fileSpaceAgent)
  const { status: versionStatus, operation: versionOperation } =
    useSpaceVersioning(currentSpace?.id, {
      active: Boolean(currentSpace?.id && versionBridgeAvailable),
    })
  const revealSidebar = useCallback(
    () => setSidebarOpen(true),
    [setSidebarOpen]
  )
  const {
    activeMode,
    visitedModes,
    transitionBusy: modeTransitionBusy,
    agentTabs,
    modeAvailable,
    activateWorkMode,
    activateAgentConversation,
    startAgentConversation,
  } = useFileSpaceWorkModes({
    spaceId: currentSpace?.id,
    settingsActive,
    versionAvailable: versionBridgeAvailable,
    agentAvailable: agentBridgeAvailable,
    revealSidebar,
  })
  const agentSessionIds = useMemo(
    () =>
      agentTabs.flatMap((tab) => {
        const conversationId = fileSpaceAgentConversationId(tab.url)
        return conversationId ? [conversationId] : []
      }),
    [agentTabs]
  )
  const agentRunningCount = agentSessionIds.filter((conversationId) => {
    const status = agentActivities[conversationId]?.status
    return status === "queued" || status === "running"
  }).length
  const agentAttentionCount = agentSessionIds.filter((conversationId) => {
    const status = agentActivities[conversationId]?.status
    return status === "waiting-approval" || status === "failed"
  }).length
  const versionChangeCount = versionStatus?.changes.length ?? 0
  const versionConflictCount =
    versionStatus?.changes.filter(
      (change) => change.conflicted || change.status === "conflicted"
    ).length ?? 0

  const handleModeKeyDown = useCallback(
    (
      event: ReactKeyboardEvent<HTMLButtonElement>,
      currentMode: FileSpaceWorkMode
    ) => {
      if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) {
        return
      }
      const availableModes = FILE_SPACE_WORK_MODES.filter(({ id }) =>
        modeAvailable(id)
      )
      const currentIndex = availableModes.findIndex(
        ({ id }) => id === currentMode
      )
      if (currentIndex < 0) return
      const targetIndex =
        event.key === "Home"
          ? 0
          : event.key === "End"
            ? availableModes.length - 1
            : event.key === "ArrowRight"
              ? (currentIndex + 1) % availableModes.length
              : (currentIndex - 1 + availableModes.length) %
                availableModes.length
      const targetMode = availableModes[targetIndex]?.id
      if (!targetMode) return
      event.preventDefault()
      void activateWorkMode(targetMode).then((activated) => {
        if (activated) modeButtonRefs.current[targetMode]?.focus()
      })
    },
    [activateWorkMode, modeAvailable]
  )

  if (!currentSpace) return null

  if (settingsActive) {
    return (
      <Sidebar>
        <SettingsSidebar />
      </Sidebar>
    )
  }

  const openSpaceSettings = async () => {
    const currentFilePath = filePathFromSpaceUrl(
      location.pathname + location.search + location.hash
    )
    const saved = await navigateAfterFlushingSpaceFile({
      spaceId: currentSpace.id,
      currentFilePath,
      destination: "/settings/space-general",
      navigate,
    })
    if (!saved) {
      window.alert(
        "Eidos could not save the current file. Resolve the error before leaving it."
      )
    }
  }

  const modeStatus = (mode: FileSpaceWorkMode) => {
    if (mode === "version") {
      if (versionOperation) {
        return (
          <LoaderCircle
            className="h-3 w-3 animate-spin motion-reduce:animate-none"
            aria-label="Version operation in progress"
          />
        )
      }
      if (versionConflictCount > 0) {
        return (
          <span
            className="flex items-center gap-0.5 text-destructive"
            aria-label={`${versionConflictCount} version conflicts`}
          >
            <AlertCircle className="h-3 w-3" />
            <span className="text-[9px] font-semibold tabular-nums">
              {versionConflictCount}
            </span>
          </span>
        )
      }
      if (versionChangeCount > 0) {
        return (
          <span
            className="min-w-3 rounded-full bg-sidebar-accent px-1 text-center text-[9px] font-semibold tabular-nums text-sidebar-accent-foreground"
            aria-label={`${versionChangeCount} version changes`}
          >
            {versionChangeCount > 99 ? "99+" : versionChangeCount}
          </span>
        )
      }
    }
    if (mode === "agent") {
      if (agentAttentionCount > 0) {
        return (
          <span
            className="flex items-center gap-0.5 text-amber-700 dark:text-amber-300"
            aria-label={`${agentAttentionCount} Agent sessions need attention`}
          >
            <AlertCircle className="h-3 w-3" />
            <span className="text-[9px] font-semibold tabular-nums">
              {agentAttentionCount}
            </span>
          </span>
        )
      }
      if (agentRunningCount > 0) {
        return (
          <span
            className="flex items-center gap-0.5"
            aria-label={`${agentRunningCount} Agent sessions running`}
          >
            <LoaderCircle className="h-3 w-3 animate-spin motion-reduce:animate-none" />
            <span className="text-[9px] font-semibold tabular-nums">
              {agentRunningCount}
            </span>
          </span>
        )
      }
    }
    return null
  }

  const modeStatusText = (mode: FileSpaceWorkMode) => {
    if (mode === "version") {
      if (!versionBridgeAvailable) return "Desktop versioning unavailable"
      if (versionConflictCount > 0) {
        return `${versionConflictCount} conflict${versionConflictCount === 1 ? "" : "s"}`
      }
      if (versionChangeCount > 0) {
        return `${versionChangeCount} change${versionChangeCount === 1 ? "" : "s"}`
      }
      return versionStatus?.enabled ? "Clean" : "Not enabled"
    }
    if (mode === "agent") {
      if (!agentBridgeAvailable) return "Desktop Agent unavailable"
      if (agentAttentionCount > 0) {
        return `${agentAttentionCount} need attention`
      }
      if (agentRunningCount > 0) return `${agentRunningCount} running`
      return agentTabs.length > 0
        ? `${agentTabs.length} open session${agentTabs.length === 1 ? "" : "s"}`
        : "No open sessions"
    }
    return "Default mode"
  }

  return (
    <Sidebar>
      <SidebarHeader
        className={cn(
          "eidos-shell-titlebar drag-region shrink-0 border-b border-sidebar-border/60 bg-muted/60 px-1 py-0",
          macDesktop && "!pl-[72px]"
        )}
      >
        <TooltipProvider delayDuration={350}>
          <nav
            className="flex h-full min-w-0 items-center gap-1"
            aria-label="Space work modes"
          >
            <div
              className="flex min-w-0 flex-1 items-center gap-0.5"
              role="tablist"
              aria-label="Space work modes"
              aria-orientation="horizontal"
              style={{ WebkitAppRegion: "no-drag" } as CSSProperties}
            >
              {FILE_SPACE_WORK_MODES.map((mode) => {
                const Icon = mode.icon
                const selected = mode.id === activeMode
                const available = modeAvailable(mode.id)
                const shortcut = `${macDesktop ? "⌘" : "Ctrl"}+${mode.shortcut}`
                const tooltip = `${mode.label} · ${shortcut} · ${modeStatusText(mode.id)}`
                return (
                  <Tooltip key={mode.id}>
                    <TooltipTrigger asChild>
                      <span className="flex min-w-0 flex-1">
                        <button
                          ref={(element) => {
                            modeButtonRefs.current[mode.id] = element
                          }}
                          type="button"
                          id={modeTabId(mode.id)}
                          role="tab"
                          aria-controls={modePanelId(mode.id)}
                          aria-selected={selected}
                          aria-label={`${mode.label} mode (${shortcut})`}
                          aria-keyshortcuts={`Meta+${mode.shortcut} Control+${mode.shortcut}`}
                          tabIndex={selected ? 0 : -1}
                          disabled={!available || modeTransitionBusy}
                          className={cn(
                            "relative flex h-7 min-w-0 flex-1 items-center justify-center gap-1 rounded-[3px] px-1 text-[10px] font-medium outline-hidden transition-colors motion-reduce:transition-none",
                            selected
                              ? "bg-sidebar-accent text-sidebar-accent-foreground after:absolute after:inset-x-1 after:bottom-0 after:h-px after:bg-sidebar-foreground/65"
                              : "text-sidebar-foreground/55 hover:bg-sidebar-accent/70 hover:text-sidebar-accent-foreground",
                            "focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-sidebar-ring disabled:cursor-not-allowed disabled:opacity-40"
                          )}
                          title={tooltip}
                          onClick={() => void activateWorkMode(mode.id)}
                          onKeyDown={(event) =>
                            handleModeKeyDown(event, mode.id)
                          }
                        >
                          <Icon className="h-3.5 w-3.5 shrink-0" />
                          {showModeLabels ? (
                            <span className="truncate">{mode.label}</span>
                          ) : (
                            <span className="sr-only">{mode.label}</span>
                          )}
                          {modeStatus(mode.id)}
                        </button>
                      </span>
                    </TooltipTrigger>
                    <TooltipContent
                      side="bottom"
                      className="px-2 py-1 text-[11px]"
                    >
                      {tooltip}
                    </TooltipContent>
                  </Tooltip>
                )
              })}
            </div>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  className="flex h-7 w-7 shrink-0 items-center justify-center rounded-[3px] text-sidebar-foreground/55 outline-hidden transition-colors motion-reduce:transition-none hover:bg-sidebar-accent/70 hover:text-sidebar-accent-foreground focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-sidebar-ring"
                  style={{ WebkitAppRegion: "no-drag" } as CSSProperties}
                  aria-label="Hide sidebar"
                  onClick={toggleSidebar}
                >
                  <PanelLeftClose className="h-3.5 w-3.5" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="px-2 py-1 text-[11px]">
                Hide sidebar
              </TooltipContent>
            </Tooltip>
          </nav>
        </TooltipProvider>
      </SidebarHeader>
      <SidebarContent className="px-0 py-0">
        <section
          id={modePanelId("files")}
          role="tabpanel"
          aria-labelledby={modeTabId("files")}
          aria-hidden={activeMode !== "files"}
          className={cn(
            "h-full min-h-0",
            activeMode === "files" ? "flex flex-col" : "hidden"
          )}
        >
          <div className="min-h-0 flex-1">
            <FileSpaceTree spaceId={currentSpace.id} />
          </div>
          <DocumentNavigationPanel spaceId={currentSpace.id} />
        </section>
        {visitedModes.has("version") ? (
          <section
            id={modePanelId("version")}
            role="tabpanel"
            aria-labelledby={modeTabId("version")}
            aria-hidden={activeMode !== "version"}
            className={cn(
              "h-full min-h-0",
              activeMode === "version" ? "block" : "hidden"
            )}
          >
            <VersionPanel spaceId={currentSpace.id} />
          </section>
        ) : null}
        {visitedModes.has("agent") ? (
          <section
            id={modePanelId("agent")}
            role="tabpanel"
            aria-labelledby={modeTabId("agent")}
            aria-hidden={activeMode !== "agent"}
            className={cn(
              "h-full min-h-0",
              activeMode === "agent" ? "block" : "hidden"
            )}
          >
            <AgentModePanel
              busy={modeTransitionBusy}
              onNewConversation={() => void startAgentConversation()}
              onSelectConversation={(tabId) =>
                void activateAgentConversation(tabId)
              }
            />
          </section>
        ) : null}
      </SidebarContent>
      <SidebarFooter className="eidos-shell-statusbar shrink-0 p-1.5">
        <div className="flex min-w-0 items-center gap-1">
          <div className="min-w-0 flex-1">
            <SpaceSelect spaces={spaceList} variant="sidebar-footer" />
          </div>
          <button
            type="button"
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-sm text-sidebar-foreground/60 outline-hidden hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:ring-1 focus-visible:ring-sidebar-ring"
            title="Space settings"
            aria-label="Space settings"
            onClick={() => void openSpaceSettings()}
          >
            <Settings className="h-3.5 w-3.5" />
          </button>
        </div>
      </SidebarFooter>
    </Sidebar>
  )
}
