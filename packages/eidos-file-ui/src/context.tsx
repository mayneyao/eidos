import { createContext, useContext, useMemo, type ReactNode } from "react"
import type {
  AssetLease,
  HostServiceCapabilities,
  HostServices,
  HostSessionState,
  RequestContext,
  UrlImageLease,
} from "@eidos.space/eidos-file"

import {
  translateEidosFileUI,
  type EidosFileUILocale,
  type EidosFileUIMessageOverrides,
  type EidosFileUIMessageValues,
} from "./i18n"

export type EidosFileUIThemeName = "light" | "dark"
export type EidosFileImagePresentationLease = AssetLease | UrlImageLease

/** Framework-native consumer of a Host-scoped asset lease. */
export interface AssetPresenter<Surface> {
  renderImage(request: {
    sessionId: string
    lease: EidosFileImagePresentationLease
    altText: string
  }): Surface
  /** Optional Canvas-native image source used by Grid thumbnail renderers. */
  loadImage?(request: {
    sessionId: string
    lease: EidosFileImagePresentationLease
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

/** Host-configurable shortcuts used by the Eidos File editor surface. */
export interface EidosFileUIKeyboardShortcuts {
  newRecord?: readonly string[]
  previousView?: readonly string[]
  nextView?: readonly string[]
  previousTable?: readonly string[]
  nextTable?: readonly string[]
  openCellActions?: readonly string[]
}

/** Stable identity for a relation record that the Host can present. */
export interface EidosFileRelationRecordTarget {
  tableId: string
  rowId: string
  title: string
}

export interface EidosFileUIHost {
  themeName: EidosFileUIThemeName
  locale: EidosFileUILocale
  translate(message: string, values?: EidosFileUIMessageValues): string
  /** Host-owned activation for a policy-checked external URL. */
  activateUrl?: (uri: string) => void | Promise<void>
  /** Host-owned navigation to a record referenced by a relation field. */
  openRelationRecord?: (
    target: EidosFileRelationRecordTarget
  ) => void | Promise<void>
  assetSession?: EidosFileUIAssetSession
  assetPresenter?: AssetPresenter<ReactNode>
  keyboardShortcuts?: EidosFileUIKeyboardShortcuts
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
  activateUrl,
  openRelationRecord,
  assetSession,
  assetPresenter,
  keyboardShortcuts,
}: Partial<EidosFileUIHost> & {
  children: ReactNode
  messages?: Partial<EidosFileUIMessageOverrides>
}) {
  const parent = useContext(EidosFileUIContext)
  const resolvedThemeName = themeName ?? parent.themeName
  const resolvedLocale = locale ?? parent.locale
  const resolvedActivateUrl = activateUrl ?? parent.activateUrl
  const resolvedOpenRelationRecord =
    openRelationRecord ?? parent.openRelationRecord
  const resolvedAssetSession = assetSession ?? parent.assetSession
  const resolvedAssetPresenter = assetPresenter ?? parent.assetPresenter
  const resolvedKeyboardShortcuts =
    keyboardShortcuts ?? parent.keyboardShortcuts
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
      ...(resolvedActivateUrl ? { activateUrl: resolvedActivateUrl } : {}),
      ...(resolvedOpenRelationRecord
        ? { openRelationRecord: resolvedOpenRelationRecord }
        : {}),
      ...(resolvedAssetSession ? { assetSession: resolvedAssetSession } : {}),
      ...(resolvedAssetPresenter
        ? { assetPresenter: resolvedAssetPresenter }
        : {}),
      ...(resolvedKeyboardShortcuts
        ? { keyboardShortcuts: resolvedKeyboardShortcuts }
        : {}),
    }),
    [
      locale,
      messages,
      parent.translate,
      resolvedActivateUrl,
      resolvedOpenRelationRecord,
      resolvedAssetPresenter,
      resolvedAssetSession,
      resolvedKeyboardShortcuts,
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
