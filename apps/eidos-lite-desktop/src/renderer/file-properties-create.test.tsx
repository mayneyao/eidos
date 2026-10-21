// @vitest-environment jsdom
import { act } from "react"
import { createRoot } from "react-dom/client"
import { FilePropertiesCreate } from "./file-properties-create"

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })

it("retains the property draft after a Runtime error and can retry without a physical column override", async () => {
  const host = document.createElement("div")
  document.body.append(host)
  const root = createRoot(host)
  const create = vi
    .fn()
    .mockRejectedValueOnce(new Error("Cannot write catalog"))
    .mockResolvedValue(undefined)
  try {
    await act(async () =>
      root.render(
        <FilePropertiesCreate
          disabled={false}
          onCreate={create}
          onCancel={vi.fn()}
        />
      )
    )
    const input = host.querySelector("input")!
    await act(async () => {
      Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        "value"
      )!.set!.call(input, "  Review note  ")
      input.dispatchEvent(new Event("input", { bubbles: true }))
    })
    const submit = async () =>
      act(async () => {
        host
          .querySelector("form")!
          .dispatchEvent(
            new Event("submit", { bubbles: true, cancelable: true })
          )
      })
    await submit()
    expect(host.querySelector('[role="alert"]')?.textContent).toBe(
      "Cannot write catalog"
    )
    expect(input.value).toBe("  Review note  ")
    await submit()
    expect(create).toHaveBeenCalledTimes(2)
    expect(create).toHaveBeenLastCalledWith({
      name: "Review note",
      type: "text",
    })
    expect(host.querySelector('[role="alert"]')).toBeNull()
  } finally {
    await act(async () => root.unmount())
    host.remove()
  }
})
