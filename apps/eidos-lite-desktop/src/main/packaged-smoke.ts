import fs from "node:fs/promises"
import path from "node:path"
import { performance } from "node:perf_hooks"
import type { BrowserWindow } from "electron"
import { createEidosFile } from "@eidos.space/eidos-file/node-sqlite"

import { EIDOS_LITE_PERFORMANCE_BUDGET_MS } from "../shared/performance-contract"
import {
  observePackagedSmokeWindow,
  type PackagedSmokeStartup,
  type PackagedStartupTimings,
} from "./packaged-startup-smoke"
import type { WindowController } from "./window-controller"

interface RendererSmokeResult {
  performance: {
    coldStartMs: number
    budgets: {
      coldStartMs: number
      utilityOpenP95Ms: number
      denseGridFirstFrameMs: number
    }
    startup: PackagedStartupTimings
    utilityOpenMs: number[]
    utilityOpenP95Ms: number
    denseGrid: {
      rows: number
      preparationMs: number
      renderedFirstFrameMs: number
      canvasWidth: number
      canvasHeight: number
    }
  }
  launchRouting: {
    reusedSpaceWindow: boolean
    selectedFile: boolean
    singleEditor: boolean
  }
  diagnostics: {
    workbenchActionAbsent: boolean
    copyApi: boolean
    schemaVersion: number
    environment: string
    openSpace: boolean
    safe: boolean
  }
  onboarding: {
    emptyState: boolean
    createAction: boolean
    dialog: boolean
    extensionNormalized: boolean
    fileCreated: boolean
    editorOpened: boolean
  }
  environment: {
    name: string
    accountOrigin: string
    billingOrigin: string
    syncRemoteOrigin: string
    stagingBadge: boolean
  }
  space: {
    name: string
    eidosFileCount: number
  }
  graft: {
    available: boolean
    backend: "sdk"
    version?: string
  }
  cachedFiles: string[]
  runtimeCache: {
    residentPaths: string[]
    trackedPaths: string[]
  }
  fileLifecycle: {
    created: boolean
    renamed: boolean
    moved: boolean
    copied: boolean
    trashed: boolean
  }
  textEditor: {
    surface: boolean
    pierreRendered: boolean
    createApi: boolean
    saveApi: boolean
    saved: boolean
    conflictProtected: boolean
  }
  lifecycleRecovery: {
    recentRecorded: boolean
    externalRenameInvalidated: boolean
    externalRenameIssue: boolean
    externalRetryOpened: boolean
    runtimeWorkerReopened: boolean
    graftWorkerReopened: boolean
  }
  canonicalEditor: {
    shell: boolean
    viewTabs: boolean
    queryToolbar: boolean
    fields: boolean
    sheetTabs: boolean
  }
  csvWorkflow: {
    importAction: boolean
    exportAction: boolean
    saveApi: boolean
    previewRows: number
    importedRows: number
    inferredNumber: boolean
  }
  workbenchLayout: {
    pierreTree: boolean
    activePathSelected: boolean
    sidebarResized: boolean
    sidebarCollapsed: boolean
    sidebarReopened: boolean
    sidebarWidthRestored: boolean
    singleTitleRow: boolean
    compactTitleRow: boolean
    unifiedSidebar: boolean
  }
  styleContract: {
    formControlsReset: boolean
    portalBackground: boolean
    portalBorder: boolean
    portalRadius: boolean
  }
  syncControl: {
    action: boolean
    iconAction: boolean
    panel: boolean
    environment: boolean
    signedOut: boolean
    gated: boolean
    signInAvailable: boolean
    cloneApi: boolean
    syncApi: boolean
    syncProgressApi: boolean
    syncQueueApi: boolean
    syncQueueEventsApi: boolean
    recoveryApi: boolean
  }
  syncReliability: {
    codes: string[]
    allClassified: boolean
    allLocalSafe: boolean
    allActionable: boolean
    failedTelemetry: boolean
    localRuntimeAvailable: boolean
    gateStayedReady: boolean
    ordinaryFilesUnchanged: boolean
    queueStates: string[]
    statuses: Array<number | null>
    failuresScheduledSafely: boolean
    automaticRetryAttempted: boolean
  }
  mutation: {
    beforeCount: number
    afterInsertCount: number
    afterDeleteCount: number
    checkpointCount: number
    restoredCount: number
  }
  versioning: {
    initialized: boolean
    clean: boolean
    iconAction: boolean
    changeBadge: boolean
    changePaths: number
    rowChanges: number
    historyCount: number
    restoreCreatedCheckpoint: boolean
    automaticCheckpoint: boolean
  }
  inlineError?: string
}

type EmptySpaceOnboardingResult = RendererSmokeResult["onboarding"]
type TextHistorySmokeResult = {
  directRead: boolean
  workingDirectRead: boolean
  workingPierreRendered: boolean
  pierreRendered: boolean
  scrollable: boolean
  splitLayout: boolean
  unifiedLayout: boolean
}

type WindowTransitionSmokeResult = {
  welcome: { width: number; height: number }
  space: { width: number; height: number }
  expanded: boolean
  minimumApplied: boolean
}

const emptySpaceOnboardingProbe = `
(async () => {
  const waitFor = async (read, label) => {
    const deadline = Date.now() + 15000
    while (Date.now() < deadline) {
      const value = read()
      if (value) return value
      await new Promise((resolve) => setTimeout(resolve, 50))
    }
    throw new Error("Timed out waiting for " + label)
  }
  if (!window.eidosLite) throw new Error("window.eidosLite preload API is missing")
  window.__eidosLiteSmokeStep = "empty Space onboarding"
  const initialSpace = await window.eidosLite.getSpace()
  if (!initialSpace || initialSpace.eidosFileCount !== 0) {
    throw new Error("Onboarding smoke requires an empty bound Space")
  }
  const emptyState = await waitFor(
    () => document.querySelector("[data-empty-space-onboarding]"),
    "empty Space onboarding"
  )
  const createAction = emptyState.querySelector("[data-create-first-eidos]")
  if (!createAction) throw new Error("Create-first-file action is missing")
  createAction.click()
  const dialog = await waitFor(
    () => document.querySelector('form[aria-label="New File"]'),
    "New File dialog"
  )
  const description = dialog.querySelector(".path-dialog-description")
  if (!description?.textContent?.includes(".md")) {
    throw new Error("New File dialog does not explain text-file extensions")
  }
  const input = dialog.querySelector("input")
  if (!input) throw new Error("New File name input is missing")
  const setValue = Object.getOwnPropertyDescriptor(
    HTMLInputElement.prototype,
    "value"
  )?.set
  if (!setValue) throw new Error("Cannot set the Eidos File name")
  setValue.call(input, "Getting Started")
  input.dispatchEvent(new Event("input", { bubbles: true }))
  dialog.requestSubmit()
  const createdPath = "Getting Started.eidos"
  await waitFor(
    () => document.querySelector(
      '[data-cached-file-path="' + CSS.escape(createdPath) + '"]'
    ),
    "created Eidos File runtime"
  )
  const editor = await waitFor(
    () => document.querySelector('[data-eidos-file-editor-shell]'),
    "created Eidos File editor"
  )
  const finalSpace = await window.eidosLite.getSpace()
  const createdEntry = finalSpace?.entries.find(
    (entry) => entry.relativePath === createdPath && entry.kind === "eidos"
  )
  return {
    emptyState: Boolean(emptyState),
    createAction: Boolean(createAction),
    dialog: Boolean(dialog),
    extensionNormalized: createdEntry?.name === createdPath,
    fileCreated: finalSpace?.eidosFileCount === 1 && Boolean(createdEntry),
    editorOpened: Boolean(editor),
  }
})()
`

