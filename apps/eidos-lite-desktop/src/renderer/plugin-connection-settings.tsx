import { useEffect, useId, useState, type ReactNode } from "react"
import type { PluginManifest } from "@eidos.space/plugin-sdk"
import type { PluginOpenResult } from "../shared/plugins"
import { PluginEditor } from "./plugin-editor"
import { useEidosLiteI18n } from "./i18n"

export function PluginConnectionSettings({
  manifest,
}: {
  manifest: PluginManifest
}) {
  const { t } = useEidosLiteI18n()
  const [instance, setInstance] = useState<PluginOpenResult["instance"]>(null)
  const [error, setError] = useState("")
  useEffect(() => {
    let live = true
    let ticket: string | undefined
    void window.eidosLite
      .openPluginExtension(manifest.id)
      .then((opened) => {
        ticket = opened.instance?.ticket
        if (live) setInstance(opened.instance)
        else if (ticket) void window.eidosLite.closePluginEditor(ticket)
      })
      .catch((cause) => {
        if (live) setError(String(cause))
      })
    return () => {
      live = false
      if (ticket) void window.eidosLite.closePluginEditor(ticket)
    }
  }, [manifest.id])
  return (
    <section
      className="plugin-connection-settings"
      aria-label={t("Connection settings")}
    >
      {Object.entries(manifest.connections ?? {}).map(([id, connection]) => (
        <Connection
          key={id}
          id={id}
          connection={connection}
          ticket={instance?.ticket}
        />
      ))}
      {error && (
        <p className="plugin-setting-error" role="alert">
          {error}
        </p>
      )}
      {instance && (
        <div hidden>
          <PluginEditor
            instance={instance}
            onDraft={() => {}}
            onFallback={() => setError(t("Connection settings unavailable"))}
            onRetry={() => setError(t("Reopen plugin settings to retry"))}
            onError={setError}
          />
        </div>
      )}
    </section>
  )
}

function Connection({
  id,
  connection,
  ticket,
}: {
  id: string
  connection: { title: string; url: string; configurable?: boolean }
  ticket?: string
}) {
  const { t } = useEidosLiteI18n()
  const fieldId = useId()
  const [secret, setSecret] = useState("")
  const [endpoint, setEndpoint] = useState(connection.url)
  const [model, setModel] = useState("")
  const [configured, setConfigured] = useState(false)
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState("")
  const [statusError, setStatusError] = useState(false)
  useEffect(() => {
    let live = true
    if (ticket)
      void window.eidosLite
        .pluginConnection(ticket, id, "status")
        .then((value) => {
          if (live) {
            if (connection.configurable && value && typeof value === "object") {
              const config = value as {
                configured: boolean
                url: string
                model: string
              }
              setConfigured(config.configured)
              setEndpoint(config.url || connection.url)
              setModel(config.model || "")
            } else setConfigured(value === true)
          }
        })
        .catch((error) => {
          if (live) {
            setStatus(String(error))
            setStatusError(true)
          }
        })
    return () => {
      live = false
    }
  }, [ticket, id])
  async function save(value: string | null) {
    if (!ticket || busy) return
    setBusy(true)
    setStatus("")
    setStatusError(false)
    try {
      await window.eidosLite.pluginConnection(
        ticket,
        id,
        connection.configurable ? "configure" : "save",
        connection.configurable && value !== null
          ? { url: endpoint, model, key: value }
          : value
      )
      setConfigured(value !== null)
      setSecret("")
      setStatus(
        t(
          value === null
            ? "Credential removed"
            : "Connection saved with system encryption"
        )
      )
    } catch (error) {
      setStatus(String(error))
      setStatusError(true)
    } finally {
      setBusy(false)
    }
  }
  return (
    <form
      className="plugin-connection-form"
      aria-labelledby={`${fieldId}-heading`}
      aria-busy={busy}
      onSubmit={(event) => {
        event.preventDefault()
        void save(secret)
      }}
    >
      <header className="plugin-settings-heading">
        <div>
          <h2 id={`${fieldId}-heading`}>{connection.title}</h2>
          <p>
            {connection.configurable
              ? t("OpenAI-compatible Chat Completions endpoint")
              : connection.url}
          </p>
        </div>
      </header>
      <div className="settings-group plugin-settings-fields">
        {connection.configurable && (
          <>
            <ConnectionField id={`${fieldId}-endpoint`} title={t("Endpoint")}>
              <input
                id={`${fieldId}-endpoint`}
                className="plugin-setting-input"
                type="url"
                required
                value={endpoint}
                readOnly={busy}
                onChange={(event) => setEndpoint(event.target.value)}
                placeholder="https://api.example.com/v1/chat/completions"
              />
            </ConnectionField>
            <ConnectionField id={`${fieldId}-model`} title={t("Model")}>
              <input
                id={`${fieldId}-model`}
                className="plugin-setting-input"
                required
                value={model}
                readOnly={busy}
                onChange={(event) => setModel(event.target.value)}
                placeholder={t("Model ID")}
              />
            </ConnectionField>
          </>
        )}
        <ConnectionField
          id={`${fieldId}-key`}
          title="API Key"
          description={t(
            configured
              ? connection.configurable
                ? "Leave blank to keep the saved credential."
                : "Enter a new key to replace the saved credential."
              : "Stored with system encryption."
          )}
        >
          <input
            id={`${fieldId}-key`}
            className="plugin-setting-input"
            aria-label={`${connection.title} API Key`}
            aria-describedby={`${fieldId}-key-description`}
            type="password"
            autoComplete="off"
            placeholder={configured ? "••••••••" : "API Key"}
            value={secret}
            readOnly={busy}
            onChange={(event) => setSecret(event.target.value)}
          />
        </ConnectionField>
        <footer className="plugin-connection-footer">
          {status && (
            <p
              role={statusError ? "alert" : "status"}
              className={
                statusError
                  ? "plugin-setting-error"
                  : "plugin-connection-status"
              }
            >
              {status}
            </p>
          )}
          <div className="plugin-connection-actions">
            {configured && (
              <button
                className="settings-button settings-button-quiet"
                type="button"
                disabled={busy}
                onClick={() => {
                  void save(null)
                }}
              >
                {t("Remove credential")}
              </button>
            )}
            <button
              className="settings-button settings-button-primary"
              disabled={
                !ticket ||
                busy ||
                (connection.configurable
                  ? !endpoint.trim() ||
                    !model.trim() ||
                    (!configured && !secret.trim())
                  : !secret.trim())
              }
              type="submit"
            >
              {busy ? t("Saving…") : t("Save")}
            </button>
          </div>
        </footer>
      </div>
    </form>
  )
}

function ConnectionField({
  id,
  title,
  description,
  children,
}: {
  id: string
  title: string
  description?: string
  children: ReactNode
}) {
  return (
    <div className="plugin-setting-row">
      <div className="plugin-setting-copy">
        <label htmlFor={id}>{title}</label>
        {description && <p id={`${id}-description`}>{description}</p>}
      </div>
      <div className="plugin-setting-control">{children}</div>
    </div>
  )
}
