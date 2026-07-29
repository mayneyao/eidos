// @vitest-environment jsdom

import { act, createElement } from "react"
import { createRoot } from "react-dom/client"

import type { EidosFileIssue } from "../shared/contracts"
import { FileRecoveryNotice } from "./file-recovery-notice"

const issue: EidosFileIssue = {
  relativePath: "data/tasks.eidos",
  sessionId: "session-1",
  reason: "replaced",
  title: "Eidos File was replaced",
  message: "Another process replaced this path.",
  retryable: true,
  canReveal: true,
  canReviewHistory: true,
  localSafe: true,
}

it("offers only explicit non-destructive file recovery actions", async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  const host = document.createElement("div")
  document.body.append(host)
  const root = createRoot(host)
  const onRetry = vi.fn()
  const onReveal = vi.fn()
  const onReviewHistory = vi.fn()
  await act(async () => {
    root.render(
      createElement(FileRecoveryNotice, {
        issue,
        canRetry: true,
        canReviewHistory: true,
        onRetry,
        onReveal,
        onReviewHistory,
        onDismiss: vi.fn(),
      })
    )
  })

  expect(host.querySelector("[data-file-issue='replaced']")).not.toBeNull()
  expect(host.textContent).toContain("Original local file preserved")
  for (const [selector, callback] of [
    ["[data-file-retry]", onRetry],
    ["[data-file-reveal]", onReveal],
    ["[data-file-history]", onReviewHistory],
  ] as const) {
    await act(async () => {
      host
        .querySelector<HTMLButtonElement>(selector)
        ?.dispatchEvent(new MouseEvent("click", { bubbles: true }))
    })
    expect(callback).toHaveBeenCalledOnce()
  }

  await act(async () => root.unmount())
  host.remove()
})
