import type { NavigateFunction } from "react-router-dom"
import type {
  FileActionMeta,
  FileHandlerMeta,
  IExtension,
} from "@/packages/core/types/IExtension"

import { useOpenInFileManagerAction } from "./use-show-in-file-manager"
import { useScriptFunction } from "@/components/script-container/hook"

export interface FileItemActionsContext {
  /** 文件路径 */
  filePath: string
  /** 空间名称 */
  space: string
  /** 导航函数 */
  navigate: NavigateFunction
  /** 选中的文件处理器 (在 file-handler 页面) */
  selectedHandler?: IExtension<FileHandlerMeta> | null
  /** 块 ID (在 blocks 页面) */
  blockId?: string | null
  /** 是否在 file-handler 页面 */
  isFileHandlerPage?: boolean
  /** 是否在 blocks 页面 */
  isBlocksPage?: boolean
}

/**
 * Hook for file item actions - provides unified interface for file operations
 * used in context menus and dropdown menus
 */
export function useFileItemActions(context: FileItemActionsContext) {
  const {
    filePath,
    space,
    navigate,
    selectedHandler,
    blockId,
    isFileHandlerPage,
    isBlocksPage,
  } = context

  const { openInFileManager } = useOpenInFileManagerAction()
  const { callFunction } = useScriptFunction()

  /**
   * Open file in system's file manager
   */
  const handleOpenInFileManager = async () => {
    await openInFileManager(filePath)
  }

  /**
   * Open file with specific handler
   */
  const handleOpenWith = (
    handler: IExtension<FileHandlerMeta> & { _builtIn?: boolean }
  ) => {
    // Navigate to file handler page
    // For built-in handlers, add builtin=true query param to render directly (no iframe)
    if (handler._builtIn) {
      navigate(`/file-handler?handler=${handler.id}&builtin=true#${filePath}`)
    } else {
      navigate(`/file-handler?handler=${handler.id}#${filePath}`)
    }
  }

  /**
   * View extension details
   */
  const handleViewExtension = () => {
    if (isFileHandlerPage && selectedHandler) {
      navigate(`/extensions/${selectedHandler.id}`)
    } else if (isBlocksPage && blockId) {
      navigate(`/extensions/${blockId}`)
    }
  }

  /**
   * Execute file action
   */
  const handleExecuteFileAction = async (
    action: IExtension<FileActionMeta>
  ) => {
    await callFunction({
      input: { filePath },
      command: action.meta!.funcName,
      context: {},
      code: action.code,
      id: action.id,
      space,
      bindings: action.bindings,
    })
  }

  return {
    openInFileManager: handleOpenInFileManager,
    openWith: handleOpenWith,
    viewExtension: handleViewExtension,
    executeFileAction: handleExecuteFileAction,
  }
}
