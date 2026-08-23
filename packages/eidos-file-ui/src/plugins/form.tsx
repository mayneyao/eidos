import {
  isEidosFileFormInputField,
  type EidosFileFormViewProperties,
} from "@eidos.space/eidos-file"
import { ListPlus } from "lucide-react"

import { EidosFileFormView } from "../eidos-file-form-view"
import { defineEidosFilePlugin } from "../plugin"

export const eidosFileFormPlugin = defineEidosFilePlugin({
  id: "@eidos.space/eidos-file-ui/form",
  views: [
    {
      type: "form",
      label: "Form",
      description: "Collect records through a form",
      icon: ListPlus,
      renderer: EidosFileFormView,
      create: {
        defaultName: "Form",
        isAvailable: (fields) => fields.some(isEidosFileFormInputField),
        properties: (fields): Record<string, unknown> =>
          ({
            title: "Form",
            description: null,
            submitLabel: "Submit",
            successMessage: "Response recorded.",
            fields: fields.filter(isEidosFileFormInputField).map((field) => ({
              fieldId: field.id,
              required: field.nullable === false,
            })),
          }) satisfies EidosFileFormViewProperties,
      },
    },
  ],
})