const launchRouteProbe = `
(async () => {
  const relativePath = "projects/content-calendar.eidos"
  const deadline = Date.now() + 15000
  while (Date.now() < deadline) {
    const editor = document.querySelector(
      '.file-editor[aria-label="' + CSS.escape(relativePath) + '"] ' +
      '[data-eidos-file-editor-shell]'
    )
    const treeHost = document.querySelector("[data-space-file-tree]")
    const selected =
      treeHost?.dataset.activePath === relativePath &&
      treeHost?.dataset.activeSelected === "true"
    if (editor && selected) {
      return {
        selectedFile: true,
        singleEditor: document.querySelectorAll(".file-editor").length === 1,
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 25))
  }
  throw new Error("Timed out waiting for the file-association launch route")
})()
`

const textHistoryProbe = `
(async () => {
  const waitFor = async (read, label) => {
    const deadline = Date.now() + 15000
    while (Date.now() < deadline) {
      const value = read()
      if (value) return value
      await new Promise((resolve) => setTimeout(resolve, 50))
    }
    throw new Error("Timed out waiting for " + label)
  }
  window.__eidosLiteSmokeStep = "historical text diff UI"
  const versionAction = document.querySelector(
    'button[data-titlebar-action="version"]'
  )
  if (!versionAction) throw new Error("Version History UI action is missing")
  if (document.querySelector(".version-panel")) {
    versionAction.click()
    await waitFor(
      () => !document.querySelector(".version-panel") && true,
      "closed Version History panel"
    )
  }
  versionAction.click()
  const panel = await waitFor(
    () => document.querySelector(".version-panel"),
    "reopened Version History panel"
  )
  const changesTab = [...panel.querySelectorAll('[role="tab"]')].find(
    (candidate) => candidate.textContent?.trim() === "Changes"
  )
  if (!changesTab) throw new Error("Changes tab is missing")
  changesTab.click()
  const changeTreeShell = await waitFor(
    () => document.querySelector(".version-change-tree-shell"),
    "working change tree"
  )
  const changeTree = await waitFor(
    () => [...changeTreeShell.querySelectorAll("*")].find(
      (candidate) => candidate.shadowRoot?.querySelector('[data-type="item"]')
    ),
    "Pierre working change tree"
  )
  const workingTextFile = await waitFor(
    () => [...changeTree.shadowRoot.querySelectorAll('[data-type="item"]')]
      .find((candidate) => candidate.dataset.itemPath === "README.md"),
    "README working change"
  )
  workingTextFile.click()
  const workingDiff = await waitFor(
    () => document.querySelector("[data-version-text-diff]"),
    "working text diff"
  )
  const workingPierreRendered = await waitFor(() => {
    const surface = workingDiff.querySelector(".version-text-diff-virtualizer")
    if (!surface) return false
    return [...surface.querySelectorAll("*")].some(
      (candidate) => candidate.shadowRoot?.querySelector("[data-line]")
    )
  }, "Pierre working text diff lines")
  const closeInspector = document.querySelector(
    '.version-inspector-bar button[aria-label="Close change details"]'
  )
  if (!closeInspector) throw new Error("Working diff close action is missing")
  closeInspector.click()
  await waitFor(
    () => !document.querySelector(".version-inspector") && true,
    "closed working text diff"
  )
  const historyTab = [...panel.querySelectorAll('[role="tab"]')].find(
    (candidate) => candidate.textContent?.trim() === "History"
  )
  if (!historyTab) throw new Error("History tab is missing")
  historyTab.click()
  const commitRow = await waitFor(
    () => [...document.querySelectorAll(".commit-row")].find(
      (candidate) => candidate.textContent?.includes("Packaged text checkpoint")
    ),
    "text checkpoint"
  )
  commitRow.click()
  const textFile = await waitFor(
    () => [...document.querySelectorAll(".history-change-list > li > button")]
      .find((candidate) => candidate.getAttribute("title") === "README.md"),
    "README history change"
  )
  textFile.click()
  const diff = await waitFor(
    () => document.querySelector("[data-version-text-diff]"),
    "historical text diff"
  )
  const split = diff.querySelector('button[aria-pressed="true"]')
  const unified = [...diff.querySelectorAll("button")].find(
    (candidate) => candidate.textContent?.trim() === "Unified"
  )
  if (!split || split.textContent?.trim() !== "Split" || !unified) {
    throw new Error("Text diff layout controls are incomplete")
  }
  const pierreRendered = await waitFor(() => {
    const surface = document.querySelector(".version-text-diff-virtualizer")
    if (!surface) return false
    return [...surface.querySelectorAll("*")].some(
      (candidate) => candidate.shadowRoot?.querySelector("[data-line]")
    )
  }, "Pierre text diff lines")
  const scrollable = await waitFor(() => {
    const surface = document.querySelector(".version-text-diff-virtualizer")
    if (!(surface instanceof HTMLElement)) return false
    const overflowY = getComputedStyle(surface).overflowY
    const maximum = surface.scrollHeight - surface.clientHeight
    if (!(["auto", "scroll"].includes(overflowY)) || maximum <= 0) return false
    surface.scrollTop = Math.min(maximum, 600)
    surface.dispatchEvent(new Event("scroll"))
    return surface.scrollTop > 0
  }, "scrollable Pierre text diff")
  unified.click()
  const unifiedLayout = await waitFor(
    () => unified.getAttribute("aria-pressed") === "true",
    "unified text diff layout"
  )
  return {
    workingPierreRendered: Boolean(workingPierreRendered),
    pierreRendered: Boolean(pierreRendered),
    scrollable: Boolean(scrollable),
    splitLayout: true,
    unifiedLayout: Boolean(unifiedLayout),
  }
})()
`

