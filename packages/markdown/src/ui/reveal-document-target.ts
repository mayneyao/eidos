/** Reveal the paragraph, not its invisible ID marker. Never navigate the host URL. */
export function revealDocumentTarget(marker: HTMLElement): void {
  const target = marker.matches("[data-obsidian-block-id]")
    ? (marker.closest<HTMLElement>("p,li,blockquote,table,ul,ol") ?? marker)
    : marker
  target.scrollIntoView({ block: "center", inline: "nearest" })
  const previousTabIndex = target.getAttribute("tabindex")
  if (previousTabIndex === null) target.tabIndex = -1
  target.focus({ preventScroll: true })
  target.animate?.(
    [
      { backgroundColor: "var(--eme-selection)" },
      { backgroundColor: "var(--eme-selection)", offset: 0.7 },
      { backgroundColor: "transparent" },
    ],
    { duration: 1600 }
  )
  if (previousTabIndex === null)
    target.addEventListener("blur", () => target.removeAttribute("tabindex"), {
      once: true,
    })
}
