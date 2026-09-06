/** Embedded editors use the host canvas for both selection and drag scrolling. */
export function editorScrollSurface(root: HTMLElement): HTMLElement | null {
  return (
    root
      .closest('[data-layout="embedded"]')
      ?.closest<HTMLElement>("[data-markdown-selection-canvas]") ??
    root.closest<HTMLElement>(".eme-editor-stage")
  )
}
