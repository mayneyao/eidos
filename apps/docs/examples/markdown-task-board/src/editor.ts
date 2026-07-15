import type { ExtensionFileEditorContext } from "@eidos.space/extension-sdk"

import "./editor.css"
import { parseMarkdownTasks, type MarkdownTask } from "./tasks"

type SaveState = "saving" | "saved" | "error"

function createElement<K extends keyof HTMLElementTagNameMap>(
  tagName: K,
  className?: string,
  text?: string
): HTMLElementTagNameMap[K] {
  const element = document.createElement(tagName)
  if (className) element.className = className
  if (text !== undefined) element.textContent = text
  return element
}

export function activate(context: ExtensionFileEditorContext) {
  const shell = createElement("main", "task-board")
  const header = createElement("header", "board-header")
  const titleGroup = createElement("div", "title-group")
  const eyebrow = createElement("p", "eyebrow", "MARKDOWN TASK BOARD")
  const title = createElement(
    "h1",
    "board-title",
    context.document.snapshot.resource.path.split("/").at(-1) ?? "Tasks"
  )
  const status = createElement("span", "save-status")
  const summary = createElement("div", "summary")
  const progressTrack = createElement("div", "progress-track")
  const progressBar = createElement("div", "progress-bar")
  const progressLabel = createElement("span", "progress-label")
  const columns = createElement("div", "board-columns")
  const openColumn = createElement("section", "task-column")
  const doneColumn = createElement("section", "task-column")
  const openList = createElement("div", "task-list")
  const doneList = createElement("div", "task-list")

  titleGroup.append(eyebrow, title)
  header.append(titleGroup, status)
  progressTrack.append(progressBar)
  summary.append(progressLabel, progressTrack)
  openColumn.append(createElement("h2", "column-title", "To do"), openList)
  doneColumn.append(createElement("h2", "column-title", "Completed"), doneList)
  columns.append(openColumn, doneColumn)
  shell.append(header, summary, columns)
  context.root.replaceChildren(shell)

  let saveState: SaveState | undefined
  let operationError: string | undefined
  const pendingOffsets = new Set<number>()

  const renderStatus = () => {
    const snapshot = context.document.snapshot
    status.className = "save-status"
    if (operationError) {
      status.classList.add("is-error")
      status.textContent = operationError
    } else if (snapshot.externalConflict) {
      status.classList.add("is-warning")
      status.textContent = "External change"
    } else if (snapshot.readOnly || !context.capabilities.editable) {
      status.textContent = "Read only"
    } else if (saveState === "saving") {
      status.textContent = "Saving…"
    } else if (saveState === "error") {
      status.classList.add("is-error")
      status.textContent = "Save failed"
    } else if (snapshot.dirty) {
      status.textContent = "Unsaved"
    } else {
      status.classList.add("is-saved")
      status.textContent = "Saved"
    }
  }

  const toggleTask = async (task: MarkdownTask) => {
    const snapshot = context.document.snapshot
    if (
      snapshot.readOnly ||
      !context.capabilities.editable ||
      pendingOffsets.has(task.markerOffset)
    ) {
      return
    }

    operationError = undefined
    pendingOffsets.add(task.markerOffset)
    render()
    try {
      await context.document.applyEdits([
        {
          start: task.markerOffset,
          end: task.markerOffset + 1,
          text: task.checked ? " " : "x",
        },
      ])
    } catch (error) {
      operationError =
        error instanceof Error ? error.message : "Unable to update this task"
      await context.document.resync().catch(() => undefined)
    } finally {
      pendingOffsets.delete(task.markerOffset)
      render()
    }
  }

  const createTaskCard = (task: MarkdownTask) => {
    const card = createElement("button", "task-card")
    card.type = "button"
    card.dataset.marker = String(task.markerOffset)
    card.disabled =
      context.document.snapshot.readOnly ||
      !context.capabilities.editable ||
      pendingOffsets.has(task.markerOffset)
    card.setAttribute("aria-pressed", String(task.checked))
    card.setAttribute(
      "aria-label",
      `${task.checked ? "Mark as not completed" : "Mark as completed"}: ${task.label}`
    )

    const checkbox = createElement("span", "task-checkbox")
    checkbox.setAttribute("aria-hidden", "true")
    checkbox.textContent = task.checked ? "✓" : ""
    const content = createElement("span", "task-content")
    const label = createElement("span", "task-label", task.label)
    const line = createElement("span", "task-line", `Line ${task.line}`)
    content.append(label, line)
    card.append(checkbox, content)
    card.addEventListener("click", () => void toggleTask(task))
    return card
  }

  const renderTaskList = (
    list: HTMLElement,
    tasks: MarkdownTask[],
    emptyMessage: string
  ) => {
    if (tasks.length === 0) {
      list.replaceChildren(createElement("p", "empty-state", emptyMessage))
      return
    }
    list.replaceChildren(...tasks.map(createTaskCard))
  }

  function render() {
    const focusedMarker =
      document.activeElement instanceof HTMLElement
        ? document.activeElement.dataset.marker
        : undefined
    const tasks = parseMarkdownTasks(context.document.snapshot.text)
    const open = tasks.filter((task) => !task.checked)
    const completed = tasks.filter((task) => task.checked)
    const percent = tasks.length
      ? Math.round((completed.length / tasks.length) * 100)
      : 0

    progressLabel.textContent = `${open.length} to do · ${completed.length} completed · ${percent}%`
    progressBar.style.width = `${percent}%`
    progressTrack.setAttribute("aria-label", `${percent}% completed`)
    progressTrack.setAttribute("role", "progressbar")
    progressTrack.setAttribute("aria-valuemin", "0")
    progressTrack.setAttribute("aria-valuemax", "100")
    progressTrack.setAttribute("aria-valuenow", String(percent))

    renderTaskList(openList, open, "No open tasks")
    renderTaskList(doneList, completed, "Nothing completed yet")
    renderStatus()

    if (focusedMarker) {
      shell
        .querySelector<HTMLElement>(`[data-marker="${focusedMarker}"]`)
        ?.focus({ preventScroll: true })
    }
  }

  context.subscriptions.add(
    context.document.onDidChange(() => {
      operationError = undefined
      render()
    })
  )
  context.subscriptions.add(context.document.onDidChangeState(render))
  context.subscriptions.add(
    context.document.onDidChangeSaveState((event) => {
      saveState = event.state
      renderStatus()
    })
  )

  render()

  return {
    dispose() {
      context.root.replaceChildren()
    },
  }
}
