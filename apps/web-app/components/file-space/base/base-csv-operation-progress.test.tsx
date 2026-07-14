// @vitest-environment jsdom

import { act } from "react"
import { createRoot, type Root } from "react-dom/client"

import { BaseCsvOperationProgressBar } from "./base-csv-operation-progress"

;(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true

describe("BaseCsvOperationProgressBar", () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    container = document.createElement("div")
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
  })

  it("clamps progress and animates with a reduced-motion-safe transform", () => {
    act(() => {
      root.render(
        <BaseCsvOperationProgressBar
          label="Importing rows"
          detail={null}
          percent={125}
        />
      )
    })

    const progress = container.querySelector<HTMLElement>(
      '[role="progressbar"]'
    )
    const indicator = progress?.firstElementChild as HTMLElement | null
    expect(progress?.getAttribute("aria-valuenow")).toBe("100")
    expect(indicator?.style.transform).toBe("scaleX(1)")
    expect(indicator?.className).toContain("transition-transform")
    expect(indicator?.className).toContain("motion-reduce:transition-none")

    act(() => {
      root.render(
        <BaseCsvOperationProgressBar
          label="Importing rows"
          detail={null}
          percent={-25}
        />
      )
    })
    expect(progress?.getAttribute("aria-valuenow")).toBe("0")
    expect(indicator?.style.transform).toBe("scaleX(0)")
  })
})
