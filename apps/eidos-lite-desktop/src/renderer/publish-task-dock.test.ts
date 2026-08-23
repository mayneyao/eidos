import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it, vi } from "vitest"

import type { EidosPublishResult } from "../shared/contracts"

vi.mock("./i18n", () => ({
  useEidosLiteI18n: () => ({ t: (message: string) => message }),
}))

import {
  PublishTaskDock,
  updatePublishTaskProgress,
  type PublishTaskState,
} from "./publish-task-dock"

const task: PublishTaskState = {
  requestId: "publish-1",
  entry: {
    name: "large.eidos",
    relativePath: "data/large.eidos",
    kind: "eidos",
    size: 437_260_288,
    modifiedAtMs: 1,
  },
  anchorX: 120,
  anchorY: 240,
  slug: "large",
  status: "running",
  progress: {
    requestId: "publish-1",
    kind: "stage",
    message: "starting Publish",
  },
}

describe("Publish task dock", () => {
  it("accepts progress only for the active background task", () => {
    const next = updatePublishTaskProgress(task, {
      requestId: "publish-1",
      kind: "bytes",
      label: "uploading part 3/7",
      currentBytes: "67108864",
      totalBytes: "67108864",
      percent: 100,
    })

    expect(next?.progress).toMatchObject({
      kind: "bytes",
      label: "uploading part 3/7",
      percent: 100,
    })
  })

  it("ignores stale progress after another task has taken its place", () => {
    const next = updatePublishTaskProgress(task, {
      requestId: "publish-old",
      kind: "stage",
      message: "creating immutable Version",
    })

    expect(next).toBe(task)
  })

  it("renders the running task as a non-modal compact control", () => {
    const markup = renderToStaticMarkup(
      createElement(PublishTaskDock, {
        task,
        expanded: false,
        onExpandedChange: () => undefined,
        onDismiss: () => undefined,
        onRetry: () => undefined,
        onCollect: () => undefined,
      })
    )

    expect(markup).toContain("publish-task-dock is-compact")
    expect(markup).toContain('aria-label="Expand Publish"')
    expect(markup).not.toContain('role="dialog"')
  })

  it("expands progress without becoming a blocking dialog", () => {
    const markup = renderToStaticMarkup(
      createElement(PublishTaskDock, {
        task,
        expanded: true,
        onExpandedChange: () => undefined,
        onDismiss: () => undefined,
        onRetry: () => undefined,
        onCollect: () => undefined,
      })
    )

    expect(markup).toContain("publish-task-dock is-expanded")
    expect(markup).toContain('aria-label="Minimize Publish"')
    expect(markup).toContain(
      "Publish continues in the background while you work."
    )
    expect(markup).not.toContain('role="dialog"')
  })

  it("distinguishes an unchanged publish from a newly created Version", () => {
    const unchanged: PublishTaskState = {
      ...task,
      status: "succeeded",
      result: {
        versionCreated: false,
        url: "https://u-example.eidos.ink/large",
      } as EidosPublishResult,
    }
    const markup = renderToStaticMarkup(
      createElement(PublishTaskDock, {
        task: unchanged,
        expanded: true,
        onExpandedChange: () => undefined,
        onDismiss: () => undefined,
        onRetry: () => undefined,
        onCollect: () => undefined,
      })
    )

    expect(markup).toContain("Already up to date")
    expect(markup).not.toContain("Published successfully")
  })
})
