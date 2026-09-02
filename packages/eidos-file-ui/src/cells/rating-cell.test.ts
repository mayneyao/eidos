import { describe, expect, it } from "vitest"

import ratingRenderer, { type RatingCell } from "./rating-cell"

describe("RatingCell paste", () => {
  const data: RatingCell["data"] = { kind: "rating-cell", rating: 3 }

  it("accepts only whole ratings in the Grid range", () => {
    expect(ratingRenderer.onPaste?.("5", data)).toMatchObject({ rating: 5 })
    expect(ratingRenderer.onPaste?.("3.5", data)).toMatchObject({ rating: 3 })
    expect(ratingRenderer.onPaste?.("9", data)).toMatchObject({ rating: 3 })
    expect(ratingRenderer.onPaste?.("invalid", data)).toMatchObject({
      rating: 3,
    })
  })
})
