import { describe, expect, it } from "vitest"

import {
  eidosFileFormViewFields,
  eidosFileFormViewProperties,
  isEidosFileFormInputField,
} from "./form-view"
import type {
  EidosFileFieldInfo,
  EidosFileTableSnapshot,
  EidosFileViewInfo,
} from "./types"

const now = "2026-08-23T00:00:00.000Z"

function field(
  id: string,
  type: EidosFileFieldInfo["type"],
  overrides: Partial<EidosFileFieldInfo> = {}
): EidosFileFieldInfo {
  return {
    id,
    tableId: "contacts",
    name: id,
    type,
    tableName: "Contacts",
    tableColumnName: id,
    physicalName: id,
    nullable: true,
    position: 0,
    property: null,
    storageCodec: type === "multi-select" ? "json_array" : "scalar",
    valueKind: "source",
    isHidden: false,
    isDerived: false,
    sourceTableColumnName: null,
    dependsOn: null,
    ...overrides,
  }
}

function view(overrides: Partial<EidosFileViewInfo> = {}): EidosFileViewInfo {
  return {
    id: "intake",
    name: "Contact us",
    type: "form",
    tableId: "contacts",
    query: "",
    properties: null,
    filter: null,
    sorts: [],
    orderMap: null,
    hiddenFields: [],
    position: 0,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  }
}

function table(fields: EidosFileFieldInfo[]): EidosFileTableSnapshot {
  return {
    table: {
      id: "contacts",
      name: "Contacts",
      rawTableName: "tb_contacts",
      position: 0,
      icon: null,
      description: null,
      createdAt: now,
      updatedAt: now,
    },
    fields,
    views: [],
    rowCount: 0,
  }
}

describe("Eidos File Form View", () => {
  it("accepts only writable source fields", () => {
    expect(isEidosFileFormInputField(field("name", "text"))).toBe(true)
    expect(
      isEidosFileFormInputField(
        field("runtime-name", "text", {
          tableColumnName: "019fd59a-99e7-7f28-b3da-89dc449efa4c",
          physicalName: null,
          valueKind: "source",
        })
      )
    ).toBe(true)
    expect(
      isEidosFileFormInputField(
        field("formula", "formula", {
          physicalName: null,
          valueKind: "derived",
          isDerived: true,
        })
      )
    ).toBe(false)
    expect(
      isEidosFileFormInputField(field("hidden", "text", { isHidden: true }))
    ).toBe(false)
  })

  it("uses stable field IDs for visibility and ordering", () => {
    const name = field("name", "text", { position: 0 })
    const email = field("email", "url", { position: 1 })
    const hidden = field("internal", "text", { position: 2 })
    const fields = eidosFileFormViewFields(
      table([name, email, hidden]),
      view({
        hiddenFields: ["internal"],
        orderMap: { email: 0, name: 1 },
      })
    )
    expect(fields.map((candidate) => candidate.id)).toEqual(["email", "name"])
  })

  it("normalizes presentation and makes non-null fields required", () => {
    const name = field("name", "text", { nullable: false })
    const email = field("email", "url")
    const properties = eidosFileFormViewProperties(
      view({
        properties: {
          title: "  Join the list  ",
          description: "Product updates",
          submitLabel: "Join",
          successMessage: "You're in.",
          fields: [
            {
              fieldId: "email",
              required: true,
              placeholder: "you@example.com",
              multiline: true,
            },
            { fieldId: "name", required: true, multiline: true },
          ],
        },
      }),
      [name, email]
    )
    expect(properties).toEqual({
      title: "Join the list",
      description: "Product updates",
      submitLabel: "Join",
      successMessage: "You're in.",
      fields: [
        { fieldId: "name", multiline: true, required: true },
        {
          fieldId: "email",
          placeholder: "you@example.com",
          required: true,
        },
      ],
    })
  })
})
