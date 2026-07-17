import { createContext, useContext, useMemo, type ReactNode } from "react"

export type BaseUIThemeName = "light" | "dark"

export interface BaseUIHost {
  themeName: BaseUIThemeName
  resolveAssetUrl(path: string): string
  resolveFilePreview(path: string): string
}

function fileName(path: string): string {
  try {
    return decodeURIComponent(
      path.split(/[?#]/, 1)[0].split("/").at(-1) ?? path
    )
  } catch {
    return path.split("/").at(-1) ?? path
  }
}

function defaultFilePreview(path: string): string {
  if (/^(?:https?:|data:|blob:)/i.test(path)) return path
  const label = fileName(path).slice(0, 18)
  return `data:image/svg+xml,${encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="120" height="72"><rect width="100%" height="100%" rx="6" fill="#f1f1ef"/><text x="50%" y="52%" text-anchor="middle" font-family="system-ui" font-size="10" fill="#787774">${label.replace(/[<>&"']/g, "")}</text></svg>`
  )}`
}

const defaultHost: BaseUIHost = {
  themeName: "light",
  resolveAssetUrl: (path) => path,
  resolveFilePreview: defaultFilePreview,
}

const BaseUIContext = createContext<BaseUIHost>(defaultHost)

export function BaseUIProvider({
  children,
  themeName = "light",
  resolveAssetUrl = defaultHost.resolveAssetUrl,
  resolveFilePreview = defaultHost.resolveFilePreview,
}: Partial<BaseUIHost> & { children: ReactNode }) {
  const value = useMemo<BaseUIHost>(
    () => ({ themeName, resolveAssetUrl, resolveFilePreview }),
    [resolveAssetUrl, resolveFilePreview, themeName]
  )
  return (
    <BaseUIContext.Provider value={value}>{children}</BaseUIContext.Provider>
  )
}

export function useBaseUI(): BaseUIHost {
  return useContext(BaseUIContext)
}

export function resolveDefaultFilePreview(path: string): string {
  return defaultFilePreview(path)
}
