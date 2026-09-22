import { useEffect, useState } from "react"
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
    <section aria-label={t("Connection settings")}>
      {Object.entries(manifest.connections ?? {}).map(([id, connection]) => (
        <Connection
          key={id}
          id={id}
          connection={connection}
          ticket={instance?.ticket}
        />
      ))}
      {error && <p role="alert">{error}</p>}
      {instance && (
        <div hidden>
          <PluginEditor
            instance={instance}
            onDraft={() => {}}
            onFallback={() => setError("Connection settings unavailable")}
            onRetry={() => setError("Reopen plugin settings to retry")}
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
  const [secret, setSecret] = useState("")
  const [endpoint, setEndpoint] = useState(connection.url)
  const [model, setModel] = useState("")
  const [configured, setConfigured] = useState(false)
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState("")
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
          if (live) setStatus(String(error))
        })
    return () => {
      live = false
    }
  }, [ticket, id])
  async function save(value: string | null) {
    if (!ticket || busy) return
    setBusy(true)
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
    } finally {
      setBusy(false)
    }
  }
  return (
    <form
      className="space-y-3 border-b border-border py-5"
      onSubmit={(event) => {
        event.preventDefault()
        void save(secret)
      }}
    >
      <div className="font-medium">{connection.title}</div>
      {connection.configurable ? (
        <>
          <p className="text-xs text-muted-foreground">
            {t("OpenAI-compatible Chat Completions endpoint")}
          </p>
          <label className="block text-sm">
            Endpoint
            <input
              className="mt-2 block w-full max-w-md rounded-md border border-input bg-background px-3 py-2 text-sm"
              type="url"
              required
              value={endpoint}
              onChange={(e) => setEndpoint(e.target.value)}
              placeholder="https://api.example.com/v1/chat/completions"
            />
          </label>
          <label className="block text-sm">
            {t("Model")}
            <input
              className="mt-2 block w-full max-w-md rounded-md border border-input bg-background px-3 py-2 text-sm"
              required
              value={model}
              onChange={(e) => setModel(e.target.value)}
              placeholder="Model ID"
            />
          </label>
        </>
      ) : (
        <p className="text-xs text-muted-foreground">{connection.url}</p>
      )}
      <label className="block text-sm">
        API Key
        <input
          className="mt-2 block w-full max-w-md rounded-md border border-input bg-background px-3 py-2 text-sm"
          aria-label={`${connection.title} API Key`}
          type="password"
          autoComplete="off"
          placeholder={configured ? "••••••••" : "API Key"}
          value={secret}
          onChange={(event) => setSecret(event.target.value)}
        />
      </label>
      <div className="flex gap-2">
        <button
          className="settings-button"
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
          {t("Save")}
        </button>
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
      </div>
      {status && (
        <p role="status" className="text-xs text-muted-foreground">
          {status}
        </p>
      )}
    </form>
  )
}
