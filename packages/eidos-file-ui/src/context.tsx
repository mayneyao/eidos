import { useContext, useMemo, type ReactNode } from "react"
import { EidosFileUIContext } from "./eidos-file-ui-context"
// Keep the hook export stable while Fast Refresh replaces the provider.
export { useEidosFileUI } from "./eidos-file-ui-context"
import type { RecordFieldManagement } from "./eidos-file-record-field-context"
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
export type EidosFileThumbnailSize = 128 | 512 | 1024

/** Framework-native consumer of a Host-scoped asset lease. */
export interface AssetPresenter<Surface> {
  /** Optional inline player. Media is loaded only after an explicit play action. */
  renderVideo?(request: {
    sessionId: string
    lease: AssetLease
    altText: string
    onError(): void
  }): Surface
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
  /** Optional copy-to-clipboard for image leases. Absent hides the action. */
  copyImage?(request: {
    sessionId: string
    lease: EidosFileImagePresentationLease
    altText: string
  }): Promise<void>
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
  /** Host content refresh revision. Revalidate cached thumbnails without blanking them. */
  thumbnailRevision?: number
  /** Host limit for opening local references without loading their bytes. */
  localAssetOpenBytesMax?: string
  /** Host source-file limit for generating bounded local thumbnails. */
  localAssetThumbnailBytesMax?: string
  /** Optional size-aware thumbnail provider; other Hosts use resolveAsset. */
  resolveThumbnail?(
    request: {
      sessionId: string
      entryId: string
      size: EidosFileThumbnailSize
    },
    context: RequestContext
  ): Promise<AssetLease>
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

/** Host-native Markdown editor rendered inside a record content page. */
export interface EidosFileMarkdownEditorRequest {
  focusRequestToken?: number
  cacheKey: string
  content: string
  disabled: boolean
  onChange(content: string): void
}

/** @deprecated Use EidosFileMarkdownEditorRequest. */
export type EidosFileMarkdownSourceEditorRequest =
  EidosFileMarkdownEditorRequest

/** Sanitized read-only Markdown HTML plus the wrapper class its styles expect. */
export interface EidosFileMarkdownHtml {
  html: string
  className?: string
}

export interface EidosFileUIHost {
  /** Stable, host-local file location/identity for personal record property preferences. */
  recordPropertyScope?: string
  /** Device preference that hides system fields in every open record. */
  defaultHideSystemFieldsInRecords?: boolean
  /** Existing Runtime-backed schema boundary for records rendered by this editor. */
  recordFieldManagement?: RecordFieldManagement
  /** Unsubmitted, saving or failed editor state. Hosts may defer external refreshes. */
  onPendingEditChange?: (editorId: string, pending: boolean) => void
  /** Host-owned personal menu preferences, independent of saved View layout. */
  menuOrders?: { "grid.cell"?: readonly string[] }
  onMenuOrderChange?: (
    menu: "grid.cell",
    order: readonly string[]
  ) => void | Promise<void>
  /** Touch hosts present cell editors in a bottom sheet. */
  interactionMode?: "desktop" | "mobile"
  themeName: EidosFileUIThemeName
  locale: EidosFileUILocale
  /** Host preference controlling the first visible weekday in Calendar views. */
  weekStartsOnMonday?: boolean
  /** Host-selected IANA time zone; absent means follow the current system zone. */
  timeZone?: string
  /** Negotiated portable profile used with the current application settings. */
  calendarTimeZoneData?: string | null
  /** Unsupported saved queries cannot be edited piecemeal. */
  queryEditingDisabled?: boolean
  /** Negotiated Runtime capability, not a saved or global preference. */
  calendarPeriodTimeZoneData?: readonly string[]
  calendarWindowVersion?: 1
  translate(message: string, values?: EidosFileUIMessageValues): string
  /** Host-owned activation for a policy-checked external URL. */
  activateUrl?: (uri: string) => void | Promise<void>
  /** Optional Host navigation for Content Markdown links; grants no FileEntry access. */
  activateMarkdownLink?: (uri: string) => void | Promise<void>
  /** Host-owned navigation to a record referenced by a relation field. */
  openRelationRecord?: (
    target: EidosFileRelationRecordTarget
  ) => void | Promise<void>
  assetSession?: EidosFileUIAssetSession
  assetPresenter?: AssetPresenter<ReactNode>
  /**
   * Host base URL that serves the directory containing the Eidos File. When
   * set, the Content preview resolves document-local image references such as
   * `assets/diagram.png` against it.
   */
  contentImageBaseUrl?: string
  /**
   * Optional host read-only Markdown renderer. The Host owns sanitization and
   * returns the wrapper class its styles expect. Shared UI falls back to its
   * own safe renderer, which does not resolve remote images or highlight code.
   */
  renderMarkdownHtml?: (
    markdown: string,
    options: { imageBaseUrl?: string }
  ) => EidosFileMarkdownHtml
  /**
   * Resolve a document-local Markdown image source (for example
   * `assets/diagram.png`) to a displayable URL. Hosts that render remote
   * images directly only need this for relative sources.
   */
  resolveMarkdownImageUrl?: (markdownUrl: string) => Promise<string | null>
  keyboardShortcuts?: EidosFileUIKeyboardShortcuts
  /** Host preference used to identify the active Content editing surface. */
  markdownEditingMode?: "source" | "wysiwyg"
  /** Optional host-native Markdown editor. Shared UI falls back to source. */
  renderMarkdownEditor?: (request: EidosFileMarkdownEditorRequest) => ReactNode
  /** Optional richer source editor. Shared UI falls back to a plain textarea. */
  /** @deprecated Use renderMarkdownEditor. */
  renderMarkdownSourceEditor?: (
    request: EidosFileMarkdownSourceEditorRequest
  ) => ReactNode
}

const EMPTY_MESSAGES: Partial<EidosFileUIMessageOverrides> = {}

export function EidosFileUIProvider({
  recordPropertyScope,
  defaultHideSystemFieldsInRecords,
  recordFieldManagement,
  onPendingEditChange,
  menuOrders,
  onMenuOrderChange,
  interactionMode,
  children,
  themeName,
  locale,
  weekStartsOnMonday,
  timeZone,
  calendarTimeZoneData,
  queryEditingDisabled,
  calendarPeriodTimeZoneData,
  calendarWindowVersion,
  messages = EMPTY_MESSAGES,
  translate: translateOverride,
  activateUrl,
  activateMarkdownLink,
  openRelationRecord,
  assetSession,
  assetPresenter,
  contentImageBaseUrl,
  renderMarkdownHtml,
  resolveMarkdownImageUrl,
  keyboardShortcuts,
  markdownEditingMode,
  renderMarkdownEditor,
  renderMarkdownSourceEditor,
}: Partial<EidosFileUIHost> & {
  children: ReactNode
  messages?: Partial<EidosFileUIMessageOverrides>
}) {
  const parent = useContext(EidosFileUIContext)
  const resolvedDefaultHideSystemFieldsInRecords =
    defaultHideSystemFieldsInRecords ??
    parent.defaultHideSystemFieldsInRecords ??
    false
  const resolvedRecordPropertyScope =
    recordPropertyScope ?? parent.recordPropertyScope
  const resolvedRecordFieldManagement =
    recordFieldManagement ?? parent.recordFieldManagement
  const resolvedOnPendingEditChange =
    onPendingEditChange ?? parent.onPendingEditChange
  const resolvedMenuOrders = menuOrders ?? parent.menuOrders
  const resolvedOnMenuOrderChange =
    onMenuOrderChange ?? parent.onMenuOrderChange
  const resolvedInteractionMode = interactionMode ?? parent.interactionMode
  const resolvedThemeName = themeName ?? parent.themeName
  const resolvedLocale = locale ?? parent.locale
  const resolvedWeekStartsOnMonday =
    weekStartsOnMonday ?? parent.weekStartsOnMonday ?? true
  const resolvedTimeZone = timeZone ?? parent.timeZone
  const resolvedCalendarTimeZoneData =
    calendarTimeZoneData === undefined
      ? parent.calendarTimeZoneData
      : calendarTimeZoneData
  const resolvedCalendarPeriodTimeZoneData =
    calendarPeriodTimeZoneData ?? parent.calendarPeriodTimeZoneData
  const resolvedActivateUrl = activateUrl ?? parent.activateUrl
  const resolvedActivateMarkdownLink =
    activateMarkdownLink ?? parent.activateMarkdownLink
  const resolvedOpenRelationRecord =
    openRelationRecord ?? parent.openRelationRecord
  const resolvedAssetSession = assetSession ?? parent.assetSession
  const resolvedAssetPresenter = assetPresenter ?? parent.assetPresenter
  const resolvedContentImageBaseUrl =
    contentImageBaseUrl ?? parent.contentImageBaseUrl
  const resolvedRenderMarkdownHtml =
    renderMarkdownHtml ?? parent.renderMarkdownHtml
  const resolvedResolveMarkdownImageUrl =
    resolveMarkdownImageUrl ?? parent.resolveMarkdownImageUrl
  const resolvedKeyboardShortcuts =
    keyboardShortcuts ?? parent.keyboardShortcuts
  const resolvedMarkdownEditingMode =
    markdownEditingMode ?? parent.markdownEditingMode ?? "source"
  const resolvedRenderMarkdownEditor =
    renderMarkdownEditor ?? parent.renderMarkdownEditor
  const resolvedRenderMarkdownSourceEditor =
    renderMarkdownSourceEditor ?? parent.renderMarkdownSourceEditor
  const value = useMemo<EidosFileUIHost>(
    () => ({
      recordPropertyScope: resolvedRecordPropertyScope,
      defaultHideSystemFieldsInRecords:
        resolvedDefaultHideSystemFieldsInRecords,
      recordFieldManagement: resolvedRecordFieldManagement,
      onPendingEditChange: resolvedOnPendingEditChange,
      ...(resolvedMenuOrders ? { menuOrders: resolvedMenuOrders } : {}),
      ...(resolvedOnMenuOrderChange
        ? { onMenuOrderChange: resolvedOnMenuOrderChange }
        : {}),
      interactionMode: resolvedInteractionMode,
      themeName: resolvedThemeName,
      locale: resolvedLocale,
      weekStartsOnMonday: resolvedWeekStartsOnMonday,
      ...(resolvedTimeZone ? { timeZone: resolvedTimeZone } : {}),
      calendarTimeZoneData: resolvedCalendarTimeZoneData,
      queryEditingDisabled: queryEditingDisabled ?? parent.queryEditingDisabled,
      calendarPeriodTimeZoneData: resolvedCalendarPeriodTimeZoneData,
      calendarWindowVersion:
        calendarWindowVersion ?? parent.calendarWindowVersion,
      translate:
        translateOverride ??
        (locale !== undefined || messages !== EMPTY_MESSAGES
          ? (message, values) =>
              translateEidosFileUI(resolvedLocale, message, values, messages)
          : parent.translate),
      ...(resolvedActivateUrl ? { activateUrl: resolvedActivateUrl } : {}),
      ...(resolvedActivateMarkdownLink
        ? { activateMarkdownLink: resolvedActivateMarkdownLink }
        : {}),
      ...(resolvedOpenRelationRecord
        ? { openRelationRecord: resolvedOpenRelationRecord }
        : {}),
      ...(resolvedAssetSession ? { assetSession: resolvedAssetSession } : {}),
      ...(resolvedAssetPresenter
        ? { assetPresenter: resolvedAssetPresenter }
        : {}),
      ...(resolvedContentImageBaseUrl
        ? { contentImageBaseUrl: resolvedContentImageBaseUrl }
        : {}),
      ...(resolvedRenderMarkdownHtml
        ? { renderMarkdownHtml: resolvedRenderMarkdownHtml }
        : {}),
      ...(resolvedResolveMarkdownImageUrl
        ? { resolveMarkdownImageUrl: resolvedResolveMarkdownImageUrl }
        : {}),
      ...(resolvedKeyboardShortcuts
        ? { keyboardShortcuts: resolvedKeyboardShortcuts }
        : {}),
      markdownEditingMode: resolvedMarkdownEditingMode,
      ...(resolvedRenderMarkdownEditor
        ? { renderMarkdownEditor: resolvedRenderMarkdownEditor }
        : {}),
      ...(resolvedRenderMarkdownSourceEditor
        ? { renderMarkdownSourceEditor: resolvedRenderMarkdownSourceEditor }
        : {}),
    }),
    [
      resolvedRecordPropertyScope,
      resolvedDefaultHideSystemFieldsInRecords,
      resolvedRecordFieldManagement,
      resolvedOnPendingEditChange,
      resolvedMenuOrders,
      resolvedOnMenuOrderChange,
      resolvedInteractionMode,
      locale,
      messages,
      parent.translate,
      resolvedActivateUrl,
      resolvedActivateMarkdownLink,
      resolvedOpenRelationRecord,
      resolvedAssetPresenter,
      resolvedAssetSession,
      resolvedContentImageBaseUrl,
      resolvedRenderMarkdownHtml,
      resolvedResolveMarkdownImageUrl,
      resolvedKeyboardShortcuts,
      resolvedMarkdownEditingMode,
      resolvedRenderMarkdownEditor,
      resolvedRenderMarkdownSourceEditor,
      resolvedLocale,
      resolvedThemeName,
      resolvedTimeZone,
      resolvedCalendarTimeZoneData,
      queryEditingDisabled,
      parent.queryEditingDisabled,
      resolvedCalendarPeriodTimeZoneData,
      calendarWindowVersion,
      parent.calendarWindowVersion,
      resolvedWeekStartsOnMonday,
      translateOverride,
    ]
  )
  return (
    <EidosFileUIContext.Provider value={value}>
      {children}
    </EidosFileUIContext.Provider>
  )
}
