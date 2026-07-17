import {
  EIDOS_FILE_EXTENSION,
  type CreateEidosFileOptions,
  type CreateEidosFileTableInput,
} from "@eidos.space/eidos-file"

import type { FileSpaceEidosFileTemplate } from "@/apps/web-app/store/file-space-settings"

export type EidosFileTemplateId = FileSpaceEidosFileTemplate

const TASK_STATUS_OPTIONS = [
  { value: "Not started", color: "gray" },
  { value: "In progress", color: "blue" },
  { value: "Done", color: "green" },
]

export function eidosFileDefaultTableForTemplate(
  template: EidosFileTemplateId
): CreateEidosFileTableInput {
  if (template === "tasks") {
    return {
      name: "Tasks",
      fields: [
        {
          name: "Status",
          columnName: "status",
          type: "select",
          property: {
            options: TASK_STATUS_OPTIONS.map((option) => ({ ...option })),
          },
        },
        {
          name: "Priority",
          columnName: "priority",
          type: "select",
          property: {
            options: [
              { value: "Low", color: "gray" },
              { value: "Medium", color: "yellow" },
              { value: "High", color: "red" },
            ],
          },
        },
        { name: "Due", columnName: "due", type: "date" },
        { name: "Done", columnName: "done", type: "checkbox" },
      ],
    }
  }
  return { name: "Table" }
}

export function eidosFileOptionsForTemplate(
  title: string,
  template: EidosFileTemplateId
): CreateEidosFileOptions {
  return { title, defaultTable: eidosFileDefaultTableForTemplate(template) }
}

export function normalizeEidosFileName(value: string): string {
  const trimmed = value.trim()
  if (!trimmed) return ""
  return trimmed.toLowerCase().endsWith(EIDOS_FILE_EXTENSION)
    ? trimmed
    : `${trimmed}${EIDOS_FILE_EXTENSION}`
}
