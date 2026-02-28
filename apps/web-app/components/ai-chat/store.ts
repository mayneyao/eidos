import { create } from "zustand"
import { persist } from "zustand/middleware"
import type { ITreeNode } from "@/packages/core/types/ITreeNode"

type Store = {
  currentSysPrompt: string
  setCurrentSysPrompt: (value: string) => void
  enabledTools: Record<string, Record<string, boolean>>
  getEnabledTools: (space: string) => Record<string, boolean>
  setEnabledTools: (space: string, tools: Record<string, boolean>) => void
  toggleTool: (space: string, toolName: string) => void
  maxSteps: Record<string, number>
  getMaxSteps: (space: string) => number
  setMaxSteps: (space: string, steps: number) => void
  contextNodes: ITreeNode[]
  setContextNodes: (nodes: ITreeNode[]) => void
  addContextNode: (node: ITreeNode) => void
  removeContextNode: (nodeId: string) => void
  clearContextNodes: () => void
}

export const useAIChatStore = create<Store>()(
  persist(
    (set, get) => ({
      currentSysPrompt: "base",
      setCurrentSysPrompt: (value) => set(() => ({ currentSysPrompt: value })),
      enabledTools: {},
      getEnabledTools: (space: string) => {
        return get().enabledTools[space] || {}
      },
      setEnabledTools: (space: string, tools: Record<string, boolean>) => {
        set((state) => ({
          enabledTools: {
            ...state.enabledTools,
            [space]: tools,
          },
        }))
      },
      toggleTool: (space: string, toolName: string) => {
        set((state) => {
          const spaceTools = state.enabledTools[space] || {}
          return {
            enabledTools: {
              ...state.enabledTools,
              [space]: {
                ...spaceTools,
                [toolName]: !spaceTools[toolName],
              },
            },
          }
        })
      },
      maxSteps: {},
      getMaxSteps: (space: string) => {
        return get().maxSteps[space] || 5
      },
      setMaxSteps: (space: string, steps: number) => {
        set((state) => ({
          maxSteps: {
            ...state.maxSteps,
            [space]: steps,
          },
        }))
      },
      contextNodes: [],
      setContextNodes: (nodes: ITreeNode[]) => {
        console.log("Setting context nodes:", nodes.length)
        set(() => ({ contextNodes: nodes }))
      },
      addContextNode: (node: ITreeNode) => {
        if (!node || !node.id) {
          console.warn("Invalid node provided to addContextNode:", node)
          return
        }

        set((state) => {
          // Check if the node already exists to avoid duplicates
          const exists = state.contextNodes.some((n) => n.id === node.id)
          if (exists) {
            console.log("Context node already exists:", node.name, node.id)
            return state
          }

          console.log("Adding new context node:", node.name, node.id)
          return {
            contextNodes: [...state.contextNodes, node],
          }
        })
      },
      removeContextNode: (nodeId: string) => {
        if (!nodeId) {
          console.warn("Invalid nodeId provided to removeContextNode:", nodeId)
          return
        }

        set((state) => {
          const nodeExists = state.contextNodes.some(
            (node) => node.id === nodeId
          )
          if (!nodeExists) {
            console.log("Context node not found for removal:", nodeId)
            return state
          }

          console.log("Removing context node:", nodeId)
          return {
            contextNodes: state.contextNodes.filter(
              (node) => node.id !== nodeId
            ),
          }
        })
      },
      clearContextNodes: () => {
        set(() => ({ contextNodes: [] }))
      },
    }),
    {
      name: "ai-chat-store",
      getStorage: () => localStorage,
      partialize: (state) => ({
        enabledTools: state.enabledTools,
        maxSteps: state.maxSteps,
        contextNodes: state.contextNodes,
      }),
    }
  )
)
