import {
  isExtensionURL,
  isFilesPath,
  isStandaloneBlocksPath,
} from "@/lib/utils"
import type { WebContents, WebContentsViewConstructorOptions } from "electron"
import { BrowserWindow, WebContentsView, shell } from "electron"
import path from "path"
import { getExtensionByUrl } from "../helper"
import { BrowserViewManager } from "./browser-view-manager"
import { PipelineRunner } from "../services/pipeline-runner"

export const defaultViewOptions: WebContentsViewConstructorOptions = {
  webPreferences: {
    preload: path.join(__dirname, "./preload.mjs"),
    nodeIntegration: true,
    contextIsolation: true,
    webviewTag: true,
  },
}

export class WindowManager {
  currentTab: string | null = null
  private openTabs: Map<string, WebContentsView> = new Map()
  private win: BrowserWindow
  browserViewManager: BrowserViewManager
  pipelineRunner: PipelineRunner

  get tabs() {
    return Array.from(this.openTabs.keys())
  }
  constructor(win: BrowserWindow) {
    this.currentTab = null
    this.openTabs = new Map()
    this.win = win
    this.browserViewManager = new BrowserViewManager(win)
    this.pipelineRunner = new PipelineRunner(win)
    this.setWebContents(win.webContents)
  }

  private broadcastTabsUpdate(): void {
    const openTabs = Array.from(this.openTabs.keys())
    this.win?.webContents.send("tabs-updated", openTabs)
    this.win?.webContents.send("current-tab-updated", this.currentTab)
    this.openTabs.forEach((view) => {
      view.webContents.send("tabs-updated", openTabs)
      view.webContents.send("current-tab-updated", this.currentTab)
    })
  }

  createView(opt: {
    webPreferences: WebContentsViewConstructorOptions["webPreferences"]
    url: string
  }) {
    const { webPreferences, url } = opt
    const parent = this.win
    const view = new WebContentsView({ webPreferences })
    view.webContents.loadURL(url)
    console.log(parent.getBounds())
    view.setBounds({
      x: 0,
      y: 0,
      width: parent.getBounds().width,
      height: parent.getBounds().height,
    })
    parent.contentView.addChildView(view)
    this.setWebContents(view.webContents)
    this.openTab(url, view) // Update to pass view
    view.webContents.openDevTools()
    return view
  }

  private setWebContents = (webContents: WebContents) => {
    // Test active push message to Renderer-process.
    webContents.on("did-finish-load", () => {
      webContents.send("main-process-message", new Date().toLocaleString())
    })

    // Ensure links open in the default browser based on domain
    const handleExternalLinks = (event: Electron.Event, url: string) => {
      const { hostname } = new URL(url)
      const currentDomain = new URL(this.win.webContents.getURL()).origin
      const newDomain = new URL(url).origin
      if (currentDomain !== newDomain) {
        event.preventDefault()
        shell.openExternal(url).catch((err) => {
          console.error(`Failed to open external URL (${url}):`, err)
        })
      }
    }

    webContents.setWindowOpenHandler(({ url }) => {
      const currentDomain = new URL(this.win.webContents.getURL()).origin
      const newURL = new URL(url)
      const newDomain = newURL.origin
      const pathname = newURL.pathname

      if (isExtensionURL(newURL.origin)) {
        const win = new BrowserWindow({
          width: 512,
          height: 800,
          webPreferences: {
            nodeIntegration: false,
            contextIsolation: false,
            webviewTag: true,
          },
          autoHideMenuBar: true,
        })

        win.loadURL(url)
        win.webContents.setWindowOpenHandler(({ url }) => {
          // if is extension url, open in new window
          const newDomain = new URL(url).origin
          if (newURL.origin !== newDomain) {
            shell.openExternal(url).catch((err) => {
              console.error(`Failed to open external URL (${url}):`, err)
            })
          }
          return { action: "deny" }
        })
        getExtensionByUrl(url).then((extension) => {
          win.setTitle(`Eidos - ${extension.name}`)
        })
        return { action: "deny" }
      } else if (currentDomain === newDomain) {
        console.log("pathname", pathname)
        if (isStandaloneBlocksPath(pathname)) {
          new BrowserWindow({
            width: 512,
            height: 800,
            webPreferences: defaultViewOptions.webPreferences,
            autoHideMenuBar: true,
          }).loadURL(url)
        } else if (isFilesPath(pathname)) {
          new BrowserWindow({
            width: 800,
            height: 600,
            webPreferences: defaultViewOptions.webPreferences,
          }).loadURL(url)
        } else {
          throw new Error(`Unsupported path: ${pathname}`)
          // this.createView({
          //     webPreferences: defaultViewOptions.webPreferences,
          //     url,
          // });
        }
        return { action: "deny" }
      } else if (url.startsWith("blob:")) {
        return { action: "allow" }
      } else {
        handleExternalLinks(new Event(""), url)
        return { action: "deny" }
      }
    })
  }

  openTab(url: string, view: WebContentsView): void {
    this.openTabs.set(url, view)
    this.currentTab = url
    this.broadcastTabsUpdate()
  }

  closeTab(url: string): void {
    this.openTabs.delete(url)
    if (this.currentTab === url) {
      this.currentTab =
        this.openTabs.size > 0 ? Array.from(this.openTabs.keys())[0] : null
    }
    this.broadcastTabsUpdate()
  }
  switchTab(url: string): void {
    if (this.openTabs.has(url)) {
      this.currentTab = url
      this.win?.webContents.send("current-tab-updated", this.currentTab)
    } else {
      console.error(`Tab with url ${url} is not open.`)
    }
  }

  getCurrentTab(): string | null {
    return this.currentTab
  }

  getOpenTabs(): string[] {
    return Array.from(this.openTabs.keys())
  }
}
