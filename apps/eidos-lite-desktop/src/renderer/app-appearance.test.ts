import { applyAppearance, resolveAppearance } from "./app-appearance"

describe("Eidos Lite appearance", () => {
  it("resolves system, light, and dark preferences", () => {
    expect(resolveAppearance("system", true)).toBe("dark")
    expect(resolveAppearance("system", false)).toBe("light")
    expect(resolveAppearance("light", true)).toBe("light")
    expect(resolveAppearance("dark", false)).toBe("dark")
  })

  it("applies the resolved theme to the document root", () => {
    const classes = new Set<string>()
    const root = {
      dataset: {} as Record<string, string>,
      style: {} as Record<string, string>,
      classList: {
        toggle(name: string, force: boolean) {
          if (force) classes.add(name)
          else classes.delete(name)
        },
        contains(name: string) {
          return classes.has(name)
        },
      },
    } as unknown as HTMLElement

    expect(applyAppearance(root, "dark", false)).toBe("dark")
    expect(root.dataset.theme).toBe("dark")
    expect(root.classList.contains("dark")).toBe(true)

    applyAppearance(root, "light", true)
    expect(root.dataset.theme).toBe("light")
    expect(root.classList.contains("dark")).toBe(false)
  })
})
