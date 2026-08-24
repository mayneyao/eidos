import { useLayoutEffect, useRef, useState, type FormEvent } from "react"
import {
  Check,
  Copy,
  ExternalLink,
  Import,
  LoaderCircle,
  LockKeyhole,
  RotateCcw,
  Upload,
  X,
} from "lucide-react"

import type {
  EidosPublicationBinding,
  EidosPublishAccessSelection,
  EidosPublishBrandingSelection,
  EidosPublishFormRespondentAccess,
  EidosPublishCollectResponse,
  SpaceTreeEntry,
  SyncAccountStatus,
} from "../shared/contracts"
import { useEidosLiteI18n } from "./i18n"

export function defaultPublishSlug(fileName: string): string {
  const stem = fileName.replace(/\.(?:eidos|md|markdown)$/i, "")
  const slug = stem
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64)
    .replace(/-+$/g, "")
  return slug || "untitled"
}

export function isPublishableEntry(entry: SpaceTreeEntry): boolean {
  return (
    entry.kind === "eidos" ||
    (entry.kind === "file" && /\.(?:md|markdown)$/i.test(entry.name))
  )
}

export type PublishAccountState =
  | SyncAccountStatus["state"]
  | "checking"
  | "unavailable"

export function publishMenuAvailability(
  accountState: PublishAccountState,
  localInteractionBlocked: boolean
): {
  disabled: boolean
  label:
    | "Publish… (Sign in required)"
    | "Publish… (Checking account…)"
    | "Publish… (Account unavailable)"
    | null
} {
  return {
    disabled: localInteractionBlocked || accountState !== "signed-in",
    label:
      accountState === "signed-out"
        ? "Publish… (Sign in required)"
        : accountState === "checking"
          ? "Publish… (Checking account…)"
          : accountState === "unavailable"
            ? "Publish… (Account unavailable)"
            : null,
  }
}

export function clampPublishPanelPosition(
  anchorX: number,
  anchorY: number,
  panelWidth: number,
  panelHeight: number,
  viewportWidth: number,
  viewportHeight: number,
  margin = 8
): { left: number; top: number } {
  const maxLeft = Math.max(margin, viewportWidth - panelWidth - margin)
  const maxTop = Math.max(margin, viewportHeight - panelHeight - margin)
  return {
    left: Math.max(margin, Math.min(anchorX, maxLeft)),
    top: Math.max(margin, Math.min(anchorY, maxTop)),
  }
}

export function publishFormViewLabel(
  formLabel: string,
  view: { name: string; tableName: string }
): string {
  return `${formLabel} · ${view.tableName} · ${view.name}`
}

export function publishedFormRespondentLabel(
  binding: Pick<EidosPublicationBinding, "sourceKind" | "formPolicy">
): "Anyone with the link" | "Signed-in eidos.space users" | null {
  if (binding.sourceKind !== "form") return null
  return binding.formPolicy?.respondentAccess === "signed_in"
    ? "Signed-in eidos.space users"
    : "Anyone with the link"
}

interface PublishPanelProps {
  entry: SpaceTreeEntry
  formViews?: Array<{ id: string; name: string; tableName: string }>
  bindings?: EidosPublicationBinding[]
  x: number
  y: number
  onPublish(options: PublishPanelSubmission): void
  onCollect(
    binding: EidosPublicationBinding
  ): Promise<EidosPublishCollectResponse>
  onClose(): void
}

export interface PublishPanelSubmission {
  slug: string
  accessMode: EidosPublishAccessSelection
  branding: EidosPublishBrandingSelection
  formView?: string
  formRespondentAccess?: EidosPublishFormRespondentAccess
  formAllowMultipleResponses?: boolean
  password?: string
}

