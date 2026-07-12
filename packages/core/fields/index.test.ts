import type { IField } from "../types/IField"

import { CheckboxField } from "./checkbox"
import { FieldType } from "./const"
import { getFieldInstance } from "./index"

describe("field registry module initialization", () => {
  it("initializes BaseField before concrete field classes", () => {
    const field: IField = {
      name: "Done",
      property: {},
      table_column_name: "done",
      table_name: "tasks",
      type: FieldType.Checkbox,
    }

    const instance = getFieldInstance<CheckboxField>(field)
    expect(instance).toBeInstanceOf(CheckboxField)
    expect(instance.entityFieldInstance).toBe(instance)
  })
})
