import type { CreateBaseOptions, CreateBaseTableInput } from "@eidos.space/base"

import type { FileSpaceBaseTemplate } from "@/apps/web-app/store/file-space-settings"

export type BaseTemplateId = FileSpaceBaseTemplate

const TASK_STATUS_OPTIONS = [
  { value: "Not started", color: "gray" },
  { value: "In progress", color: "blue" },
  { value: "Done", color: "green" },
]

export function baseDefaultTableForTemplate(
  template: BaseTemplateId
): CreateBaseTableInput {
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

export function baseOptionsForTemplate(
  title: string,
  template: BaseTemplateId
): CreateBaseOptions {
  return { title, defaultTable: baseDefaultTableForTemplate(template) }
}

export function normalizeBaseFileName(value: string): string {
  const trimmed = value.trim()
  if (!trimmed) return ""
  return trimmed.toLowerCase().endsWith(".base") ? trimmed : `${trimmed}.base`
}
