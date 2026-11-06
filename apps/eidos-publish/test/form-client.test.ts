// @vitest-environment jsdom
import { File } from "node:buffer"
import { webcrypto } from "node:crypto"
import { runInNewContext } from "node:vm"
import { afterEach, expect, it, vi } from "vitest"
import { FORM_CLIENT_SCRIPT } from "../src/form-client"
import { formDocument } from "../src/form"
import { formClientFixture } from "./form-client-fixture"

afterEach(() => vi.useRealTimers())

function fixture(
  options: {
    slug?: string
    success?: boolean
    language?: string
    fetch?: (url: string, init?: RequestInit) => Promise<Response>
  } = {}
) {
  const slug = options.slug ?? "feedback"
  const assign = vi.fn()
  const fetch = vi.fn(
    options.fetch ??
      (async (url: string) => {
        if (url.endsWith("/definition"))
          return Response.json({
            ...formClientFixture,
            submissionIntent: "test-intent",
          })
        if (url.endsWith("/init"))
          return Response.json({
            submissionId: "submission-1",
            state: "pending",
            attachments: [],
          })
        return Response.json({
          submissionId: "submission-1",
          state: "committed",
        })
      })
  )
  document.open()
  document.write(formDocument(slug, formClientFixture))
  document.close()
  const location = {
    pathname: options.success
      ? `/_eidos/forms/${encodeURIComponent(slug)}/success`
      : `/${slug}`,
    assign,
  }
  const history = {
    state: null as unknown,
    replaceState: vi.fn((state: unknown) => {
      history.state = state
    }),
  }
  const listeners = new Map<string, () => void>()
  runInNewContext(FORM_CLIENT_SCRIPT, {
    document,
    window: {
      addEventListener: (event: string, listener: () => void) => {
        listeners.set(event, listener)
      },
    },
    history,
    location,
    navigator: { language: options.language ?? "en-US" },
    crypto: webcrypto,
    fetch,
    AbortController,
    setTimeout,
    clearTimeout,
  })
  const form = document.querySelector("form")
  const button = document.querySelector<HTMLButtonElement>(
    "button[type=submit]"
  )
  const input = document.querySelector<HTMLTextAreaElement>("textarea")
  if (input) input.value = "Keep this response"
  return {
    assign,
    fetch,
    form,
    button,
    input,
    history,
    pageShow: () => listeners.get("pageshow")?.(),
    submit: () =>
      form!.dispatchEvent(
        new Event("submit", { bubbles: true, cancelable: true })
      ),
  }
}

it("keeps progress in the disabled button and ignores concurrent submissions", async () => {
  let release!: (response: Response) => void
  const response = new Promise<Response>((resolve) => {
    release = resolve
  })
  const f = fixture({ fetch: async () => response })
  f.submit()
  f.submit()
  expect(f.fetch).toHaveBeenCalledTimes(1)
  expect(f.button!.disabled).toBe(true)
  expect(f.button!.getAttribute("aria-busy")).toBe("true")
  expect(f.button!.querySelector(".submit-spinner")).not.toBeNull()
  expect(f.button!.querySelector<HTMLElement>(".submit-progress")!.hidden).toBe(
    false
  )
  expect(document.querySelector(".status")!.textContent).toBe("")
  expect(document.querySelector('[role="status"]')!.textContent).toBe(
    "Submitting…"
  )
  release(
    Response.json(
      { error: { message: "Service unavailable" } },
      { status: 503 }
    )
  )
  await vi.waitFor(() => expect(f.button!.disabled).toBe(false))
  expect(f.input!.value).toBe("Keep this response")
  expect(document.querySelector(".status")!.textContent).toBe(
    "Service unavailable"
  )
})

it("navigates only after a matching committed receipt, with no submitted data in the URL", async () => {
  const f = fixture({ slug: "调查/反馈 表" })
  f.submit()
  await vi.waitFor(() =>
    expect(f.assign).toHaveBeenCalledWith(
      "/_eidos/forms/" + encodeURIComponent("调查/反馈 表") + "/success"
    )
  )
  expect(f.fetch).toHaveBeenCalledTimes(3)
  expect(f.button!.disabled).toBe(true)
  expect(f.input!.value).toBe("Keep this response")
})

it("renders the separate success document on refresh without fetching or posting", () => {
  const f = fixture({ slug: "调查/反馈 表", success: true, language: "zh-CN" })
  expect(f.fetch).not.toHaveBeenCalled()
  expect(f.form).toBeNull()
  expect(document.querySelector("h1")!.textContent).toBe("提交成功")
  expect(document.querySelector(".form-success-message")!.textContent).toBe(
    formClientFixture.presentation.successMessage
  )
  expect(document.querySelector("a")!.getAttribute("href")).toBe(
    "/" + "调查/反馈 表".split("/").map(encodeURIComponent).join("/")
  )
  expect(document.querySelector("a")!.textContent).toBe("返回继续提交")
})

it("does not navigate on an unconfirmed or unrelated receipt", async () => {
  const f = fixture({
    fetch: async (url) => {
      if (url.endsWith("/definition"))
        return Response.json({
          ...formClientFixture,
          submissionIntent: "intent",
        })
      if (url.endsWith("/init"))
        return Response.json({ submissionId: "one", attachments: [] })
      return Response.json({ submissionId: "other", state: "committed" })
    },
  })
  f.submit()
  await vi.waitFor(() => expect(f.button!.disabled).toBe(false))
  expect(f.assign).not.toHaveBeenCalled()
  expect(document.querySelector(".is-error")!.textContent).toContain(
    "Submission failed"
  )
})