const rendererProbe = `
(async () => {
  const waitFor = async (read, label) => {
    const deadline = Date.now() + 15000
    while (Date.now() < deadline) {
      const value = read()
      if (value) return value
      await new Promise((resolve) => setTimeout(resolve, 50))
    }
    throw new Error("Timed out waiting for " + label)
  }
  if (!window.eidosLite) throw new Error("window.eidosLite preload API is missing")
  window.__eidosLiteSmokeStep = "startup"
  const appInfo = await window.eidosLite.getAppInfo()
  if (
    appInfo.services.name !== "staging" ||
    appInfo.services.accountOrigin !== "https://staging.eidos.space" ||
    appInfo.services.billingOrigin !== "https://staging.eidos.space" ||
    appInfo.services.syncRemoteOrigin !== "https://sync-staging.eidos.space"
  ) {
    throw new Error(
      "Unsigned development package is not bound to the official staging preset: " +
      JSON.stringify(appInfo.services)
    )
  }
  let space = await window.eidosLite.getSpace()
  if (space?.entries.some((entry) => entry.relativePath === "projects")) {
    space = await window.eidosLite.loadSpaceDirectory("projects")
  }
  if (!space || space.eidosFileCount < 4) {
    throw new Error("UI smoke requires a bound Space with four Eidos Files")
  }
  const eidosPaths = []
  const collect = (entries) => {
    for (const entry of entries) {
      if (entry.kind === "eidos") eidosPaths.push(entry.relativePath)
      if (entry.children) collect(entry.children)
    }
  }
  collect(space.entries)
  const treeHost = await waitFor(
    () => {
      const candidate = document.querySelector("[data-space-file-tree]")
      return candidate?.shadowRoot?.querySelector('[data-type="item"]')
        ? candidate
        : null
    },
    "Pierre Space file tree"
  )
  const treeItem = (relativePath) =>
    [...treeHost.shadowRoot.querySelectorAll('[data-type="item"]')].find(
      (candidate) => candidate.dataset.itemPath === relativePath
    )
  const utilityOpenMs = []
  let denseGrid = null
  for (let index = 0; index < 4; index += 1) {
    const relativePath = eidosPaths[index]
    const button = await waitFor(
      () => treeItem(relativePath),
      relativePath + " in Space Explorer"
    )
    const openStartedAt = performance.now()
    button.click()
    await waitFor(
      () => document.querySelector(
        '[data-cached-file-path="' + CSS.escape(relativePath) + '"]'
      ),
      "cached Eidos File " + (index + 1)
    )
    const editorContainer = await waitFor(
      () => document.querySelector(
        '.file-editor[aria-label="' + CSS.escape(relativePath) + '"]'
      ),
      "active Eidos File " + (index + 1)
    )
    const editorShell = await waitFor(
      () => document.querySelector(
        '.file-editor[aria-label="' + CSS.escape(relativePath) + '"] ' +
        '[data-eidos-file-editor-shell]'
      ),
      "rendered Eidos File " + (index + 1)
    )
    if (relativePath === "dense-100000.eidos") {
      if (editorContainer.dataset.eidosFileRowCount !== "100000") {
        throw new Error(
          "Dense Grid row count is not canonical: " +
            editorContainer.dataset.eidosFileRowCount
        )
      }
      const canvas = await waitFor(
        () => [...editorShell.querySelectorAll("canvas")].find(
          (candidate) => candidate.width > 0 && candidate.height > 0
        ),
        "100,000-row Grid canvas"
      )
      await new Promise((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(resolve))
      )
      denseGrid = {
        rows: 100000,
        renderedFirstFrameMs: performance.now() - openStartedAt,
        canvasWidth: canvas.width,
        canvasHeight: canvas.height,
      }
    }
    utilityOpenMs.push(performance.now() - openStartedAt)
  }
  if (
    !denseGrid ||
    denseGrid.renderedFirstFrameMs >
      ${EIDOS_LITE_PERFORMANCE_BUDGET_MS.gridFirstPageHundredThousandRows}
  ) {
    throw new Error(
      "Packaged 100,000-row Grid missed its rendered first-frame gate: " +
        JSON.stringify(denseGrid)
    )
  }
  const utilityOpenP95Ms = Math.max(...utilityOpenMs)
  if (
    utilityOpenP95Ms >
    ${EIDOS_LITE_PERFORMANCE_BUDGET_MS.nativeOpenTenMiB}
  ) {
    throw new Error(
      "Packaged utility open exceeded the PRD P95 budget: " +
        JSON.stringify(utilityOpenMs)
    )
  }
  const cachedFiles = [...document.querySelectorAll("[data-cached-file-path]")]
    .map((element) => element.dataset.cachedFilePath || "")
    .filter(Boolean)
  if (
    cachedFiles.length !== 3 ||
    cachedFiles.includes(eidosPaths[0]) ||
    !cachedFiles.includes(eidosPaths[3])
  ) {
    throw new Error(
      "Single-active-file renderer LRU is not bounded: " +
      JSON.stringify(cachedFiles)
    )
  }
  const activeTreeItem = await waitFor(
    () => {
      const candidate = treeItem(eidosPaths[3])
      return candidate?.getAttribute("aria-selected") === "true"
        ? candidate
        : null
    },
    "active Pierre tree item"
  )
  const workbench = document.querySelector(".workbench")
  const sidebar = document.querySelector(".space-sidebar")
  const sidebarResizer = document.querySelector("[data-sidebar-resizer]")
  const collapseSidebar = document.querySelector('[data-sidebar-toggle="close"]')
  if (!workbench || !sidebar || !sidebarResizer || !collapseSidebar) {
    throw new Error("Resizable workbench shell is incomplete")
  }
  const syncAction = document.querySelector(
    'button[data-titlebar-action="sync"]'
  )
  if (!syncAction) throw new Error("Eidos Sync action is missing")
  syncAction.click()
  const syncPanel = await waitFor(
    () => {
      const candidate = document.querySelector('.sync-dialog[data-sync-mode="enable"]')
      return candidate?.dataset.syncAccountState === "signed-out"
        ? candidate
        : null
    },
    "signed-out Eidos Sync control plane"
  )
  const syncSignIn = syncPanel.querySelector("[data-sync-sign-in]")
  const stagingBadge = syncPanel.querySelector(
    '.environment-badge[data-service-environment="staging"]'
  )
  const syncControl = {
    action: Boolean(syncAction),
    iconAction: syncAction.textContent?.trim() === "",
    panel: ["dialog", "complementary"].includes(
      syncPanel.getAttribute("role") ?? ""
    ),
    environment: syncPanel.dataset.syncEnvironment === "staging",
    environmentBadge: Boolean(stagingBadge),
    signedOut: syncPanel.dataset.syncAccountState === "signed-out",
    gated: syncPanel.dataset.syncCanEnable === "false",
    signInAvailable: Boolean(syncSignIn),
    cloneApi:
      typeof window.eidosLite.listSyncRepositories === "function" &&
      typeof window.eidosLite.cloneSyncRepository === "function",
    syncApi: typeof window.eidosLite.runSync === "function",
    syncProgressApi: typeof window.eidosLite.onSyncProgress === "function",
    syncQueueApi: typeof window.eidosLite.getSyncQueueStatus === "function",
    syncQueueEventsApi:
      typeof window.eidosLite.onSyncQueueChanged === "function",
    recoveryApi:
      typeof window.eidosLite.copyLocalRecoverySpace === "function" &&
      typeof window.eidosLite.cloneHostedRecoverySpace === "function",
  }
  if (Object.values(syncControl).some((value) => !value)) {
    throw new Error(
      "Eidos Sync signed-out gate is incomplete: " + JSON.stringify(syncControl)
    )
  }
  const closeSync = syncPanel.querySelector('[aria-label="Close Eidos Sync"]')
  if (!closeSync) throw new Error("Eidos Sync close action is missing")
  closeSync.click()
  await waitFor(
    () => !document.querySelector(".sync-dialog") && true,
    "closed Eidos Sync control plane"
  )
  const initialSidebarWidth = sidebar.getBoundingClientRect().width
  sidebarResizer.dispatchEvent(
    new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true })
  )
  const resizedSidebarWidth = await waitFor(
    () => {
      const width = sidebar.getBoundingClientRect().width
      return width > initialSidebarWidth ? width : 0
    },
    "keyboard-resized Space Explorer"
  )
  collapseSidebar.click()
  const sidebarCollapsed = await waitFor(
    () => workbench.dataset.sidebarCollapsed === "true",
    "collapsed Space Explorer"
  )
  const reopenSidebar = await waitFor(
    () => document.querySelector('[data-sidebar-toggle="open"]'),
    "Space Explorer reopen action"
  )
  reopenSidebar.click()
  const sidebarReopened = await waitFor(
    () => workbench.dataset.sidebarCollapsed === "false",
    "reopened Space Explorer"
  )
  sidebarResizer.dispatchEvent(
    new KeyboardEvent("keydown", { key: "ArrowLeft", bubbles: true })
  )
  const sidebarWidthRestored = await waitFor(
    () =>
      Math.abs(sidebar.getBoundingClientRect().width - initialSidebarWidth) < 1,
    "restored Space Explorer width"
  )
  const sidebarHeader = document.querySelector(".sidebar-header")
  const spaceHeading = document.querySelector(".space-heading")
  const fileTitlebar = document.querySelector(".file-titlebar")
  const workbenchTop = workbench.getBoundingClientRect().top
  const sidebarHeaderRect = sidebarHeader?.getBoundingClientRect()
  const fileTitlebarRect = fileTitlebar?.getBoundingClientRect()
  const spaceHeadingStyle = spaceHeading
    ? getComputedStyle(spaceHeading)
    : undefined
  const workbenchLayout = {
    pierreTree: treeHost.matches("[data-space-file-tree]"),
    activePathSelected: activeTreeItem.getAttribute("aria-selected") === "true",
    sidebarResized: resizedSidebarWidth > initialSidebarWidth,
    sidebarCollapsed,
    sidebarReopened,
    sidebarWidthRestored,
    singleTitleRow:
      sidebarHeaderRect !== undefined &&
      fileTitlebarRect !== undefined &&
      Math.abs(sidebarHeaderRect.top - workbenchTop) < 1 &&
      Math.abs(fileTitlebarRect.top - workbenchTop) < 1 &&
      Math.abs(sidebarHeaderRect.height - fileTitlebarRect.height) < 1,
    compactTitleRow:
      fileTitlebarRect !== undefined && fileTitlebarRect.height <= 40,
    unifiedSidebar:
      spaceHeadingStyle !== undefined &&
      spaceHeadingStyle.borderTopWidth === "0px" &&
      spaceHeadingStyle.borderBottomWidth === "0px" &&
      ["rgba(0, 0, 0, 0)", "transparent"].includes(
        spaceHeadingStyle.backgroundColor
      ),
  }
  if (Object.values(workbenchLayout).some((value) => !value)) {
    throw new Error(
      "Space workbench layout contract is incomplete: " +
      JSON.stringify(workbenchLayout)
    )
  }
  const canonicalShell = await waitFor(
    () => document.querySelector("[data-eidos-file-editor-shell]"),
    "canonical Eidos File editor shell"
  )
  const canonicalEditor = {
    shell: Boolean(canonicalShell),
    viewTabs: Boolean(document.querySelector("[data-eidos-file-view-id]")),
    queryToolbar: Boolean(document.querySelector("[data-eidos-file-query-toolbar]")),
    fields: Boolean(document.querySelector("[data-eidos-file-view-fields-trigger]")),
    sheetTabs: Boolean(document.querySelector("[data-eidos-file-table-id]")),
  }
  if (Object.values(canonicalEditor).some((value) => !value)) {
    throw new Error("Canonical Eidos File Web controls are incomplete")
  }
  window.__eidosLiteSmokeStep = "CSV editor actions"
  const addTableAction = document.querySelector(
    '[aria-label="Add Eidos File table"]'
  )
  if (!addTableAction) throw new Error("Add Eidos File table action is missing")
  addTableAction.click()
  const csvImportAction = await waitFor(
    () =>
      document.querySelector(
        '[aria-label="Import CSV as a new Eidos File table"]'
      ),
    "canonical CSV import action"
  )
  document.dispatchEvent(
    new KeyboardEvent("keydown", { key: "Escape", bubbles: true })
  )
  const activeViewTab = document.querySelector("[data-eidos-file-view-id]")
  if (!activeViewTab) throw new Error("CSV export requires an Eidos File view")
  const viewRect = activeViewTab.getBoundingClientRect()
  activeViewTab.dispatchEvent(
    new MouseEvent("contextmenu", {
      bubbles: true,
      button: 2,
      clientX: viewRect.left + 4,
      clientY: viewRect.top + 4,
    })
  )
  const csvExportAction = await waitFor(
    () => [...document.querySelectorAll('[role="menuitem"]')].find(
      (item) => item.textContent?.includes("Export current view as CSV")
    ),
    "canonical CSV export action"
  )
  document.dispatchEvent(
    new KeyboardEvent("keydown", { key: "Escape", bubbles: true })
  )
  window.__eidosLiteSmokeStep = "file lifecycle"
  const folderCreated = await window.eidosLite.createFolder(null, "Lifecycle")
  const fileCreated = await window.eidosLite.createEidosFile(
    "Lifecycle",
    "Created"
  )
  const renamed = await window.eidosLite.renamePath(
    fileCreated.relativePath,
    "Renamed.eidos"
  )
  const moved = await window.eidosLite.movePath(renamed.relativePath, null)
  const copied = await window.eidosLite.copyPath(
    moved.relativePath,
    "Lifecycle"
  )
  const trashed = await window.eidosLite.deletePath(copied.relativePath)
  const lifecycleEntries = []
  const collectLifecycle = (entries) => {
    for (const entry of entries) {
      lifecycleEntries.push(entry.relativePath)
      if (entry.children) collectLifecycle(entry.children)
    }
  }
  collectLifecycle(trashed.snapshot.entries)
  const fileLifecycle = {
    created: folderCreated.snapshot.entries.some(
      (entry) => entry.relativePath === "Lifecycle"
    ),
    renamed: renamed.relativePath === "Lifecycle/Renamed.eidos",
    moved: moved.relativePath === "Renamed.eidos",
    copied: copied.relativePath === "Lifecycle/Renamed.eidos",
    trashed:
      lifecycleEntries.includes("Renamed.eidos") &&
      !lifecycleEntries.includes("Lifecycle/Renamed.eidos"),
  }
  if (Object.values(fileLifecycle).some((value) => !value)) {
    throw new Error(
      "Space file lifecycle is incomplete: " + JSON.stringify(fileLifecycle)
    )
  }
  const fieldsTrigger = await waitFor(
    () => {
      const candidate = document.querySelector(
        "[data-eidos-file-view-fields-trigger]"
      )
      return candidate && !candidate.disabled ? candidate : null
    },
    "enabled Fields control after file operations"
  )
  fieldsTrigger.click()
  const fieldsPopover = await waitFor(
    () => document.querySelector(
      '[data-radix-popper-content-wrapper] > [data-state="open"]'
    ),
    "styled Fields popover"
  )
  const fieldsTriggerStyle = getComputedStyle(fieldsTrigger)
  const fieldsPopoverStyle = getComputedStyle(fieldsPopover)
  const borderTokenProbe = document.createElement("div")
  borderTokenProbe.style.borderColor = "var(--border)"
  document.body.append(borderTokenProbe)
  const borderTokenColor = getComputedStyle(borderTokenProbe).borderTopColor
  borderTokenProbe.remove()
  const styleContract = {
    formControlsReset: fieldsTriggerStyle.borderTopWidth === "0px",
    portalBackground:
      fieldsPopoverStyle.backgroundColor !== "rgba(0, 0, 0, 0)" &&
      fieldsPopoverStyle.backgroundColor !== "transparent",
    portalBorder:
      fieldsPopoverStyle.borderTopWidth === "1px" &&
      fieldsPopoverStyle.borderTopStyle === "solid" &&
      fieldsPopoverStyle.borderTopColor === borderTokenColor,
    portalRadius: Number.parseFloat(fieldsPopoverStyle.borderTopLeftRadius) > 0,
  }
  if (Object.values(styleContract).some((value) => !value)) {
    throw new Error(
      "Canonical Eidos File Web style contract is incomplete: " +
      JSON.stringify(styleContract)
    )
  }
  fieldsTrigger.click()
  window.__eidosLiteSmokeStep = "open mutation target"
  const opened = await window.eidosLite.openEidosFile(eidosPaths[0])
  const table = opened.snapshot.tables[0]
  if (!table) throw new Error("Mutation smoke requires one table")
  const writableField = table.fields.find(
    (field) => field.isRecordLabel && !field.isDerived
  ) || table.fields.find(
    (field) => field.type === "text" && !field.isDerived && !field.systemRole
  )
  if (!writableField) throw new Error("Mutation smoke requires a writable text field")
  window.__eidosLiteSmokeStep = "CSV runtime workflow"
  const csvBytes = new TextEncoder().encode(
    "Name,Score,Active\\nAda,42,true\\nLin,7,false\\n"
  ).buffer
  const csvPlan = await window.eidosLite.callRuntime(
    opened.sessionId,
    "previewCsv",
    ["Packaged tasks.csv", csvBytes, {}]
  )
  const csvImported = await window.eidosLite.callRuntime(
    opened.sessionId,
    "importCsv",
    ["Packaged tasks.csv", csvBytes, {}]
  )
  const importedTable = csvImported.snapshot.tables.find(
    (candidate) => candidate.table.id === csvImported.result.table.id
  )
  const csvWorkflow = {
    importAction: Boolean(csvImportAction),
    exportAction: Boolean(csvExportAction),
    saveApi: typeof window.eidosLite.saveCsvFile === "function",
    previewRows: csvPlan.rowCount,
    importedRows: importedTable?.rowCount ?? -1,
    inferredNumber: csvPlan.columns[1]?.type === "number",
  }
  if (
    !csvWorkflow.importAction ||
    !csvWorkflow.exportAction ||
    !csvWorkflow.saveApi ||
    csvWorkflow.previewRows !== 2 ||
    csvWorkflow.importedRows !== 2 ||
    !csvWorkflow.inferredNumber
  ) {
    throw new Error(
      "Packaged CSV workflow is incomplete: " + JSON.stringify(csvWorkflow)
    )
  }
  const beforeCount = table.rowCount
  window.__eidosLiteSmokeStep = "temporary row insert"
  const inserted = await window.eidosLite.callRuntime(
    opened.sessionId,
    "insertRow",
    [table.table.id, { [writableField.id]: "Packaged mutation probe" }]
  )
  const afterInsert = await window.eidosLite.callRuntime(
    opened.sessionId,
    "getSnapshot",
    []
  )
  const afterInsertCount = afterInsert.tables.find(
    (candidate) => candidate.table.id === table.table.id
  )?.rowCount
  if (afterInsertCount !== beforeCount + 1) {
    throw new Error("Packaged mutation insert did not change the real Eidos File")
  }
  window.__eidosLiteSmokeStep = "temporary row delete"
  await window.eidosLite.callRuntime(opened.sessionId, "deleteRows", [
    table.table.id,
    [inserted.row._id],
  ])
  const afterDelete = await window.eidosLite.callRuntime(
    opened.sessionId,
    "getSnapshot",
    []
  )
  const afterDeleteCount = afterDelete.tables.find(
    (candidate) => candidate.table.id === table.table.id
  )?.rowCount
  if (afterDeleteCount !== beforeCount) {
    throw new Error("Packaged mutation delete did not restore the row count")
  }
  window.__eidosLiteSmokeStep = "enable versioning"
  const versionAction = document.querySelector(
    'button[data-titlebar-action="version"]'
  )
  if (!versionAction) throw new Error("Version action is missing")
  versionAction.click()
  const versionSetup = await waitFor(
    () => document.querySelector('.version-panel[data-version-initialized="false"]'),
    "Version setup panel"
  )
  const enableVersioning = versionSetup.querySelector("[data-enable-versioning]")
  if (!enableVersioning) throw new Error("Enable versioning panel action is missing")
  enableVersioning.click()
  await waitFor(
    () => document.querySelector('.version-panel[data-version-initialized="true"]'),
    "initialized Version panel"
  )
  const versioned = await window.eidosLite.refreshSpace()
  if (!versioned.graft.initialized || versioned.graft.clean !== true) {
    throw new Error(
      "Enable Versioning did not create a clean local repository: " +
        JSON.stringify(versioned.graft)
    )
  }
  versionAction.click()
  await waitFor(
    () => !document.querySelector(".version-panel") && true,
    "closed Version panel"
  )
  window.__eidosLiteSmokeStep = "checkpoint row insert"
  await window.eidosLite.callRuntime(opened.sessionId, "insertRow", [
    table.table.id,
    { [writableField.id]: "Persisted checkpoint probe" },
  ])
  const dirty = await window.eidosLite.refreshSpace()
  if (!dirty || dirty.graft.clean !== false) {
    throw new Error("A real Eidos File mutation did not dirty the Space repository")
  }
  const changes = await window.eidosLite.getVersionChanges()
  const selectedSummary = await window.eidosLite.getVersionPathDiff(eidosPaths[0])
  const changedTable = selectedSummary.files
    .flatMap((file) => file.tables)
    .find((tableDiff) => {
      const summary = tableDiff.summary
      return summary && summary.inserts + summary.deletes + summary.updates > 0
    })
  if (!changedTable) {
    throw new Error(
      "Row-aware whole-Space Changes did not return a table summary: " +
        JSON.stringify({
          requestedPath: eidosPaths[0],
          changedPaths: changes.paths,
          selectedSummary,
        })
    )
  }
  const selectedRows = await window.eidosLite.getVersionPathDiff(
    eidosPaths[0],
    null,
    null,
    changedTable.name
  )
  const rowChanges = selectedRows.files.reduce(
    (total, file) => total + file.tables.reduce(
      (tableTotal, tableDiff) => tableTotal + tableDiff.changes.length,
      0
    ),
    0
  )
  if (!changes.paths.some((change) => change.path === eidosPaths[0]) || rowChanges < 1) {
    throw new Error("Row-aware whole-Space Changes did not describe the mutation")
  }
  const dirtyVersionButton = await waitFor(
    () => {
      const candidate = document.querySelector(
        'button[data-titlebar-action="version"][data-version-change-count]'
      )
      return Number(candidate?.dataset.versionChangeCount) >= 1
        ? candidate
        : null
    },
    "Version History change badge"
  )
  const changeBadge = Boolean(
    dirtyVersionButton.querySelector(".version-change-badge")
  )
  window.__eidosLiteSmokeStep = "create checkpoint"
  const checkpoint = await window.eidosLite.createCheckpoint(
    "Packaged mutation checkpoint"
  )
  if (!checkpoint.graft.currentHead || checkpoint.graft.checking !== true) {
    throw new Error(
      "Whole-Space checkpoint did not publish its durable HEAD before status refresh"
    )
  }
  const settledCheckpoint = await window.eidosLite.refreshSpace()
  if (settledCheckpoint.graft.clean !== true) {
    const residualChanges = await window.eidosLite.getVersionChanges()
    const residualState = JSON.stringify({
      graft: settledCheckpoint.graft,
      paths: residualChanges.paths,
    })
    throw new Error(
      "Whole-Space checkpoint did not leave a clean repository: " +
        residualState
    )
  }
  const afterCheckpoint = await window.eidosLite.callRuntime(
    opened.sessionId,
    "getSnapshot",
    []
  )
  const checkpointCount = afterCheckpoint.tables.find(
    (candidate) => candidate.table.id === table.table.id
  )?.rowCount
  if (checkpointCount !== beforeCount + 1) {
    throw new Error("Checkpoint materialization did not reopen the edited runtime")
  }
  const history = await window.eidosLite.getVersionHistory(10)
  if (!history.currentHead || history.commits.length < 2) {
    throw new Error("Checkpoint History did not return both local commits")
  }
  const latest = history.commits[0]
  const base = history.commits[1]
  if (latest.files < 1) {
    throw new Error("Checkpoint History did not report changed file count")
  }
  const latestDiff = await window.eidosLite.getVersionDiff(
    latest.id,
    latest.parent
  )
  if (!latestDiff.paths.some((change) => change.path === eidosPaths[0])) {
    throw new Error("Checkpoint diff did not include the edited Eidos File")
  }
  window.__eidosLiteSmokeStep = "restore checkpoint"
  const restored = await window.eidosLite.restoreCheckpoint(
    base.id,
    history.currentHead
  )
  if (restored.graft.clean !== true) {
    throw new Error("Restore did not leave the Space at a clean checkpoint")
  }
  const afterRestore = await window.eidosLite.callRuntime(
    opened.sessionId,
    "getSnapshot",
    []
  )
  const restoredCount = afterRestore.tables.find(
    (candidate) => candidate.table.id === table.table.id
  )?.rowCount
  if (restoredCount !== beforeCount) {
    throw new Error("Restore did not reopen the runtime at the selected checkpoint")
  }
  const restoredHistory = await window.eidosLite.getVersionHistory(10)
  const restoreCreatedCheckpoint =
    restoredHistory.commits.length === history.commits.length + 1 &&
    restoredHistory.commits[0]?.parent === history.currentHead &&
    restoredHistory.commits[0]?.message.startsWith("Restore checkpoint")
  if (!restoreCreatedCheckpoint) {
    throw new Error("Restore rewrote history instead of creating a new checkpoint")
  }
  window.__eidosLiteSmokeStep = "automatic checkpoint"
  const defaultPreferences = await window.eidosLite.getPreferences()
  if (defaultPreferences.automaticCheckpoints) {
    throw new Error("Automatic checkpoints must be disabled by default")
  }
  await window.eidosLite.updatePreferences({ automaticCheckpoints: true })
  await window.eidosLite.createFolder(null, "automatic-checkpoint-probe")
  await window.eidosLite.createEidosFile(
    "automatic-checkpoint-probe",
    "tracked.eidos"
  )
  const automaticDeadline = Date.now() + 15000
  let automaticHistory
  let automaticSnapshot
  while (Date.now() < automaticDeadline) {
    await new Promise((resolve) => setTimeout(resolve, 250))
    const [candidateHistory, candidateSnapshot] = await Promise.all([
      window.eidosLite.getVersionHistory(10),
      window.eidosLite.refreshSpace(),
    ])
    if (
      candidateSnapshot?.graft.clean === true &&
      candidateHistory.commits[0]?.message === "Eidos Lite automatic checkpoint"
    ) {
      automaticHistory = candidateHistory
      automaticSnapshot = candidateSnapshot
      break
    }
  }
  if (!automaticHistory || !automaticSnapshot) {
    throw new Error("Stable Space change did not create an automatic checkpoint")
  }
  const afterAutomaticCheckpoint = await window.eidosLite.callRuntime(
    opened.sessionId,
    "getSnapshot",
    []
  )
  if (
    afterAutomaticCheckpoint.tables.find(
      (candidate) => candidate.table.id === table.table.id
    )?.rowCount !== beforeCount
  ) {
    throw new Error("Automatic checkpoint did not reopen the resident runtime")
  }
  await window.eidosLite.updatePreferences({ automaticCheckpoints: false })
  window.__eidosLiteSmokeStep = "Sync failure safety"
  const expectedSyncFailures = [
    { code: "offline" },
    { code: "authentication-required" },
    { code: "device-revoked" },
    { code: "entitlement-inactive" },
    { code: "remote-not-found", status: 404 },
    { code: "remote-conflict", status: 409 },
    { code: "quota-exceeded", status: 413 },
    { code: "protocol-version-mismatch", status: 426 },
    { code: "rate-limited", status: 429 },
    { code: "remote-persistence-failed", status: 500 },
    { code: "service-unavailable", status: 502 },
    { code: "service-unavailable", status: 503 },
    { code: "service-unavailable", status: 504 },
    { code: "sync-process-crashed" },
  ]
  const ordinarySignature = (snapshot) => {
    const flatten = (entries) =>
      entries.flatMap((entry) => [
        entry,
        ...(entry.children ? flatten(entry.children) : []),
      ])
    return JSON.stringify(
      flatten(snapshot.entries)
        .filter((entry) => entry.kind === "file" || entry.kind === "symlink")
        .map((entry) => [entry.relativePath, entry.size, entry.modifiedAtMs])
    )
  }
  const ordinaryFilesBeforeFailures = ordinarySignature(
    await window.eidosLite.getSpace()
  )
  const syncFailures = []
  const syncQueueStates = []
  let localRuntimeAvailable = true
  let gateStayedReady = true
  for (const expected of expectedSyncFailures) {
    const response = await window.eidosLite.runSync()
    if (response.ok) {
      throw new Error("Packaged Sync fault unexpectedly succeeded")
    }
    syncFailures.push(response)
    const queueStatus = await window.eidosLite.getSyncQueueStatus()
    syncQueueStates.push(queueStatus?.state ?? "missing")
    if (
      response.failure.code !== expected.code ||
      (expected.status !== undefined &&
        response.failure.status !== expected.status)
    ) {
      throw new Error(
        "Packaged Sync fault mismatch: expected " +
          JSON.stringify(expected) +
          ", received " +
          JSON.stringify(response.failure)
      )
    }
    gateStayedReady =
      gateStayedReady &&
      (await window.eidosLite.getSpace()).operation.phase === "ready"
    const localSnapshot = await window.eidosLite.callRuntime(
      opened.sessionId,
      "getSnapshot",
      []
    )
    localRuntimeAvailable =
      localRuntimeAvailable &&
      localSnapshot.tables.some(
        (candidate) => candidate.table.id === table.table.id
      )
  }
  const ordinaryFilesUnchanged =
    ordinarySignature(await window.eidosLite.getSpace()) ===
    ordinaryFilesBeforeFailures
  const automaticRetryDeadline = Date.now() + 5000
  let automaticRetryStatus = await window.eidosLite.getSyncQueueStatus()
  while (
    Date.now() < automaticRetryDeadline &&
    !(
      automaticRetryStatus?.state === "paused" &&
      automaticRetryStatus.lastFailure?.code === "unknown"
    )
  ) {
    await new Promise((resolve) => setTimeout(resolve, 50))
    automaticRetryStatus = await window.eidosLite.getSyncQueueStatus()
  }
  const syncReliability = {
    codes: syncFailures.map((response) => response.failure.code),
    allClassified: syncFailures.every(
      (response) => response.failure.code !== "unknown"
    ),
    allLocalSafe: syncFailures.every(
      (response) => response.failure.localSafe === true
    ),
    allActionable: syncFailures.every(
      (response) =>
        Boolean(response.failure.action) &&
        Boolean(response.failure.actionLabel)
    ),
    failedTelemetry: syncFailures.every(
      (response) =>
        response.telemetry.durationMs >= 0 &&
        response.telemetry.phases.length >= 1
    ),
    localRuntimeAvailable,
    gateStayedReady,
    ordinaryFilesUnchanged,
    queueStates: syncQueueStates,
    statuses: syncFailures.map((response) => response.failure.status ?? null),
    failuresScheduledSafely: syncQueueStates.every(
      (state) => state === "retry-wait" || state === "paused"
    ),
    automaticRetryAttempted:
      automaticRetryStatus?.state === "paused" &&
      automaticRetryStatus.lastFailure?.code === "unknown" &&
      automaticRetryStatus.attempt === 2,
  }
  if (
    !syncReliability.allClassified ||
    !syncReliability.allLocalSafe ||
    !syncReliability.allActionable ||
    !syncReliability.failedTelemetry ||
    !syncReliability.localRuntimeAvailable ||
    !syncReliability.gateStayedReady ||
    !syncReliability.ordinaryFilesUnchanged ||
    !syncReliability.failuresScheduledSafely ||
    !syncReliability.automaticRetryAttempted
  ) {
    throw new Error(
      "Packaged Sync failure safety is incomplete: " +
        JSON.stringify(syncReliability)
    )
  }
  window.__eidosLiteSmokeStep = "text file editor"
  const readmePreview = await window.eidosLite.previewTextFile("README.md")
  if (readmePreview.type !== "text" || readmePreview.truncated) {
    throw new Error("README text preview is not editable")
  }
  const readmeItem = await waitFor(() => treeItem("README.md"), "README in Space Explorer")
  readmeItem.click()
  const textEditorSurface = await waitFor(
    () => document.querySelector('[data-text-file-editor="README.md"]'),
    "README text editor"
  )
  const pierreEditor = await waitFor(() => {
    const surface = textEditorSurface.querySelector(
      ".text-file-editor-virtualizer"
    )
    if (!surface) return false
    return [...surface.querySelectorAll("*")].some((candidate) =>
      candidate.shadowRoot?.querySelector('[contenteditable="true"]')
    )
  }, "Pierre editable text surface")
  const editedReadme = readmePreview.content + "Edited in packaged smoke.\\n"
  const savedReadme = await window.eidosLite.saveTextFile({
    relativePath: "README.md",
    content: editedReadme,
    expectedRevision: readmePreview.revision,
  })
  const reloadedReadme = await window.eidosLite.previewTextFile("README.md")
  const staleSave = await window.eidosLite.saveTextFile({
    relativePath: "README.md",
    content: "This stale write must not win.\\n",
    expectedRevision: readmePreview.revision,
  })
  const textEditor = {
    surface: Boolean(textEditorSurface),
    pierreRendered: Boolean(pierreEditor),
    createApi: typeof window.eidosLite.createTextFile === "function",
    saveApi: typeof window.eidosLite.saveTextFile === "function",
    saved:
      savedReadme.status === "saved" &&
      reloadedReadme.type === "text" &&
      reloadedReadme.content === editedReadme,
    conflictProtected:
      staleSave.status === "conflict" &&
      staleSave.current.type === "text" &&
      staleSave.current.content === editedReadme,
  }
  if (Object.values(textEditor).some((value) => !value)) {
    throw new Error(
      "Packaged text editor is incomplete: " + JSON.stringify(textEditor)
    )
  }
  const historyButton = document.querySelector(
    'button[data-titlebar-action="version"]'
  )
  if (!historyButton) throw new Error("Version History UI action is missing")
  historyButton.click()
  await waitFor(() => document.querySelector(".version-panel"), "Version History panel")
  await new Promise((resolve) => setTimeout(resolve, 500))
  const diagnosticSummary = await window.eidosLite.getDiagnostics()
  const serializedDiagnostics = JSON.stringify(diagnosticSummary)
  return {
    performance: {
      coldStartMs: 0,
      budgets: {
        coldStartMs: ${EIDOS_LITE_PERFORMANCE_BUDGET_MS.packagedColdStart},
        utilityOpenP95Ms: ${EIDOS_LITE_PERFORMANCE_BUDGET_MS.nativeOpenTenMiB},
        denseGridFirstFrameMs: ${EIDOS_LITE_PERFORMANCE_BUDGET_MS.gridFirstPageHundredThousandRows},
      },
      startup: {
        launcherToBootstrapMs: 0,
        bootstrapToMainMs: 0,
        mainToReadyMs: 0,
        readyToIpcMs: 0,
        ipcToProbeMs: 0,
        probeToRendererMs: 0,
        rendererToUsableMs: 0,
        totalMs: 0,
      },
      utilityOpenMs,
      utilityOpenP95Ms,
      denseGrid: {
        ...denseGrid,
        preparationMs: 0,
      },
    },
    diagnostics: {
      workbenchActionAbsent: !document.querySelector(
        ".file-titlebar [data-copy-diagnostics]"
      ),
      copyApi: typeof window.eidosLite.copyDiagnostics === "function",
      schemaVersion: diagnosticSummary.schemaVersion,
      environment: diagnosticSummary.environment,
      openSpace: diagnosticSummary.space.open === true,
      safe:
        !serializedDiagnostics.includes("/Users/") &&
        !serializedDiagnostics.includes("https://") &&
        !serializedDiagnostics.includes("remoteUrl") &&
        !serializedDiagnostics.includes("accessToken"),
    },
    environment: {
      ...appInfo.services,
      stagingBadge: Boolean(stagingBadge),
    },
    space: { name: space.name, eidosFileCount: space.eidosFileCount },
    graft: space.graft,
    cachedFiles,
    runtimeCache: { residentPaths: [], trackedPaths: [] },
    fileLifecycle,
    textEditor,
    canonicalEditor,
    csvWorkflow,
    workbenchLayout,
    styleContract,
    syncControl,
    syncReliability,
    mutation: {
      beforeCount,
      afterInsertCount,
      afterDeleteCount,
      checkpointCount,
      restoredCount,
    },
    versioning: {
      initialized: automaticSnapshot.graft.initialized,
      clean: automaticSnapshot.graft.clean,
      iconAction: Boolean(historyButton.querySelector("svg")),
      changeBadge,
      changePaths: changes.paths.length,
      rowChanges,
      historyCount: automaticHistory.commits.length,
      restoreCreatedCheckpoint,
      automaticCheckpoint: true,
    },
    inlineError: document.querySelector(".inline-error span")?.textContent || undefined,
  }
})()
`

