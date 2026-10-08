import { expect, it } from "vitest"
import { resourceClipPath } from "./plugin-resource-clip"

it("cuts the visible popover out of a resource without changing its layout", () => {
  const rect = {
    x: 0,
    y: 0,
    width: 400,
    height: 300,
    clipTop: 10,
    clipRight: 0,
    clipBottom: 0,
    clipLeft: 0,
  }
  expect(
    resourceClipPath({
      ...rect,
      occlusions: [{ x: 300, y: -10, width: 168, height: 110 }],
    })
  ).toBe('path(evenodd, "M0 10H400V300H0ZM300 10H400V100H300Z")')
  expect(
    resourceClipPath({
      ...rect,
      occlusions: [{ x: 500, y: 0, width: 168, height: 110 }],
    })
  ).toBe(resourceClipPath(rect))
})
