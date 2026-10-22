export interface PackagedSmokeDocumentState {
  visibilityState: string
  hasFocus: boolean
}

export interface PackagedSmokeForegroundState {
  window: {
    isVisible: boolean
    isFocused: boolean
    isMinimized: boolean
  }
  webContents: { backgroundThrottling: boolean }
  document: PackagedSmokeDocumentState
}

export interface PackagedSmokeForegroundDiagnostics {
  before: PackagedSmokeForegroundState
  after: PackagedSmokeForegroundState
}

interface ForegroundWindow {
  isVisible(): boolean
  isFocused(): boolean
  isMinimized(): boolean
  restore(): void
  show(): void
  focus(): void
  webContents: {
    getBackgroundThrottling(): boolean
    focus(): void
    executeJavaScript(
      code: string,
      userGesture: boolean
    ): Promise<PackagedSmokeDocumentState>
  }
}

async function readForegroundState(
  window: ForegroundWindow
): Promise<PackagedSmokeForegroundState> {
  return {
    window: {
      isVisible: window.isVisible(),
      isFocused: window.isFocused(),
      isMinimized: window.isMinimized(),
    },
    webContents: {
      backgroundThrottling: window.webContents.getBackgroundThrottling(),
    },
    document: await window.webContents.executeJavaScript(
      "({ visibilityState: document.visibilityState, hasFocus: document.hasFocus() })",
      false
    ),
  }
}

export async function ensurePackagedSmokeForeground(
  window: ForegroundWindow,
  activateApplication: () => void
): Promise<PackagedSmokeForegroundDiagnostics> {
  // Capture the observer-created window before changing its native visibility
  // or focus so reports retain the measurement protocol's original state.
  const before = await readForegroundState(window)
  if (before.window.isMinimized) window.restore()
  activateApplication()
  window.show()
  window.focus()
  window.webContents.focus()
  const deadline = Date.now() + 3_000
  for (;;) {
    const after = await readForegroundState(window)
    if (
      after.window.isVisible &&
      after.window.isFocused &&
      !after.window.isMinimized &&
      after.document.visibilityState === "visible" &&
      after.document.hasFocus
    ) {
      return { before, after }
    }
    if (Date.now() >= deadline) {
      throw new Error(
        "Packaged smoke foreground precondition failed: " +
          JSON.stringify({ before, after })
      )
    }
    await new Promise((resolve) => setTimeout(resolve, 50))
  }
}
