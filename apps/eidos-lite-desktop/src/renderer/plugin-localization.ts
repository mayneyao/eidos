import { createPluginI18n } from "@eidos.space/plugin-runtime/i18n"
import type { MarketplacePlugin } from "../shared/plugins"

export function localizeMarketplacePlugin(
  plugin: MarketplacePlugin,
  locale: string
): MarketplacePlugin {
  if (!plugin.localization) return plugin
  const i18n = createPluginI18n(
    plugin.localization,
    locale === "zh" ? "zh-CN" : locale
  )
  const text = (value: string) =>
    /^%[^%]+%$/.test(value) ? i18n.t(value.slice(1, -1)) : value
  return {
    ...plugin,
    name: text(plugin.localization.name),
    description: plugin.localization.description
      ? text(plugin.localization.description)
      : plugin.description,
  }
}
