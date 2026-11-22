import { useCallback, useEffect, useRef, useState, type ReactNode } from "react"
import type { EidosLitePreferences } from "../shared/contracts"
import type { EidosLiteLocale } from "../shared/i18n"
import type { SpaceFileEditorSettings } from "../shared/plugins"
import { useEidosLiteI18n } from "./i18n"
import { SETTINGS } from "./settings-catalog"
import { focusSetting } from "./settings-navigation"

const scopeCopy = {
  en: {
    sentence: "Choose how each file type opens by default for {scope}.",
    device: "This device (global)",
  },
  zh: {
    sentence: "为{scope}设置各类文件的默认打开方式。",
    device: "本设备（全局）",
  },
  ja: {
    sentence: "{scope}で、ファイル形式ごとの既定の開き方を設定します。",
    device: "このデバイス（全体）",
  },
  ko: {
    sentence: "{scope}에서 파일 형식별 기본 열기 방식을 설정합니다.",
    device: "이 기기(전역)",
  },
  "pt-BR": {
    sentence:
      "Defina o modo padrão de abrir cada tipo de arquivo para {scope}.",
    device: "Este dispositivo (global)",
  },
} satisfies Record<EidosLiteLocale, { sentence: string; device: string }>

export function SpaceScopedFileEditors({
  active,
  preferences,
  onError,
  children,
}: {
  active: boolean
  preferences: EidosLitePreferences
  onError(message: string | null): void
  children: ReactNode
}) {
  const { locale, t } = useEidosLiteI18n()
  const { sentence, device } = scopeCopy[locale]
  const [beforeScope, afterScope] = sentence.split("{scope}")
  const group = useRef<HTMLDivElement>(null)
  const [space, setSpace] = useState<SpaceFileEditorSettings | null>(null)
  const [scope, setScope] = useState<"space" | "device">("device")
  const [pendingContext, setPendingContext] = useState(
    () => typeof window.eidosLite.getSpaceFileEditorSettings === "function"
  )
  const [saving, setSaving] = useState(false)
  const request = useRef(0)
  const loadedContext = useRef<string | undefined>(undefined)
  const focusedContext = useRef<string | undefined>(undefined)

  const refresh = useCallback(async () => {
    const generation = ++request.current
    try {
      const next = await window.eidosLite.getSpaceFileEditorSettings()
      if (generation !== request.current) return
      if (loadedContext.current !== next?.contextId) {
        loadedContext.current = next?.contextId
        setScope(next ? "space" : "device")
      }
      setSpace(next)
      setPendingContext(false)
    } catch (cause) {
      if (generation !== request.current) return
      loadedContext.current = undefined
      setSpace(null)
      setScope("device")
      setPendingContext(false)
      onError(cause instanceof Error ? cause.message : String(cause))
    }
  }, [onError])

  useEffect(() => {
    if (!window.eidosLite.getSpaceFileEditorSettings) return
    const catalogChanged = () => void refresh()
    const contextChanged = () => {
      setPendingContext(true)
      void refresh()
    }
    const unsubscribeContext =
      window.eidosLite.onSettingsSpaceFileEditorsChanged?.(contextChanged)
    const unsubscribeCatalog = window.eidosLite.onPluginEvent?.(({ event }) => {
      if (event.observation === "host.catalog") catalogChanged()
    })
    window.addEventListener("eidos-plugins-changed", catalogChanged)
    void refresh()
    return () => {
      request.current += 1
      unsubscribeContext?.()
      unsubscribeCatalog?.()
      window.removeEventListener("eidos-plugins-changed", catalogChanged)
    }
  }, [locale, refresh])

  useEffect(() => {
    if (
      !active ||
      pendingContext ||
      saving ||
      scope !== "space" ||
      !space?.focusExtension ||
      focusedContext.current === space.contextId
    )
      return
    const content = group.current?.closest<HTMLElement>(".settings-content")
    if (
      content &&
      focusSetting(content, {
        id: `files.default-editor:${space.focusExtension}`,
        target: "control",
      })
    )
      focusedContext.current = space.contextId
  }, [active, pendingContext, saving, scope, space])

  const save = async (extension: string, value: string) => {
    if (!space || pendingContext || saving) return
    setSaving(true)
    onError(null)
    try {
      await window.eidosLite.setSpaceFileEditorDefault(
        space.contextId,
        extension,
        value === "device" ? null : value
      )
      await refresh()
    } catch (cause) {
      onError(cause instanceof Error ? cause.message : String(cause))
    } finally {
      setSaving(false)
    }
  }

  const builtInEditor = (extension: string) => {
    const mode =
      extension === ".md" || extension === ".markdown"
        ? preferences.markdownFileEditingMode === "source"
          ? "Source"
          : "Rich text"
        : extension === ".html" || extension === ".htm"
          ? preferences.htmlFileOpenMode === "source"
            ? "Source"
            : "Preview"
          : null
    return mode
      ? t("Built-in editor ({mode})", { mode: t(mode) })
      : t("Built-in editor")
  }

  const spaceScope = space && t("Space: {space}", { space: space.spaceName })
  const scopeValue = pendingContext && scope === "device" ? "pending" : scope
  return (
    <>
      <p className="settings-file-editor-scope">
        {beforeScope}
        <select
          className="settings-shell-select"
          aria-label={t("Scope")}
          value={scopeValue}
          title={scopeValue === "space" ? (spaceScope ?? undefined) : undefined}
          disabled={pendingContext || !space}
          onChange={(event) => {
            if (event.target.value === "device") {
              focusedContext.current = space?.contextId
              setScope("device")
            } else setScope("space")
          }}
        >
          {pendingContext && scope === "device" && (
            <option value="pending">{t("Loading…")}</option>
          )}
          {spaceScope && <option value="space">{spaceScope}</option>}
          <option value="device">{device}</option>
        </select>
        {afterScope}
      </p>
      <div className="settings-group" data-default-file-editors ref={group}>
        {scope === "space" && space
          ? space.extensions.map(
              ({ extension, override, deviceEditor, editors }) => {
                const builtin = builtInEditor(extension)
                const unavailable =
                  override &&
                  override !== "builtin" &&
                  !editors.some(({ key }) => key === override)
                const settingId =
                  extension === ".md"
                    ? SETTINGS.markdownEditor.id
                    : extension === ".html"
                      ? SETTINGS.htmlEditor.id
                      : ""
                return (
                  <div
                    className="settings-row settings-row-stacked"
                    key={extension}
                    tabIndex={-1}
                    data-setting-ids={`files.default-editor:${extension} ${settingId}`.trim()}
                  >
                    <div className="settings-row-copy">
                      <strong>{extension}</strong>
                      <small>
                        {t(
                          "Choose the default editor for {extensions} files.",
                          {
                            extensions: extension,
                          }
                        )}
                      </small>
                    </div>
                    <select
                      className="settings-shell-select"
                      aria-label={extension}
                      disabled={pendingContext}
                      aria-disabled={saving || undefined}
                      value={override ?? "device"}
                      onChange={(event) =>
                        void save(extension, event.target.value)
                      }
                    >
                      <option value="device">
                        {t("Follow device ({editor})", {
                          editor: deviceEditor ?? builtin,
                        })}
                      </option>
                      <option value="builtin">{builtin}</option>
                      {unavailable && (
                        <option value={override} disabled>
                          {t("{editor} (plugin unavailable)", {
                            editor: builtin,
                          })}
                        </option>
                      )}
                      {editors.map(({ key, label }) => (
                        <option key={key} value={key}>
                          {label}
                        </option>
                      ))}
                    </select>
                  </div>
                )
              }
            )
          : !pendingContext && children}
      </div>
    </>
  )
}
