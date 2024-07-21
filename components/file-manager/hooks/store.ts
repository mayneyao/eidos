import { create } from "zustand"


interface RootDirState {
  rootDir: FileSystemDirectoryHandle | null
  setRootDir: (dir: FileSystemDirectoryHandle | null) => void

  currentDir: FileSystemDirectoryHandle | null
  setCurrentDir: (dir: FileSystemDirectoryHandle | null) => void

  search?: string
  setSearch: (search: string) => void

  paths: string[]
  setPaths: (paths: string[]) => void
}

export const useRootDirStore = create<RootDirState>((set) => ({
  rootDir: null,
  currentDir: null,
  search: "",
  setSearch: (search) => set({ search }),
  paths: [],
  setPaths: (paths) => set({ paths }),
  setCurrentDir(dir) {
    set({ currentDir: dir })
  },
  setRootDir: (dir?) => set({ rootDir: dir }),
}))
