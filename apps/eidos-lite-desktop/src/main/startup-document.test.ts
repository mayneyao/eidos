import { createHash } from "node:crypto"
import { runInNewContext } from "node:vm"
import { startupDocument } from "./startup-document"

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
        querySelector: (selector: string) =>
          selector === ".art"
            ? art
            : selector === "canvas"
              ? { getContext: () => context }
              : { getAttribute: () => "M0 0" },
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
    for (let time = 1; pending && time <= 401; time += 40) {
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
