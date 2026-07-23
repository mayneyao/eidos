import { createContext, useContext, useMemo, type ReactNode } from "react"
import type {
  AssetLease,
  HostServiceCapabilities,
  HostServices,
  HostSessionState,
  RequestContext,
} from "@eidos.space/eidos-file"

import {
  translateEidosFileUI,
  type EidosFileUILocale,
  type EidosFileUIMessageOverrides,
  type EidosFileUIMessageValues,
} from "./i18n"

export type EidosFileUIThemeName = "light" | "dark"

/** Framework-native consumer of a Host-scoped asset lease. */
export interface AssetPresenter<Surface> {
  renderImage(request: {
    sessionId: string
    lease: AssetLease
    altText: string
  }): Surface
  /** Optional Canvas-native image source used by Grid thumbnail renderers. */
  loadImage?(request: {
    sessionId: string
    lease: AssetLease
    altText: string
  }): Promise<CanvasImageSource>
  activate(
    request: {
      sessionId: string
      lease: AssetLease
      action: "open" | "download"
    },
    context: RequestContext
  ): Promise<void>
}

/** Active Host binding for one Eidos File session. */
export interface EidosFileUIAssetSession {
  services: HostServices
  serviceCapabilities: HostServiceCapabilities
  state: HostSessionState
}

export interface EidosFileUIHost {
  themeName: EidosFileUIThemeName
  locale: EidosFileUILocale
  translate(message: string, values?: EidosFileUIMessageValues): string
  assetSession?: EidosFileUIAssetSession
  assetPresenter?: AssetPresenter<ReactNode>
}

const defaultHost: EidosFileUIHost = {
  themeName: "light",
  locale: "en",
  translate: (message, values) => translateEidosFileUI("en", message, values),
}

const EidosFileUIContext = createContext<EidosFileUIHost>(defaultHost)
const EMPTY_MESSAGES: Partial<EidosFileUIMessageOverrides> = {}

export function EidosFileUIProvider({
  children,
  themeName,
  locale,
  messages = EMPTY_MESSAGES,
  translate: translateOverride,
  assetSession,
  assetPresenter,
}: Partial<EidosFileUIHost> & {
  children: ReactNode
  messages?: Partial<EidosFileUIMessageOverrides>
}) {
  const parent = useContext(EidosFileUIContext)
  const resolvedThemeName = themeName ?? parent.themeName
  const resolvedLocale = locale ?? parent.locale
  const resolvedAssetSession = assetSession ?? parent.assetSession
  const resolvedAssetPresenter = assetPresenter ?? parent.assetPresenter
  const value = useMemo<EidosFileUIHost>(
    () => ({
      themeName: resolvedThemeName,
      locale: resolvedLocale,
      translate:
        translateOverride ??
        (locale !== undefined || messages !== EMPTY_MESSAGES
          ? (message, values) =>
              translateEidosFileUI(resolvedLocale, message, values, messages)
          : parent.translate),
      ...(resolvedAssetSession ? { assetSession: resolvedAssetSession } : {}),
      ...(resolvedAssetPresenter
        ? { assetPresenter: resolvedAssetPresenter }
        : {}),
    }),
    [
      locale,
      messages,
      parent.translate,
      resolvedAssetPresenter,
      resolvedAssetSession,
      resolvedLocale,
      resolvedThemeName,
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
