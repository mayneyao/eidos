import { UserProfileCell } from "@/components/grid/cells/user-profile-cell"

import { BaseField } from "./base"
import { CompareOperator, FieldType, GridCellKind } from "./const"

type CreatedByProperty = {}

export type UserFieldContext = {
  userMap?: {
    [id: string]: {
      name: string
      avatar?: string
    }
  }
}

export class CreatedByField extends BaseField<
  UserProfileCell,
  CreatedByProperty,
  string,
  UserFieldContext
> {
  static type = FieldType.CreatedBy

  rawData2JSON(rawData: string) {
    return rawData
  }

  get compareOperators() {
    return [
      CompareOperator.Equal,
      CompareOperator.NotEqual,
      CompareOperator.IsEmpty,
      CompareOperator.IsNotEmpty,
    ]
  }

  getCellContent(
    rawData: string | undefined,
    context?: UserFieldContext
  ): UserProfileCell {
    const { userMap } = context || {}
    const user = userMap?.[rawData || ""] || {
      name: "unknown",
    }
    return {
      kind: GridCellKind.Custom,
      data: {
        image: user.avatar || "",
        kind: "user-profile-cell",
        initial: user.name,
        tint: "#233",
        name: user.name,
      },
      copyData: rawData || "",
      allowOverlay: false,
      readonly: true,
    }
  }
  cellData2RawData(cell: UserProfileCell) {
    return {
      rawData: cell.data || null,
    }
  }
}
