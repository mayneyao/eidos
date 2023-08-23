import { CustomCell, CustomRenderer } from "@glideapps/glide-data-grid"

export type InferCustomRendererType<T> = T extends CustomRenderer<infer U>
  ? U
  : never
export type InferCustomCellProps<T> = T extends CustomCell<infer U> ? U : never
