import { createHash } from "node:crypto"
import { runInNewContext } from "node:vm"
import { startupDocument, withStartupShell } from "./startup-document"

it.each([false, true])(
  "settles the logo and stops scheduling frames (reduced motion: %s)",
  (reduced) => {
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
          dataset: {},
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
    if (reduced) expect(schedule).not.toHaveBeenCalled()
  }
)

it("places the logo ahead of React without a second document or animation timer", () => {
  const html = withStartupShell(
    `<meta content="script-src 'self';"><div id="root"></div>`
  )
  const script = html.match(/<script>([\s\S]*?)<\/script>/)![1]!
  expect(() => new Function(script)).not.toThrow()
  expect(html).toContain(
    `'sha256-${createHash("sha256").update(script).digest("base64")}'`
  )
  expect(html.indexOf('id="lite-startup"')).toBeLessThan(
    html.indexOf('id="root"')
  )
  expect(script).not.toContain("setTimeout")
})

it.each(["light", "dark", "system"])(
  "uses the saved %s appearance before React starts",
  (appearance) => {
    const html = withStartupShell('<div id="root"></div>')
    const script = html.match(/<script>([\s\S]*?)<\/script>/)![1]!
    const style: Record<string, string> = {}
    runInNewContext(script, {
      URLSearchParams,
      location: { hash: "#/opening", search: `?appearance=${appearance}` },
      navigator: { language: "en" },
      document: {
        documentElement: { style },
        querySelector: () => ({}),
        getElementById: () => ({
          querySelector: () => ({ getContext: () => null }),
        }),
      },
    })
    expect(style.colorScheme).toBe(
      appearance === "system" ? undefined : appearance
    )
  }
)