export async function runPackagedSmoke(
  controller: WindowController,
  spaceRoot: string,
  resultPath: string,
  startup: PackagedSmokeStartup
): Promise<void> {
  if (process.env.EIDOS_LITE_SMOKE_SCOPE === "text-history") {
    await runPackagedTextHistorySmoke(
      controller,
      spaceRoot,
      resultPath,
      startup
    )
    return
  }
  const { coldStartMs, failures } = startup
  let welcomeWindow: BrowserWindow | null = startup.welcomeWindow
  let onboardingWindow: BrowserWindow | null = null
  let window: BrowserWindow | null = null
  const observeWindow = (candidate: BrowserWindow) => {
    observePackagedSmokeWindow(candidate, failures)
  }
  try {
    const onboardingRoot = path.join(
      path.dirname(spaceRoot),
      "Empty Space Onboarding"
    )
    await fs.mkdir(onboardingRoot)
    onboardingWindow = await controller.createSpaceWindow(
      onboardingRoot,
      observeWindow
    )
    welcomeWindow.destroy()
    welcomeWindow = null
    let onboarding: EmptySpaceOnboardingResult
    try {
      onboarding = (await onboardingWindow.webContents.executeJavaScript(
        emptySpaceOnboardingProbe,
        true
      )) as EmptySpaceOnboardingResult
    } catch (error) {
      const step = await onboardingWindow.webContents.executeJavaScript(
        "window.__eidosLiteSmokeStep || 'unknown'",
        true
      )
      throw new Error(`Onboarding smoke failed at ${step}: ${String(error)}`)
    }
    if (Object.values(onboarding).some((value) => !value)) {
      throw new Error(
        `Empty Space onboarding is incomplete: ${JSON.stringify(onboarding)}`
      )
    }
    const densePreparationStartedAt = performance.now()
    const denseRuntime = createEidosFile(
      path.join(spaceRoot, "dense-100000.eidos"),
      { title: "Dense Grid" }
    )
    try {
      denseRuntime.importTable(
        {
          name: "Records",
          fields: [
            { name: "Name", type: "text", isRecordLabel: true },
            { name: "Score", type: "number" },
          ],
        },
        Array.from({ length: 100_000 }, (_, index) => ({
          Name: `Record ${String(index + 1).padStart(6, "0")}`,
          Score: index + 1,
        }))
      )
    } finally {
      denseRuntime.close()
    }
    const densePreparationMs = performance.now() - densePreparationStartedAt
    window = await controller.createSpaceWindow(spaceRoot, observeWindow)
    onboardingWindow.destroy()
    onboardingWindow = null
    let report: RendererSmokeResult
    try {
      report = (await window.webContents.executeJavaScript(
        rendererProbe,
        true
      )) as RendererSmokeResult
    } catch (error) {
      const step = await window.webContents.executeJavaScript(
        "window.__eidosLiteSmokeStep || 'unknown'",
        true
      )
      throw new Error(`Renderer smoke failed at ${step}: ${String(error)}`)
    }
    report.onboarding = onboarding
    report.performance.coldStartMs = coldStartMs
    report.performance.startup = startup.timings
    report.performance.denseGrid.preparationMs = densePreparationMs
    const routedWindow = await controller.openEidosFilePath(
      path.join(spaceRoot, "projects", "content-calendar.eidos")
    )
    const launchRouting = (await window.webContents.executeJavaScript(
      launchRouteProbe,
      true
    )) as Pick<
      RendererSmokeResult["launchRouting"],
      "selectedFile" | "singleEditor"
    >
    report.launchRouting = {
      reusedSpaceWindow: routedWindow === window,
      ...launchRouting,
    }
    const session = controller.requireSession(window.webContents)
    report.runtimeCache = {
      residentPaths: session.runtimePool.residentRelativePaths(),
      trackedPaths: session.runtimePool.openRelativePaths(),
    }
    if (report.runtimeCache.residentPaths.length > 3) {
      throw new Error(
        `Runtime LRU exceeded its bound: ${JSON.stringify(report.runtimeCache)}`
      )
    }
    const recents = await controller.listRecentSpaces()
    const externalProbe = await session.createEidosFile(
      null,
      "External Rename Probe"
    )
    if (!externalProbe.relativePath) {
      throw new Error("External rename probe was not created")
    }
    const externalRuntime = await session.openEidosFile(
      externalProbe.relativePath
    )
    const externalSource = session.resolveUserPath(externalProbe.relativePath)
    const externalMoved = `${externalSource}.moved`
    await fs.rename(externalSource, externalMoved)
    let externalRenameInvalidated = false
    let externalRenameIssue = false
    try {
      await session.callRuntime(externalRuntime.sessionId, "getSnapshot", [])
    } catch {
      externalRenameInvalidated = !session.runtimePool
        .openRelativePaths()
        .includes(externalProbe.relativePath)
      const issue = await session.inspectEidosFileIssue(
        externalProbe.relativePath
      )
      externalRenameIssue =
        issue?.reason === "missing" && issue.localSafe === true
    } finally {
      await fs.rename(externalMoved, externalSource)
    }
    const externalRetry = await session.openEidosFile(
      externalProbe.relativePath
    )
    const crashTarget = await session.openEidosFile(
      "projects/content-calendar.eidos"
    )
    report.lifecycleRecovery = {
      recentRecorded: recents.some(
        (recent) => recent.id === session.canonical.id && recent.available
      ),
      externalRenameInvalidated,
      externalRenameIssue,
      externalRetryOpened:
        externalRetry.relativePath === externalProbe.relativePath,
      runtimeWorkerReopened: await session.verifyRuntimeCrashRecoveryForTesting(
        crashTarget.sessionId
      ),
      graftWorkerReopened: await session.verifyGraftCrashRecoveryForTesting(),
    }
    if (Object.values(report.lifecycleRecovery).some((value) => !value)) {
      throw new Error(
        `Space lifecycle recovery failed: ${JSON.stringify(report.lifecycleRecovery)}`
      )
    }
    if (report.inlineError) failures.push(`UI: ${report.inlineError}`)
    if (failures.length) throw new Error(failures.join("\n"))
    await fs.mkdir(path.dirname(resultPath), { recursive: true })
    await fs.writeFile(
      resultPath,
      JSON.stringify({
        ok: true,
        ...report,
        probes: report.cachedFiles.map((relativePath) => ({ relativePath })),
        consoleErrors: failures,
      })
    )
  } finally {
    if (welcomeWindow && !welcomeWindow.isDestroyed()) {
      welcomeWindow.destroy()
    }
    if (onboardingWindow && !onboardingWindow.isDestroyed()) {
      onboardingWindow.destroy()
    }
    if (window && !window.isDestroyed()) window.destroy()
    await controller.closeAll()
  }
}

