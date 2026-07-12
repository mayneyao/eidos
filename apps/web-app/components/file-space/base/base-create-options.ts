import type { CreateBaseOptions } from "@eidos.space/base"

export type BaseTemplateId = "blank" | "tasks"

const TASK_STATUS_OPTIONS = [
  { id: "not-started", name: "Not started", color: "gray" },
  { id: "in-progress", name: "In progress", color: "blue" },
  { id: "done", name: "Done", color: "green" },
]

export function baseOptionsForTemplate(
  title: string,
  template: BaseTemplateId
): CreateBaseOptions {
  if (template === "tasks") {
    return {
      title,
      defaultTable: {
        name: "Tasks",
        fields: [
          {
            name: "Status",
            columnName: "status",
            type: "select",
            property: { options: TASK_STATUS_OPTIONS },
          },
          {
            name: "Priority",
            columnName: "priority",
            type: "select",
            property: {
              options: [
                { id: "low", name: "Low", color: "gray" },
                { id: "medium", name: "Medium", color: "yellow" },
                { id: "high", name: "High", color: "red" },
              ],
            },
          },
          { name: "Due", columnName: "due", type: "date" },
          { name: "Done", columnName: "done", type: "checkbox" },
        ],
      },
    }
  }
  return { title, defaultTable: { name: "Table" } }
}

export function normalizeBaseFileName(value: string): string {
  const trimmed = value.trim()
  if (!trimmed) return ""
  return trimmed.toLowerCase().endsWith(".base") ? trimmed : `${trimmed}.base`
}
