import type { WebContentsView } from "electron"

/**
 * Browser View Bounds
 */
export interface BrowserViewBounds {
  x: number
  y: number
  width: number
  height: number
}

/**
 * Reader View Data
 */
export interface ReaderViewData {
  html: string
  title: string
  originalUrl: string
}

/**
 * View State
 */
export interface ViewState {
  view: WebContentsView
  isFullscreen: boolean
}

/**
 * Navigation State
 */
export interface NavigationState {
  canGoBack: boolean
  canGoForward: boolean
  isLoading: boolean
  url: string
  title: string
}

/**
 * View Event Types
 */
export type ViewEventType =
  | "navigate"
  | "loading"
  | "title"
  | "rawdata-navigation"

/**
 * View Event Data
 */
export interface ViewEventData {
  type: ViewEventType
  url?: string
  canGoBack?: boolean
  canGoForward?: boolean
  isLoading?: boolean
  title?: string
}
