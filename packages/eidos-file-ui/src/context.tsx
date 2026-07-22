import { createContext, useContext, useMemo, type ReactNode } from "react"

import {
  translateEidosFileUI,
  type EidosFileUILocale,
  type EidosFileUIMessageOverrides,
  type EidosFileUIMessageValues,
} from "./i18n"

export type EidosFileUIThemeName = "light" | "dark"

export interface EidosFileUIHost {
  themeName: EidosFileUIThemeName
  locale: EidosFileUILocale
  translate(message: string, values?: EidosFileUIMessageValues): string
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

const defaultHost: EidosFileUIHost = {
  themeName: "light",
  locale: "en",
  translate: (message, values) => translateEidosFileUI("en", message, values),
  resolveAssetUrl: (path) => path,
  resolveFilePreview: defaultFilePreview,
}

const EidosFileUIContext = createContext<EidosFileUIHost>(defaultHost)
const EMPTY_MESSAGES: Partial<EidosFileUIMessageOverrides> = {}

export function EidosFileUIProvider({
  children,
  themeName = "light",
  locale = "en",
  messages = EMPTY_MESSAGES,
  translate: translateOverride,
  resolveAssetUrl = defaultHost.resolveAssetUrl,
  resolveFilePreview = defaultHost.resolveFilePreview,
}: Partial<EidosFileUIHost> & {
  children: ReactNode
  messages?: Partial<EidosFileUIMessageOverrides>
}) {
  const value = useMemo<EidosFileUIHost>(
    () => ({
      themeName,
      locale,
      translate:
        translateOverride ??
        ((message, values) =>
          translateEidosFileUI(locale, message, values, messages)),
      resolveAssetUrl,
      resolveFilePreview,
    }),
    [
      locale,
      messages,
      resolveAssetUrl,
      resolveFilePreview,
      themeName,
      translateOverride,
    ]
  )
  return (
    <EidosFileUIContext.Provider value={value}>
      {children}
    </EidosFileUIContext.Provider>
  )
}

export function useEidosFileUI(): EidosFileUIHost {
  return useContext(EidosFileUIContext)
}

export function resolveDefaultFilePreview(path: string): string {
  return defaultFilePreview(path)
}