it("reuses the idempotency key after an initialization response is lost", async () => {
  const keys: string[] = []
  const f = fixture({
    fetch: async (url, init) => {
      if (url.endsWith("/definition"))
        return Response.json({
          ...formClientFixture,
          submissionIntent: "fresh-intent",
        })
      if (url.endsWith("/init")) {
        keys.push(JSON.parse(String(init!.body)).idempotencyKey)
        if (keys.length === 1) throw new Error("Network interrupted")
        return Response.json({ submissionId: "one", attachments: [] })
      }
      return Response.json({ submissionId: "one", state: "committed" })
    },
  })
  f.submit()
  await vi.waitFor(() => expect(f.button!.disabled).toBe(false))
  f.submit()
  await vi.waitFor(() => expect(f.assign).toHaveBeenCalledTimes(1))
  expect(keys).toHaveLength(2)
  expect(keys[0]).toBe(keys[1])
})

it("keeps selected files and resumes the same submission after a completion response is lost", async () => {
  let completions = 0
  const inits: unknown[] = []
  const f = fixture({
    fetch: async (url, init) => {
      if (url.endsWith("/definition"))
        return Response.json({
          ...formClientFixture,
          submissionIntent: "fresh-intent",
        })
      if (url.endsWith("/init")) {
        const body = JSON.parse(String(init!.body))
        inits.push(body)
        return Response.json({
          submissionId: "one",
          attachments: body.attachments.map(
            (item: { attachmentId: string }) => ({
              ...item,
              state: "pending",
              uploadUrl: "/upload",
            })
          ),
        })
      }
      if (url === "/upload") return Response.json({ ok: true })
      if (++completions === 1) throw new Error("Response lost after commit")
      return Response.json({ submissionId: "one", state: "committed" })
    },
  })
  const file = new File(["fixture attachment"], "evidence.txt", {
    type: "text/plain",
  })
  const input = document.querySelector<HTMLInputElement>('input[type="file"]')!
  Object.defineProperty(input, "files", { value: [file] })
  f.submit()
  await vi.waitFor(() => expect(f.button!.disabled).toBe(false))
  expect(input.files![0]).toBe(file)
  expect(f.input!.value).toBe("Keep this response")
  f.submit()
  await vi.waitFor(() => expect(f.assign).toHaveBeenCalledTimes(1))
  expect(inits).toHaveLength(1)
  expect(f.fetch.mock.calls.filter(([url]) => url === "/upload")).toHaveLength(
    1
  )
  expect(completions).toBe(2)
})

it("restores the form after a request timeout and retries the same identity", async () => {
  vi.useFakeTimers()
  const keys: string[] = []
  const f = fixture({
    fetch: async (url, init) => {
      if (url.endsWith("/definition"))
        return Response.json({
          ...formClientFixture,
          submissionIntent: "intent",
        })
      keys.push(JSON.parse(String(init!.body)).idempotencyKey)
      return await new Promise((_resolve, reject) =>
        init!.signal!.addEventListener("abort", () =>
          reject(new Error("aborted"))
        )
      )
    },
  })
  f.submit()
  await vi.advanceTimersByTimeAsync(60001)
  expect(f.button!.disabled).toBe(false)
  expect(f.input!.value).toBe("Keep this response")
  expect(document.querySelector(".is-error")!.textContent).toContain(
    "timed out"
  )
  f.submit()
  await vi.advanceTimersByTimeAsync(60001)
  expect(keys).toHaveLength(2)
  expect(keys[0]).toBe(keys[1])
})

it("gives a new response a fresh identity after returning from success", async () => {
  const first = fixture()
  first.submit()
  await vi.waitFor(() => expect(first.assign).toHaveBeenCalledTimes(1))
  const firstKey = JSON.parse(
    String(first.fetch.mock.calls[1]![1]!.body)
  ).idempotencyKey
  const second = fixture()
  expect(second.input!.value).toBe("Keep this response")
  second.submit()
  await vi.waitFor(() => expect(second.assign).toHaveBeenCalledTimes(1))
  expect(
    JSON.parse(String(second.fetch.mock.calls[1]![1]!.body)).idempotencyKey
  ).not.toBe(firstKey)
})

it("clears browser-restored inputs only when that history entry completed a response", async () => {
  const f = fixture()
  f.submit()
  await vi.waitFor(() => expect(f.assign).toHaveBeenCalledTimes(1))
  expect(f.history.state).toEqual({
    eidosFormCompleted: formClientFixture.publicationVersionId,
  })
  f.pageShow()
  await vi.waitFor(() =>
    expect(document.querySelector<HTMLTextAreaElement>("textarea")!.value).toBe(
      ""
    )
  )
  expect(f.history.state).toBeNull()
  const restoredInput = document.querySelector<HTMLTextAreaElement>("textarea")!
  restoredInput.value = "Unsubmitted draft"
  f.pageShow()
  await new Promise((resolve) => setTimeout(resolve, 5))
  expect(restoredInput.value).toBe("Unsubmitted draft")
})