export function PublishPanel({
  entry,
  formViews = [],
  bindings = [],
  x,
  y,
  onPublish,
  onCollect,
  onClose,
}: PublishPanelProps) {
  const { t } = useEidosLiteI18n()
  const [slug, setSlug] = useState(() => defaultPublishSlug(entry.name))
  const [accessMode, setAccessMode] =
    useState<EidosPublishAccessSelection>("unchanged")
  const [branding, setBranding] =
    useState<EidosPublishBrandingSelection>("unchanged")
  const [password, setPassword] = useState("")
  const [confirmation, setConfirmation] = useState("")
  const [formView, setFormView] = useState("")
  const [formRespondentAccess, setFormRespondentAccess] =
    useState<EidosPublishFormRespondentAccess>("anyone")
  const [formAllowMultipleResponses, setFormAllowMultipleResponses] =
    useState(true)
  const [copiedBindingId, setCopiedBindingId] = useState<string | null>(null)
  const [collection, setCollection] = useState<{
    publicationId: string
    status: "running" | "succeeded" | "failed"
    message?: string
  } | null>(null)
  const panel = useRef<HTMLDivElement>(null)
  const [position, setPosition] = useState({ left: x, top: y })

  useLayoutEffect(() => {
    const element = panel.current
    if (!element) return
    const place = () => {
      const bounds = element.getBoundingClientRect()
      const next = clampPublishPanelPosition(
        x,
        y,
        bounds.width,
        bounds.height,
        window.innerWidth,
        window.innerHeight
      )
      setPosition((current) =>
        current.left === next.left && current.top === next.top ? current : next
      )
    }
    place()
    const observer = new ResizeObserver(place)
    observer.observe(element)
    window.addEventListener("resize", place)
    return () => {
      observer.disconnect()
      window.removeEventListener("resize", place)
    }
  }, [x, y])

  useLayoutEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose()
    }
    const closeOutside = (event: PointerEvent) => {
      if (!panel.current?.contains(event.target as Node)) onClose()
    }
    window.addEventListener("keydown", closeOnEscape)
    window.addEventListener("pointerdown", closeOutside)
    return () => {
      window.removeEventListener("keydown", closeOnEscape)
      window.removeEventListener("pointerdown", closeOutside)
    }
  }, [onClose])

  const passwordCharacters = Array.from(password).length
  const passwordBytes = new TextEncoder().encode(password).byteLength

  const validation = !/^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$/.test(slug)
    ? t("Use 1–64 lowercase letters, numbers, or hyphens.")
    : accessMode === "password" &&
        (passwordCharacters < 8 ||
          passwordCharacters > 128 ||
          passwordBytes > 256 ||
          /[\u0000-\u001f\u007f]/.test(password))
      ? t("Use 8–128 characters and at most 256 UTF-8 bytes.")
      : accessMode === "password" && password !== confirmation
        ? t("Passwords do not match.")
        : null

  const submit = (event: FormEvent) => {
    event.preventDefault()
    if (validation) return
    onPublish({
      slug,
      accessMode,
      branding,
      ...(formView ? { formView } : {}),
      ...(formView ? { formRespondentAccess, formAllowMultipleResponses } : {}),
      ...(accessMode === "password" ? { password } : {}),
    })
    setPassword("")
    setConfirmation("")
  }
  const accessDescription =
    accessMode === "unchanged"
      ? t("New resources start public.")
      : accessMode === "public"
        ? t("Anyone with the link can view it.")
        : accessMode === "password"
          ? t("Require a shared password.")
          : t("Only your signed-in account.")

  const collect = (binding: EidosPublicationBinding) => {
    setCollection({ publicationId: binding.publicationId, status: "running" })
    void onCollect(binding).then(
      (response) => {
        setCollection(
          response.ok
            ? {
                publicationId: binding.publicationId,
                status: "succeeded",
                message: t("{count} responses collected", {
                  count: response.result.importedSubmissions,
                }),
              }
            : {
                publicationId: binding.publicationId,
                status: "failed",
                message: response.failure.message,
              }
        )
      },
      (cause: unknown) => {
        setCollection({
          publicationId: binding.publicationId,
          status: "failed",
          message: cause instanceof Error ? cause.message : String(cause),
        })
      }
    )
  }

  return (
    <div
      ref={panel}
      className="publish-panel"
      role="dialog"
      aria-labelledby="publish-panel-title"
      style={position}
      onPointerDown={(event) => event.stopPropagation()}
    >
      <header>
        <span className="publish-panel-heading">
          <Upload />
          <span>
            <strong id="publish-panel-title">{t("Publish")}</strong>
            <small title={entry.relativePath}>{entry.name}</small>
          </span>
        </span>
        <button
          type="button"
          className="publish-icon-button"
          aria-label={t("Close Publish")}
          onClick={onClose}
        >
          <X />
        </button>
      </header>

      {bindings.length > 0 ? (
        <section
          className="publish-bindings"
          aria-label={t("Published resources")}
        >
          <span className="publish-bindings-heading">
            {t("Published resources")}
          </span>
          {bindings.map((binding) => {
            const formRespondentLabel = publishedFormRespondentLabel(binding)
            const collecting =
              collection?.publicationId === binding.publicationId &&
              collection.status === "running"
            const feedback =
              collection?.publicationId === binding.publicationId
                ? collection
                : null
            return (
              <article key={binding.bindingId} className="publish-binding">
                <div className="publish-binding-copy">
                  <strong>/{binding.slug}</strong>
                  <small>
                    {binding.sourceKind === "form"
                      ? t("Form")
                      : binding.sourceKind === "markdown"
                        ? t("Markdown")
                        : t("Interactive Eidos File")}
                    {` · ${t(binding.accessMode)}`}
                    {formRespondentLabel ? ` · ${t(formRespondentLabel)}` : ""}
                  </small>
                  <small
                    className={`publish-binding-status is-${binding.contentStatus}`}
                  >
                    {binding.contentStatus === "current"
                      ? t("Up to date")
                      : binding.contentStatus === "changed"
                        ? t("Changes to publish")
                        : t("Publish status unavailable")}
                  </small>
                </div>
                <div className="publish-binding-actions">
                  <button
                    type="button"
                    aria-label={t("Copy link")}
                    title={t("Copy link")}
                    onClick={() => {
                      void navigator.clipboard
                        .writeText(binding.url)
                        .then(() => {
                          setCopiedBindingId(binding.bindingId)
                          window.setTimeout(
                            () => setCopiedBindingId(null),
                            1_500
                          )
                        })
                    }}
                  >
                    {copiedBindingId === binding.bindingId ? (
                      <Check />
                    ) : (
                      <Copy />
                    )}
                  </button>
                  <button
                    type="button"
                    aria-label={t("Open")}
                    title={t("Open")}
                    onClick={() =>
                      void window.eidosLite.openExternalUrl(binding.url)
                    }
                  >
                    <ExternalLink />
                  </button>
                  {binding.sourceKind === "form" ? (
                    <button
                      type="button"
                      disabled={collecting}
                      aria-label={t("Collect now")}
                      title={t("Collect now")}
                      onClick={() => collect(binding)}
                    >
                      {collecting ? (
                        <LoaderCircle className="spin" />
                      ) : (
                        <Import />
                      )}
                    </button>
                  ) : null}
                  <button
                    type="button"
                    aria-label={t("Republish")}
                    title={t("Republish")}
                    onClick={() => {
                      setSlug(binding.slug)
                      setFormView(binding.formViewId ?? "")
                      setFormRespondentAccess(
                        binding.formPolicy?.respondentAccess ?? "anyone"
                      )
                      setFormAllowMultipleResponses(
                        binding.formPolicy?.allowMultipleResponses ?? true
                      )
                    }}
                  >
                    <RotateCcw />
                  </button>
                </div>
                {feedback?.message ? (
                  <small
                    className={
                      feedback.status === "failed"
                        ? "publish-binding-feedback is-error"
                        : "publish-binding-feedback"
                    }
                  >
                    {feedback.message}
                  </small>
                ) : binding.collector?.lastErrorMessage ? (
                  <small className="publish-binding-feedback is-error">
                    {binding.collector.lastErrorMessage}
                  </small>
                ) : null}
              </article>
            )
          })}
        </section>
      ) : null}

      <form onSubmit={submit}>
        {formViews.length > 0 ? (
          <label>
            <span>{t("Publish as")}</span>
            <select
              value={formView}
              onChange={(event) => {
                setFormView(event.target.value)
                if (!event.target.value) {
                  setFormRespondentAccess("anyone")
                  setFormAllowMultipleResponses(true)
                }
              }}
            >
              <option value="">{t("Interactive Eidos File")}</option>
              {formViews.map((view) => (
                <option key={view.id} value={view.id}>
                  {publishFormViewLabel(t("Form"), view)}
                </option>
              ))}
            </select>
            <small>
              {formView
                ? t("Collect responses into this Form View's Table.")
                : t("Share the complete Eidos File in read-only mode.")}
            </small>
          </label>
        ) : null}

        {formView ? (
          <fieldset className="publish-form-policy">
            <legend>{t("Form responses")}</legend>
            <label>
              <span>{t("Who can respond")}</span>
              <select
                value={formRespondentAccess}
                onChange={(event) => {
                  const next = event.target
                    .value as EidosPublishFormRespondentAccess
                  setFormRespondentAccess(next)
                  if (next === "anyone") setFormAllowMultipleResponses(true)
                }}
              >
                <option value="anyone">{t("Anyone with the link")}</option>
                <option value="signed_in">
                  {t("Signed-in eidos.space users")}
                </option>
              </select>
            </label>
            <label className="publish-form-policy-toggle">
              <input
                type="checkbox"
                checked={formAllowMultipleResponses}
                disabled={formRespondentAccess === "anyone"}
                onChange={(event) =>
                  setFormAllowMultipleResponses(event.target.checked)
                }
              />
              <span>
                <strong>{t("Allow multiple responses")}</strong>
                <small>
                  {formRespondentAccess === "anyone"
                    ? t("Sign-in is required to limit one response per user.")
                    : t("Turn off to accept one response per account.")}
                </small>
              </span>
            </label>
          </fieldset>
        ) : null}

        <label>
          <span>{t("Resource slug")}</span>
          <input
            autoFocus
            value={slug}
            spellCheck={false}
            onChange={(event) => setSlug(event.target.value.toLowerCase())}
          />
          <small>{t("This becomes the path after your Publish domain.")}</small>
        </label>

        <label className="publish-access-field">
          <span>{t("Access")}</span>
          <select
            value={accessMode}
            onChange={(event) =>
              setAccessMode(event.target.value as EidosPublishAccessSelection)
            }
          >
            <option value="unchanged">{t("Keep current")}</option>
            <option value="public">{t("Public")}</option>
            <option value="password">{`${t("Password")} · Pro`}</option>
            <option value="private">{`${t("Private")} · Pro`}</option>
          </select>
          <small>{accessDescription}</small>
        </label>

        {accessMode === "password" ? (
          <div className="publish-password-fields">
            <label>
              <span>{t("Password")}</span>
              <input
                type="password"
                value={password}
                maxLength={256}
                autoComplete="new-password"
                onChange={(event) => setPassword(event.target.value)}
              />
            </label>
            <label>
              <span>{t("Confirm password")}</span>
              <input
                type="password"
                value={confirmation}
                maxLength={256}
                autoComplete="new-password"
                onChange={(event) => setConfirmation(event.target.value)}
              />
            </label>
            <p>
              <LockKeyhole />
              {t(
                "The password is sent securely and is never saved by Eidos Lite."
              )}
            </p>
          </div>
        ) : null}

        <label className="publish-access-field">
          <span>{t("Branding")}</span>
          <select
            value={branding}
            onChange={(event) =>
              setBranding(event.target.value as EidosPublishBrandingSelection)
            }
          >
            <option value="unchanged">{t("Keep current")}</option>
            <option value="show">{t("Show Built with Eidos")}</option>
            <option value="hide">{`${t("Hide Built with Eidos")} · Pro`}</option>
          </select>
          <small>
            {branding === "hide"
              ? t("Remove the badge from this published resource.")
              : t("New resources show the badge by default.")}
          </small>
        </label>

        <footer>
          <span className="publish-validation">{validation}</span>
          <button type="button" onClick={onClose}>
            {t("Cancel")}
          </button>
          <button
            type="submit"
            className="primary-action"
            disabled={validation !== null}
          >
            <Upload />
            {t("Publish")}
          </button>
        </footer>
      </form>
    </div>
  )
}
