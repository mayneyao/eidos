import type { CustomCell, CustomRenderer } from "@glideapps/glide-data-grid"

export type InferCustomRendererType<T> = T extends CustomRenderer<infer U>
  ? U
  : never
export type InferCustomCellProps<T> = T extends CustomCell<infer U> ? U : never


// only for type

export interface UserProfileCellProps {
  readonly kind: "user-profile-cell"
  readonly image: string
  readonly initial: string
  readonly tint: string
  readonly name?: string
}

export type UserProfileCell = CustomCell<UserProfileCellProps>


interface FileCellDataProps {
  readonly kind: "file-cell"
  readonly data: string[]
  readonly displayData: string[]
  readonly allowAdd?: boolean
  readonly proxyUrl?: string
}

export type FileCell = CustomCell<FileCellDataProps>


interface DatePickerCellProps {
  readonly kind: "date-picker-cell"
  readonly date: Date | undefined
  readonly displayDate: string
  readonly format: "date" | "datetime-local"
}

export type DatePickerCell = CustomCell<DatePickerCellProps>