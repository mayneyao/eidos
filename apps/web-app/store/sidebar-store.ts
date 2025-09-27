import { create } from "zustand"

export type SidebarApp =
  | "nodes"
  | "extensions"
  | "today"
  | string

export type TabId = "nodes" | "extensions" | "today" | string

export type SidebarTab = {
  id: TabId
  label: string
  icon: React.ComponentType<{ className?: string }>
  isNavigation?: boolean
  href?: string
}

// Tab configuration mapping
export const TAB_CONFIG: Record<string, Omit<SidebarTab, 'id'>> = {
  nodes: {
    label: "节点",
    icon: () => null,
    isNavigation: false,
  },
  extensions: {
    label: "扩展", 
    icon: () => null,
    isNavigation: false,
  },
  today: {
    label: "每日",
    icon: () => null,
    isNavigation: true,
    href: "/everyday",
  },
}

interface SidebarState {
  currentApp: SidebarApp
  setCurrentApp: (app: SidebarApp) => void
}

export const useSidebarStore = create<SidebarState>()(
  (set) => ({
    currentApp: "nodes",
    setCurrentApp: (app) => set({ currentApp: app }),
  }),
)
