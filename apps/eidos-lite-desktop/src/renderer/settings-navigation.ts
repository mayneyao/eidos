import type { SettingDescriptor } from "./settings-catalog"

/** Resolve by registered identity, never by rendered text or a preference value. */
export function focusSetting(
  container: HTMLElement,
  setting: SettingDescriptor
): boolean {
  const row = Array.from(
    container.querySelectorAll<HTMLElement>(
      "[data-setting-id], [data-setting-ids]"
    )
  ).find(
    (element) =>
      element.dataset.settingId === setting.id ||
      element.dataset.settingIds?.split(" ").includes(setting.id)
  )
  if (!row || row.closest("[hidden], [inert]")) return false
  let focus: HTMLElement = row
  if (setting.target === "control") {
    const enabled = ':not(:disabled):not([aria-disabled="true"])'
    const preferred = row.querySelector<HTMLElement>("[data-setting-focus]")
    focus = preferred
      ? preferred.matches(enabled)
        ? preferred
        : row
      : row.matches("button" + enabled)
        ? row
        : (row.querySelector<HTMLElement>(
            '[role="radio"][aria-checked="true"]' + enabled
          ) ??
          row.querySelector<HTMLElement>(
            "select" + enabled + ", input" + enabled + ", button" + enabled
          ) ??
          row)
  }
  const bounds = row.getBoundingClientRect()
  const viewport = container.getBoundingClientRect()
  if (bounds.top < viewport.top + 8 || bounds.bottom > viewport.bottom - 8) {
    container.scrollTop = Math.max(
      0,
      container.scrollTop + bounds.top - viewport.top - 8
    )
  }
  focus.focus({ preventScroll: true })
  return true
}
