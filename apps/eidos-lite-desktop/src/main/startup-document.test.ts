import { createHash } from "node:crypto"
import { runInNewContext } from "node:vm"
import { startupDocument, withStartupShell } from "./startup-document"

it("continues the logo timeline ahead of React with an exact CSP hash", () => {
  const html = withStartupShell(
    `<meta content="script-src 'self';"><div id="root"></div>`
  )
  const script = html.match(/<script>([\s\S]*?)<\/script>/)![1]!
  expect(html).toContain(
    `'sha256-${createHash("sha256").update(script).digest("base64")}'`
  )
  expect(script).toContain('get("startupAt")')
  expect(html).not.toContain('data-settled="true"')
  expect(html.indexOf('id="lite-startup"')).toBeLessThan(
    html.indexOf('id="root"')
  )
  expect(html).not.toContain("setTimeout")
})

it.each([
  [false, 0],
  [true, 0],
  [false, 550],
  [false, 1000],
] as const)(
  "settles the logo without restarting (reduced motion: %s, elapsed: %s ms)",
  (reduced, elapsed) => {
    const html = startupDocument("zh-CN")
    const script = html.match(/<script>([\s\S]*?)<\/script>/)![1]!
    expect(html).toContain(
      `'sha256-${createHash("sha256").update(script).digest("base64")}'`
    )
    expect(html).toContain("正在打开…")
    const art = { dataset: {} }
    const context = {
      setTransform: vi.fn(),
      clearRect: vi.fn(),
      beginPath: vi.fn(),
      moveTo: vi.fn(),
      arc: vi.fn(),
      fill: vi.fn(),
      isPointInPath: () => true,
    }
    let pending: ((time: number) => void) | undefined
    const schedule = vi.fn((callback: (time: number) => void) => {
      pending = callback
      return 1
    })
    runInNewContext(script, {
      document: {
        hidden: false,
        getElementById: () => ({
          dataset: { startedAt: "100" },
          querySelector: (selector: string) =>
            selector === ".art"
              ? art
              : selector === "canvas"
                ? { getContext: () => context, style: {} }
                : { getAttribute: () => "M0 0" },
        }),
        addEventListener: vi.fn(),
      },
      window: { addEventListener: vi.fn() },
      Date: { now: () => 100 + elapsed },
      Path2D: class {},
      devicePixelRatio: 1,
      matchMedia: (query: string) => ({
        matches: query.includes("reduced") && reduced,
        addEventListener: vi.fn(),
      }),
      getComputedStyle: () => ({ color: "#555" }),
      requestAnimationFrame: schedule,
      cancelAnimationFrame: vi.fn(),
    })
    for (let time = 1; pending && time <= 801; time += 40) {
      const callback = pending
      pending = undefined
      callback(time)
    }
    expect(pending).toBeUndefined()
    expect(context.fill).toHaveBeenCalled()
    expect(art.dataset).toEqual({ ready: "true" })
    if (reduced || elapsed >= 600) expect(schedule).not.toHaveBeenCalled()
  }
)
