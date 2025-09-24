import { create } from "zustand"

export type SidebarApp =
  | "nodes"
  | "extensions"
  | "everyday"

export type SidebarTab = {
  id: SidebarApp
  label: string
  icon: React.ComponentType<{ className?: string }>
  isNavigation?: boolean
  href?: string
}

interface SidebarState {
  currentApp: SidebarApp
  setCurrentApp: (app: SidebarApp) => void
  tabs: SidebarTab[]
}

export const useSidebarStore = create<SidebarState>()(
  (set) => ({
    currentApp: "nodes",
    setCurrentApp: (app) => set({ currentApp: app }),
    tabs: [
      {
        id: "nodes",
        label: "节点",
        icon: () => null,
        isNavigation: false,
      },
      {
        id: "extensions",
        label: "扩展",
        icon: () => null,
        isNavigation: false,
      },
      {
        id: "everyday",
        label: "每日",
        icon: () => null,
        isNavigation: true,
        href: "/everyday",
      },
    ],
  }),

)
