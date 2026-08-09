import type { CreateEidosFileTableInput } from "@eidos.space/eidos-file"
import type { EidosFileEmptyStateTemplate } from "@eidos.space/eidos-file-ui/eidos-file-empty-state"

export type ServeEditorState = "loading" | "empty" | "editor"

export function resolveServeEditorState(input: {
  bootPhase: "loading" | "no-manifest" | "opening" | "ready" | "error"
  hasSnapshot: boolean
  hasClient: boolean
  hasActiveTable: boolean
}): ServeEditorState {
  if (input.bootPhase !== "ready" || !input.hasSnapshot || !input.hasClient) {
    return "loading"
  }
  return input.hasActiveTable ? "editor" : "empty"
}

export function firstTableTemplate(
  template: EidosFileEmptyStateTemplate,
  locale: "en" | "zh"
): CreateEidosFileTableInput {
  if (template === "blank") {
    return { name: locale === "zh" ? "数据表" : "Table" }
  }
  return {
    name: locale === "zh" ? "任务" : "Tasks",
    fields: [
      {
        name: locale === "zh" ? "任务" : "Task",
        type: "text",
        nullable: true,
        isRecordLabel: true,
      },
      {
        name: locale === "zh" ? "状态" : "Status",
        type: "select",
        nullable: true,
        property: {
          options:
            locale === "zh"
              ? [
                  { name: "待处理", color: "gray" },
                  { name: "进行中", color: "blue" },
                  { name: "已完成", color: "green" },
                ]
              : [
                  { name: "To do", color: "gray" },
                  { name: "In progress", color: "blue" },
                  { name: "Done", color: "green" },
                ],
        },
      },
      {
        name: locale === "zh" ? "截止日期" : "Due date",
        type: "date",
        nullable: true,
      },
    ],
  }
}
