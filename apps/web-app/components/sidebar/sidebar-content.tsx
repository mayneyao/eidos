"use client"

import { detectDirective } from "@eidos.space/v3"
import { useTranslation } from "react-i18next"

import { useCurrentPathInfo } from "@/hooks/use-current-pathinfo"
import { useCurrentSpace, useCurrentSpaceId } from "@/hooks/use-current-space"
import { DEFAULT_TABS } from "@/hooks/use-tabs-kv"
import { getToday } from "@/lib/utils"
import { useMblock } from "@/apps/web-app/hooks/use-mblock"
import { useRouterAdapter } from "@/apps/web-app/hooks/use-router-adapter"
import { useExtensionStore } from "@/apps/web-app/store/extension-store"
import { useSidebarStore } from "@/apps/web-app/store/sidebar-store"

import { BlockApp } from "../block-renderer/block-app"
import { BuiltInSidebarBlockRenderer } from "../block-renderer/builtin-extension-renderer"
import FileTree from "../file-tree"
import { ExtensionSidebarHeader } from "./extensions/extension-sidebar-header"
import { FilesSidebar } from "./files"
import { SearchResults } from "./nodes/search-results"
import { TreeSidebarHeader } from "./nodes/tree-sidebar-header"
import { useTreeSidebarStore } from "./nodes/tree-sidebar-store"

const NodesContent = () => {
  const {
    isSearchMode,
    searchResults,
    searchTerm,
    selectedIndex,
    setSelectedIndex,
    isNodesExpanded,
    setIsNodesExpanded,
    isContentExpanded,
    setIsContentExpanded,
  } = useTreeSidebarStore()

  return (
    <div className="flex h-full w-full flex-col">
      <TreeSidebarHeader disableAdd={false} />
      <div className="flex-1 min-h-0 pr-2">
        {isSearchMode ? (
          <SearchResults
            type="nodes"
            searchResults={searchResults}
            searchTerm={searchTerm}
            selectedIndex={selectedIndex}
            setSelectedIndex={setSelectedIndex}
            isItemsExpanded={isNodesExpanded}
            setIsItemsExpanded={setIsNodesExpanded}
            isContentExpanded={isContentExpanded}
            setIsContentExpanded={setIsContentExpanded}
          />
        ) : (
          <FileTree rootDir="~/.eidos/__NODES__" />
        )}
      </div>
    </div>
  )
}

const ExtensionsContent = () => {
  const {
    isSearchMode,
    searchResults,
    searchTerm,
    selectedIndex,
    setSelectedIndex,
    isExtensionsExpanded,
    setIsExtensionsExpanded,
    isContentExpanded,
    setIsContentExpanded,
  } = useExtensionStore()

  return (
    <div className="flex h-full w-full flex-col">
      <ExtensionSidebarHeader />
      <div className="flex-1 min-h-0 pr-2">
        {isSearchMode ? (
          <SearchResults
            type="extensions"
            searchResults={searchResults}
            searchTerm={searchTerm}
            selectedIndex={selectedIndex}
            setSelectedIndex={setSelectedIndex}
            isItemsExpanded={isExtensionsExpanded}
            setIsItemsExpanded={setIsExtensionsExpanded}
            isContentExpanded={isContentExpanded}
            setIsContentExpanded={setIsContentExpanded}
          />
        ) : (
          <FileTree rootDir="~/.eidos/__EXTENSIONS__/" />
        )}
      </div>
    </div>
  )
}

const FilesContent = () => {
  return (
    <div className="flex h-full w-full flex-col pr-2">
      <FilesSidebar />
    </div>
  )
}

const BlockContent = ({ block }: { block: any }) => {
  const space = useCurrentSpaceId()
  if (!block.id) {
    return <div>Block not found</div>
  }
  return <BlockApp url={`block://${block.id}@${space}`} height={"100%"} />
}

const JournalsContent = () => {
  const { params } = useRouterAdapter()
  const { i18n } = useTranslation()
  const space = useCurrentSpaceId() || ""
  const currentDay = (params.day as string) || getToday()
  const locale = i18n.language || "en"
  return (
    <BuiltInSidebarBlockRenderer
      extensionSlug="journal"
      space={space}
      currentDay={currentDay}
      locale={locale}
    />
  )
}

const GraftContent = () => {
  const { i18n } = useTranslation()
  const { currentSpace } = useCurrentSpace()
  const space = useCurrentSpaceId() || ""
  const locale = i18n.language || "en"
  const syncEnabled = currentSpace?.sync?.enabled ?? false
  return (
    <BuiltInSidebarBlockRenderer
      extensionSlug="graft"
      space={space}
      currentDay={getToday()}
      locale={locale}
      syncEnabled={syncEnabled}
    />
  )
}

export const SidebarContent = () => {
  const { currentApp } = useSidebarStore()
  const block = useMblock(currentApp || "")

  const renderContent = () => {
    switch (currentApp) {
      case "extensions":
        return <ExtensionsContent />
      case "nodes":
        return <NodesContent />
      case "today":
        return <JournalsContent />
      case "files":
        return <FilesContent />
      case "graft":
        return <GraftContent />
      default:
        // Check if currentApp is a block ID with 'use sidebar' directive
        if (
          currentApp &&
          !DEFAULT_TABS.includes(currentApp) &&
          block &&
          block.code &&
          detectDirective(block.code, "use sidebar")
        ) {
          return <BlockContent block={block} />
        }
        return <NodesContent />
    }
  }

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {renderContent()}
    </div>
  )
}