async function runPackagedTextHistorySmoke(
  controller: WindowController,
  spaceRoot: string,
  resultPath: string,
  startup: PackagedSmokeStartup
): Promise<void> {
  const { failures } = startup
  let welcomeWindow: BrowserWindow | null = startup.welcomeWindow
  let window: BrowserWindow | null = null
  let seedWindow: BrowserWindow | null = null
  try {
    const welcomeBounds = welcomeWindow.getBounds()
    seedWindow = await controller.createSpaceWindow(spaceRoot, (candidate) => {
      observePackagedSmokeWindow(candidate, failures)
    })
    const recent = (await controller.listRecentSpaces()).at(0)
    if (!recent)
      throw new Error("Text History Space was not recorded as recent")
    const seedClosed = new Promise<void>((resolve) => {
      seedWindow?.once("closed", () => resolve())
    })
    seedWindow.destroy()
    await seedClosed
    seedWindow = null
    await new Promise((resolve) => setTimeout(resolve, 250))
    await controller.openRecentSpace(welcomeWindow.webContents, recent.id)
    await new Promise((resolve) => setTimeout(resolve, 400))
    const spaceBounds = welcomeWindow.getBounds()
    const [minimumWidth, minimumHeight] = welcomeWindow.getMinimumSize()
    const windowTransition: WindowTransitionSmokeResult = {
      welcome: { width: welcomeBounds.width, height: welcomeBounds.height },
      space: { width: spaceBounds.width, height: spaceBounds.height },
      expanded:
        spaceBounds.width > welcomeBounds.width &&
        spaceBounds.height > welcomeBounds.height,
      minimumApplied: minimumWidth === 900 && minimumHeight === 600,
    }
    if (!windowTransition.expanded || !windowTransition.minimumApplied) {
      throw new Error(
        `Welcome-to-Space window transition is incomplete: ${JSON.stringify(windowTransition)}`
      )
    }
    window = welcomeWindow
    welcomeWindow = null
    const reloaded = new Promise<void>((resolve) => {
      window?.webContents.once("did-finish-load", () => resolve())
    })
    window.webContents.reload()
    await reloaded
    const session = controller.requireSession(window.webContents)
    await session.enableVersioning()
    const readmePath = path.join(spaceRoot, "README.md")
    const before = await fs.readFile(readmePath, "utf8")
    const after = before.split("Before line").join("After line")
    await fs.writeFile(readmePath, after)
    await session.createCheckpoint("Packaged text checkpoint")
    const history = await session.getVersionHistory(10)
    const commit = history.commits.find(
      (candidate) => candidate.message === "Packaged text checkpoint"
    )
    if (!commit) throw new Error("Text checkpoint is missing from History")
    const content = await session.getVersionTextDiff(
      commit.id,
      commit.parent,
      "README.md"
    )
    const directRead =
      content.before.state === "utf8" &&
      content.before.content === before &&
      content.after.state === "utf8" &&
      content.after.content === after
    if (!directRead) {
      throw new Error(
        `Historical README content does not match: ${JSON.stringify(content)}`
      )
    }
    const working = after.split("After line").join("Working line")
    await fs.writeFile(readmePath, working)
    const workingContent = await session.getWorkingTextDiff(
      history.currentHead,
      "README.md"
    )
    const workingDirectRead =
      workingContent.before.state === "utf8" &&
      workingContent.before.content === after &&
      workingContent.after.state === "utf8" &&
      workingContent.after.content === working
    if (!workingDirectRead) {
      throw new Error(
        `Working README content does not match: ${JSON.stringify(workingContent)}`
      )
    }
    const ui = (await window.webContents.executeJavaScript(
      textHistoryProbe,
      true
    )) as Omit<TextHistorySmokeResult, "directRead" | "workingDirectRead">
    if (failures.length) throw new Error(failures.join("\n"))
    await fs.mkdir(path.dirname(resultPath), { recursive: true })
    await fs.writeFile(
      resultPath,
      JSON.stringify({
        ok: true,
        windowTransition,
        textHistory: { directRead, workingDirectRead, ...ui },
        consoleErrors: failures,
      })
    )
  } finally {
    if (welcomeWindow && !welcomeWindow.isDestroyed()) welcomeWindow.destroy()
    if (seedWindow && !seedWindow.isDestroyed()) seedWindow.destroy()
    if (window && !window.isDestroyed()) window.destroy()
    await controller.closeAll()
  }
}
