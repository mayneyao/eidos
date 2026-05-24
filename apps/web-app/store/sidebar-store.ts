import { create } from "zustand"

export type SidebarApp =
  | "nodes"
  | "extensions"
  | "today"
  | "files"
  | "graft"
  | string

export type TabId =
  | "nodes"
  | "extensions"
  | "today"
  | "files"
  | "graft"
  | string

export type SidebarTab = {
  id: TabId
  label: string
  icon: React.ComponentType<{ className?: string }>
  isNavigation?: boolean
  href?: string
}

// Tab configuration mapping
export const TAB_CONFIG: Record<string, Omit<SidebarTab, "id">> = {
  nodes: {
    label: "nodes",
    icon: () => null,
    isNavigation: false,
  },
  extensions: {
    label: "extensions",
    icon: () => null,
    isNavigation: false,
  },
  today: {
    label: "today",
    icon: () => null,
    isNavigation: true,
    href: "/journals",
  },
  files: {
    label: "files",
    icon: () => null,
    isNavigation: false,
  },
  graft: {
    label: "graft",
    icon: () => null,
    isNavigation: false,
  },
  agent: {
    label: "agent",
    icon: () => null,
    isNavigation: false,
  },
}

interface SidebarState {
  currentApp: SidebarApp
  setCurrentApp: (app: SidebarApp) => void
}

export const useSidebarStore = create<SidebarState>()((set) => ({
  currentApp: "nodes",
  setCurrentApp: (app) => set({ currentApp: app }),
}))
