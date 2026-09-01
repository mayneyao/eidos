import { EIDOS_FILE_FIELD_TYPE_OPTIONS } from "./eidos-file-field-type-picker"
import { headerIcons } from "./header-icons"

describe("Grid header icons", () => {
  it("provides a sprite for every field type that can appear as a Grid column", () => {
    const gridFieldTypes = [
      ...EIDOS_FILE_FIELD_TYPE_OPTIONS.map((option) => option.value),
      "row-id",
      "created-time",
      "last-edited-time",
    ]

    expect(Object.keys(headerIcons)).toEqual(
      expect.arrayContaining(gridFieldTypes)
    )
  })
})
