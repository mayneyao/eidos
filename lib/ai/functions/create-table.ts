import { z } from "zod"
import { FieldType } from "@/lib/fields/const"

// Create an enum for field types based on FieldType
const fieldTypeEnum = z.enum([
    FieldType.Number,
    FieldType.Text,
    FieldType.Title,
    FieldType.Checkbox,
    FieldType.Date,
    FieldType.File,
    FieldType.MultiSelect,
    FieldType.Rating,
    FieldType.Select,
    FieldType.URL,
    FieldType.Formula,
    FieldType.Link,
    FieldType.Lookup,
    FieldType.CreatedTime,
    FieldType.CreatedBy,
    FieldType.LastEditedTime,
    FieldType.LastEditedBy,
])

const createTable = {
    name: "createTable",
    description: "create a table with specified fields",
    schema: z.object({
        name: z.string({
            description: "table name",
        }),
        fields: z.array(
            z.object({
                name: z.string({
                    description: "field name",
                }),
                type: fieldTypeEnum,
            })
        ),
    }),
}

export default createTable
