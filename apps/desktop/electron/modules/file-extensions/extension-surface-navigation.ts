export interface ExtensionSurfaceFrameNavigation {
  isMainFrame: boolean
  currentFrameUrl?: string
}

/**
 * Extension UI is the only main-window subframe loaded through `srcdoc`.
 * Once initialized it must remain on that fixed host document; allowing the
 * extension bundle to replace it would escape the host CSP and MessagePort
 * lifecycle even though the new document remains sandboxed.
 */
export function shouldBlockExtensionSurfaceFrameNavigation({
  isMainFrame,
  currentFrameUrl,
}: ExtensionSurfaceFrameNavigation): boolean {
  return !isMainFrame && currentFrameUrl === "about:srcdoc"
}
