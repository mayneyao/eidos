import { useState } from "react"
import { LoaderCircle, X } from "lucide-react"
import type { SpaceTreeEntry } from "../shared/contracts"
import { useEidosLiteI18n } from "./i18n"

type PathDialogAction =
  | "create-file"
  | "create-folder"
  | "create-linked-note"
  | "delete"

export interface PathDialogState {
  action: PathDialogAction
  entry: SpaceTreeEntry | null
  linkedNotePath?: string
}

export function PathActionDialog({
  state,
  busy,
  onCancel,
  onSubmit,
}: {
  state: PathDialogState
  busy: boolean
  onCancel(): void
  onSubmit(value: string): void
}) {
  const { t } = useEidosLiteI18n()
  const config = {
    "create-linked-note": {
      title: t("Create linked note?"),
      label: t("Note path"),
      initial: state.linkedNotePath ?? "",
      action: t("Create"),
    },
    "create-file": {
      title: t("New File"),
      label: t("File name"),
      initial: "Untitled.eidos",
      action: t("Create"),
    },
    "create-folder": {
      title: t("New folder"),
      label: t("Folder name"),
      initial: t("New folder"),
      action: t("Create"),
    },
    delete: {
      title: t("Move {name} to Trash?", {
        name: state.entry?.name ?? t("item"),
      }),
      label: "",
      initial: "",
      action: t("Move to Trash"),
    },
  }[state.action]
  const [value, setValue] = useState(config.initial)
  const destructive = state.action === "delete"
  const description =
    state.action === "create-file"
      ? t(
          "Use .eidos for an Eidos File. Another extension, such as .md or .txt, creates an empty text file. Names without an extension use .eidos."
        )
      : state.action === "create-linked-note"
        ? t(
            "This note does not exist. Create an empty Markdown file at this path? Existing folders are required."
          )
        : null

  return (
    <div className="path-dialog-backdrop" role="presentation">
      <form
        className="path-dialog"
        aria-label={config.title}
        onSubmit={(event) => {
          event.preventDefault()
          if (busy) return
          onSubmit(value)
        }}
      >
        <header>
          <strong>{config.title}</strong>
          <button
            type="button"
            className="icon-button"
            onClick={onCancel}
            aria-label={t("Cancel")}
            disabled={busy}
          >
            <X />
          </button>
        </header>
        {destructive ? (
          <p>
            {t(
              "The item will leave this Space and can be recovered from the system Trash."
            )}
          </p>
        ) : (
          <label>
            <span>{config.label}</span>
            <input
              autoFocus
              value={value}
              onChange={(event) => setValue(event.target.value)}
              disabled={busy}
              readOnly={state.action === "create-linked-note"}
            />
            {description ? (
              <small className="path-dialog-description">{description}</small>
            ) : null}
          </label>
        )}
        <footer>
          <button type="button" onClick={onCancel} disabled={busy}>
            {t("Cancel")}
          </button>
          <button
            type="submit"
            className={destructive ? "danger-action" : "primary-action"}
            disabled={busy || (!destructive && !value.trim())}
          >
            {busy ? <LoaderCircle className="spin" /> : null}
            {busy ? t("Working…") : config.action}
          </button>
        </footer>
      </form>
    </div>
  )
}
