// Canonical, dependency-free client shared by Lite and the Rust Serve bootstrap.
export function pluginLocaleCandidates(locale, fallback) {
  let tag
  try {
    tag = new Intl.Locale(locale)
  } catch {
    tag = new Intl.Locale(fallback)
  }
  const script =
    tag.script ?? (tag.language === "zh" ? tag.maximize().script : undefined)
  return [
    ...new Set([
      tag.toString(),
      ...(script ? [`${tag.language}-${script}`] : []),
      tag.language,
      fallback,
    ]),
  ]
}

export function createPluginI18n(
  data,
  initialLocale,
  candidates = pluginLocaleCandidates
) {
  let locale = initialLocale
  const listeners = new Set()
  return {
    get locale() {
      return locale
    },
    t(key, values) {
      let message = key
      for (const candidate of candidates(locale, data.defaultLocale)) {
        if (Object.hasOwn(data.messages[candidate] ?? {}, key)) {
          message = data.messages[candidate][key]
          break
        }
      }
      return message.replace(/\{([a-zA-Z][\w.-]*)\}/g, (match, name) =>
        values && Object.hasOwn(values, name) ? String(values[name]) : match
      )
    },
    onDidChangeLocale(listener) {
      listeners.add(listener)
      return {
        dispose() {
          listeners.delete(listener)
        },
      }
    },
    setLocale(next) {
      if (locale === next) return
      locale = next
      for (const listener of listeners) {
        try {
          listener({ locale })
        } catch (error) {
          console.error("Plugin locale observer failed", error)
        }
      }
    },
  }
}
